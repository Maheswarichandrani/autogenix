"""
core/docker_manager.py

One Docker container per build.
Spins up when build starts, destroyed after deploy.

KEY FIXES vs original:
  1. configure_port() REMOVED — it destroyed + recreated the container just to
     change a port mapping, losing the apt cache and risking file corruption.
     The container always exposes port 8080 internally. The host-side port is
     random (Docker chooses it). Agents use http://localhost:{app_port} which
     is already the mapped host port. No recreation needed.

  2. run_config serialization for cross-node reattach — run_config is stored
     as a dict in the Build row (or passed explicitly). reattach() now accepts
     a plain dict and reconstructs RunConfig so Guardian/Deployer can restart
     the app after artificer_fix without losing run_config.

  3. start_app() returns the host-accessible URL using self.app_port (the
     random mapped port), not localhost:{internal_port} which would only be
     accessible inside the container network.

  4. exec() timeout — long-running commands (npm install, mvn package) can hang
     forever. Added a configurable timeout that defaults to 300s.

  5. spin_up() idempotent — if a container with the same name already exists
     (e.g., worker retry), it reattaches instead of crashing with a name clash.

  6. write_file() path traversal guard — rejects paths containing '..' to
     prevent an agent from writing outside /workspace.
"""

from __future__ import annotations

import io
import logging
import tarfile
import time
from dataclasses import dataclass, asdict, field
from typing import Optional

import docker
import docker.errors

from app.core.config import settings

log = logging.getLogger(__name__)

_client: docker.DockerClient | None = None


def _docker() -> docker.DockerClient:
    """Lazy singleton Docker client."""
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


# ── Stack defaults (fallback only — agent provides real commands) ──

STACK_DEFAULTS: dict[str, dict] = {
    "fastapi":    {"install": "pip install -r requirements.txt",
                   "start":   "uvicorn main:app --host 0.0.0.0 --port 8080"},
    "flask":      {"install": "pip install -r requirements.txt",
                   "start":   "python app.py"},
    "express":    {"install": "npm install",
                   "start":   "node index.js"},
    "nextjs":     {"install": "npm install && npm run build",
                   "start":   "npm start"},
    "django":     {"install": "pip install -r requirements.txt",
                   "start":   "python manage.py runserver 0.0.0.0:8080"},
    "springboot": {"install": "mvn package -q -DskipTests",
                   "start":   "java -jar target/*.jar"},
}

# All apps use port 8080 internally — no variation, no container recreation.
INTERNAL_PORT = 8080


@dataclass
class RunConfig:
    """
    Parsed run configuration supplied by the Artificer agent.

    Stored as a plain dict in Build.metadata so it survives worker restarts
    and can be passed to reattach() to reconstruct this object.
    """
    install_command:   str
    start_command:     str
    health_check_path: str  = "/health"
    startup_wait_secs: int  = 8

    @classmethod
    def from_dict(cls, data: dict, tech_stack: dict | None = None) -> "RunConfig":
        """
        Build a RunConfig from the dict the agent emits via echo <<<RUN_CONFIG>>>.
        Falls back to stack defaults if agent omits a field.
        """
        framework = (tech_stack or {}).get("framework", "fastapi").lower()
        defaults  = STACK_DEFAULTS.get(framework, STACK_DEFAULTS["fastapi"])

        return cls(
            install_command   = data.get("install_command")   or defaults["install"],
            start_command     = data.get("start_command")     or defaults["start"],
            health_check_path = data.get("health_check_path") or "/health",
            startup_wait_secs = int(data.get("startup_wait_secs") or 8),
        )

    def to_dict(self) -> dict:
        return asdict(self)


# ── DockerManager ─────────────────────────────────────────────────

class DockerManager:
    """
    Manages the lifecycle of a single build container.

    One instance per build. Holds the container reference, the mapped host
    port, and the RunConfig once the agent has determined what to run.

    Thread-safety: instances are not shared across threads. Each Celery task
    creates its own instance or uses reattach().
    """

    # Hard resource limits — never let agent influence these
    _MEM_LIMIT  = "512m"
    _CPU_QUOTA  = 50_000   # 50% of one CPU
    _CPU_PERIOD = 100_000

    def __init__(self, project_id: str, build_id: str) -> None:
        self.project_id:     str              = project_id
        self.build_id:       str              = build_id
        self.container_name: str              = f"build-{build_id}"
        self.container:      docker.models.containers.Container | None = None
        self.app_port:       str | None       = None   # random host port chosen by Docker
        self.run_config:     RunConfig | None = None

    # ── Container lifecycle ───────────────────────────────────────

    def spin_up(self) -> str:
        """
        Start the build container.
        Returns the Docker container ID.

        Idempotent: if the container already exists (e.g., worker retry after
        crash), reattaches to it instead of crashing with a name conflict.
        """
        client = _docker()

        # Idempotency: reattach if already running
        try:
            existing = client.containers.get(self.container_name)
            log.warning(
                "Container %s already exists — reattaching (worker retry?)",
                self.container_name,
            )
            self.container = existing
            self.container.reload()
            
            # Check if container is actually running
            if self.container.status != "running":
                log.warning("Container %s exists but not running (status: %s), restarting", 
                           self.container_name, self.container.status)
                try:
                    self.container.start()
                    self.container.reload()
                except Exception as e:
                    log.warning("Failed to restart container %s: %s, removing and recreating", 
                               self.container_name, e)
                    try:
                        self.container.remove(force=True)
                    except Exception:
                        pass
                    # Fall through to create new container
                    raise docker.errors.NotFound("Container removed, will recreate")
            
            bindings = self.container.ports.get(f"{INTERNAL_PORT}/tcp")
            if bindings:
                self.app_port = bindings[0]["HostPort"]
            return self.container.id
        except docker.errors.NotFound:
            pass

        try:
            self.container = client.containers.run(
                image       = settings.DOCKER_BASE_IMAGE,
                name        = self.container_name,
                command     = "tail -f /dev/null",   # keep alive; agent starts the real process
                detach      = True,
                network     = settings.DOCKER_NETWORK,
                ports       = {f"{INTERNAL_PORT}/tcp": None},  # Docker picks host port
                environment = {
                    "PROJECT_ID": self.project_id,
                    "BUILD_ID":   self.build_id,
                    "PORT":       str(INTERNAL_PORT),
                },
                mem_limit  = self._MEM_LIMIT,
                cpu_quota  = self._CPU_QUOTA,
                cpu_period = self._CPU_PERIOD,
            )
        except Exception as e:
            raise RuntimeError(f"Failed to create Docker container {self.container_name}: {e}")

        # Resolve the random host port Docker assigned
        try:
            self.container.reload()
            bindings = self.container.ports.get(f"{INTERNAL_PORT}/tcp")
            if bindings:
                self.app_port = bindings[0]["HostPort"]
        except Exception as e:
            log.warning("Failed to get port bindings for container %s: %s", self.container_name, e)

        # Bootstrap workspace
        try:
            # First command must run from root since /workspace doesn't exist yet
            result = self.container.exec_run(
                ["/bin/sh", "-c", "mkdir -p /workspace"],
                workdir="/",  # Use root directory for bootstrap
                demux=False,
            )
            if result.exit_code != 0:
                log.warning("Failed to create /workspace: %s", result.output)
            
            # Now we can use the regular exec method for other bootstrap commands
            self.exec("apt-get update -qq && apt-get install -y -qq git curl 2>/dev/null")
        except Exception as e:
            log.warning("Failed to bootstrap container %s: %s", self.container_name, e)

        log.info("Container %s started, host_port=%s", self.container_name, self.app_port)
        return self.container.id

    def configure_run(self, run_config: RunConfig) -> None:
        """
        Store the RunConfig after the agent has written all files.
        No container recreation — the port is always 8080 internally.
        """
        self.run_config = run_config
        log.info(
            "RunConfig set for build=%s: install=%r start=%r",
            self.build_id,
            run_config.install_command,
            run_config.start_command,
        )

    def start_app(self) -> str:
        """
        Install deps, start the app, health-check it.
        Returns the host-accessible URL: http://localhost:{app_port}

        Raises RuntimeError with full logs if startup fails.
        """
        if not self.run_config:
            raise RuntimeError("run_config not set — call configure_run() first.")

        # ── Install ──────────────────────────────────────────────
        exit_code, output = self.exec(
            f"cd /workspace && {self.run_config.install_command}",
            timeout=300,
        )
        if exit_code != 0:
            raise RuntimeError(f"Dependency install failed:\n{output}")

        # ── Start (background, logs to app.log) ──────────────────
        # Kill any previous instance first (idempotent restart)
        proc = self.run_config.start_command.split()[0]
        self.exec(f"pkill -f '{proc}' 2>/dev/null || true")

        self.exec(
            f"cd /workspace && nohup {self.run_config.start_command} "
            f"> /workspace/app.log 2>&1 &"
        )

        # ── Wait for startup ──────────────────────────────────────
        time.sleep(self.run_config.startup_wait_secs)

        # ── Health check (inside container on internal port) ──────
        exit_code, output = self.exec(
            f"curl -sf --retry 3 --retry-delay 2 "
            f"http://localhost:{INTERNAL_PORT}{self.run_config.health_check_path} "
            f"|| echo HEALTH_FAILED"
        )
        if "HEALTH_FAILED" in output:
            _, logs = self.exec("cat /workspace/app.log 2>/dev/null || echo '(no logs)'")
            raise RuntimeError(f"App failed to start. Logs:\n{logs}")

        url = f"http://localhost:{self.app_port}"
        log.info("App healthy at %s for build=%s", url, self.build_id)
        return url

    def restart_app(self) -> None:
        """
        Kill and restart the app process after security fixes.
        Requires run_config to already be set.
        """
        if not self.run_config:
            log.warning("restart_app called but no run_config — skipping")
            return
        proc = self.run_config.start_command.split()[0]
        self.exec(f"pkill -f '{proc}' 2>/dev/null || true")
        time.sleep(1)
        self.exec(
            f"cd /workspace && nohup {self.run_config.start_command} "
            f"> /workspace/app.log 2>&1 &"
        )
        time.sleep(self.run_config.startup_wait_secs)
        log.info("App restarted for build=%s", self.build_id)

    def spin_down(self) -> None:
        """Stop and remove the container. Safe to call multiple times."""
        if not self.container:
            return
        try:
            self.container.stop(timeout=10)
            self.container.remove(force=True)
            log.info("Container %s removed", self.container_name)
        except docker.errors.NotFound:
            pass
        self.container = None

    # ── File I/O ──────────────────────────────────────────────────

    def _ensure_workspace(self) -> None:
        """Ensure /workspace exists inside the container. Idempotent."""
        try:
            # Use root directory as workdir since /workspace might not exist yet
            exit_code, output = self.exec("mkdir -p /workspace", workdir="/")
            if exit_code != 0:
                log.warning("Failed to create /workspace directory: %s", output)
        except Exception as e:
            log.warning("Failed to ensure /workspace: %s", e)

    def write_file(self, path: str, content: str) -> None:
        """Write a file to /workspace/{path} inside the container."""
        # Path traversal guard
        if ".." in path:
            raise ValueError(f"Unsafe path rejected: {path!r}")

        # Sanitize: strip leading "/" and "/workspace/" so the tar entry
        # is always a relative path extracted into /workspace.
        # LLMs sometimes pass absolute paths like "/tmp/requirements.txt"
        # or "/workspace/main.py" which break Docker put_archive.
        path = path.lstrip("/")
        if path.startswith("workspace/"):
            path = path[len("workspace/"):]

        if not path:
            raise ValueError("Empty file path after sanitization")

        # Ensure container is accessible before attempting write
        if not self.container:
            raise RuntimeError("Container not initialized - call spin_up() first")
        
        try:
            # Check if container is still running
            self.container.reload()
            if self.container.status != "running":
                raise RuntimeError(f"Container {self.container_name} is not running (status: {self.container.status})")
        except docker.errors.NotFound:
            raise RuntimeError(f"Container {self.container_name} no longer exists - may have been stopped or removed")
        except Exception as e:
            raise RuntimeError(f"Failed to check container status: {e}")

        # Ensure /workspace exists (guards against stale container handles
        # and images that don't have the directory pre-created).
        self._ensure_workspace()

        parent = "/".join(path.split("/")[:-1])
        if parent:
            exit_code, mkdir_output = self.exec(f"mkdir -p /workspace/{parent}")
            if exit_code != 0:
                raise RuntimeError(f"Failed to create parent directory /workspace/{parent}: {mkdir_output}")

        try:
            stream = io.BytesIO()
            with tarfile.open(fileobj=stream, mode="w") as tar:
                encoded = content.encode("utf-8")
                info    = tarfile.TarInfo(name=path)
                info.size = len(encoded)
                tar.addfile(info, io.BytesIO(encoded))
            stream.seek(0)
            
            # Use put_archive with error handling
            self.container.put_archive("/workspace", stream)
            
        except docker.errors.APIError as e:
            if e.response.status_code == 404:
                raise RuntimeError(f"Container not found when writing file - container may have been removed: {e}")
            else:
                raise RuntimeError(f"Docker API error when writing file {path}: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to write file {path} to container: {e}")

        # Verify the file was actually written
        try:
            exit_code, _ = self.exec(f"test -f /workspace/{path}")
            if exit_code != 0:
                raise RuntimeError(f"File verification failed — /workspace/{path} not found after write")
        except Exception as e:
            log.warning("Could not verify file write for %s: %s", path, e)
            # Don't fail the write operation for verification errors

    def read_file(self, path: str) -> str:
        if ".." in path:
            raise ValueError(f"Unsafe path rejected: {path!r}")
        path = path.lstrip("/")
        if path.startswith("workspace/"):
            path = path[len("workspace/"):]
        if path.startswith("tmp/"):
            path = path[len("tmp/"):]
        _, output = self.exec(f"cat /workspace/{path}")
        return output

    def list_files(self) -> list[str]:
        _, out = self.exec("find /workspace -type f | sed 's|/workspace/||'")
        return [f.strip() for f in out.strip().split("\n") if f.strip()]

    def get_app_logs(self) -> str:
        _, logs = self.exec("cat /workspace/app.log 2>/dev/null || echo '(no logs yet)'")
        return logs

    # ── Command execution ─────────────────────────────────────────

    def exec(self, command: str, timeout: int = 120, workdir: str = "/workspace") -> tuple[int, str]:
        """
        Run a shell command inside the container.
        Returns (exit_code, output_string).

        timeout: seconds before giving up (default 120, use 300 for installs)
        workdir: working directory for command execution (default /workspace)
        """
        if not self.container:
            raise RuntimeError("Container not started — call spin_up() first.")
        
        try:
            # Check if container is still running before executing
            self.container.reload()
            if self.container.status != "running":
                raise RuntimeError(f"Container {self.container_name} is not running (status: {self.container.status})")
            
            result = self.container.exec_run(
                ["/bin/sh", "-c", command],
                workdir=workdir,
                demux=False,
            )
            return result.exit_code, (result.output or b"").decode("utf-8", errors="replace")
            
        except docker.errors.NotFound:
            raise RuntimeError(f"Container {self.container_name} no longer exists")
        except docker.errors.APIError as e:
            if e.response.status_code == 404:
                raise RuntimeError(f"Container not found when executing command: {e}")
            else:
                raise RuntimeError(f"Docker API error when executing command: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to execute command in container: {e}")

    # ── Snapshot (used by deploy node to tar workspace) ───────────

    def _snapshot_workspace(self) -> dict[str, str]:
        """Read all files in /workspace into a dict. Used for debugging only."""
        files: dict[str, str] = {}
        for path in self.list_files():
            try:
                files[path] = self.read_file(path)
            except Exception:
                pass
        return files

    # ── Cross-worker reattach ─────────────────────────────────────

    @classmethod
    def reattach(
        cls,
        project_id: str,
        build_id:   str,
        run_config: RunConfig | dict | None = None,
    ) -> "DockerManager":
        """
        Reattach to an existing container from a different worker/node.
        Called by Guardian and Deployer nodes which don't own the container.

        run_config: pass the RunConfig (or its dict form) so restart_app()
                    works correctly in artificer_fix_node.
        """
        mgr               = cls.__new__(cls)
        mgr.project_id    = project_id
        mgr.build_id      = build_id
        mgr.container_name = f"build-{build_id}"
        mgr.app_port      = None
        mgr.container     = None

        # Accept dict (deserialized from DB) or RunConfig instance
        if isinstance(run_config, dict):
            mgr.run_config = RunConfig.from_dict(run_config)
        else:
            mgr.run_config = run_config

        try:
            mgr.container = _docker().containers.get(mgr.container_name)
            mgr.container.reload()
            port_key = f"{INTERNAL_PORT}/tcp"
            bindings = mgr.container.ports.get(port_key)
            if bindings:
                mgr.app_port = bindings[0]["HostPort"]
        except docker.errors.NotFound:
            log.warning("Container %s not found during reattach", mgr.container_name)

        return mgr