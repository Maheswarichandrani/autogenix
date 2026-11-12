"""
Sandbox containers are disposable; the database is the source of truth.

Every node that needs a build's container goes through ensure_sandbox():
  running            → use it
  stopped            → start it again (files are still inside)
  missing / removed  → create a fresh one and restore the project's files
                       from project_files

It fails loudly: either a running sandbox comes back or a RuntimeError is
raised. The app process inside is NOT started here; callers that need the
app (Guardian) restart it when `state` is not "running".
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal

from app.core.docker_manager import DockerManager, RunConfig

log = logging.getLogger(__name__)

SandboxState = Literal["running", "started", "restored"]


@dataclass
class Sandbox:
    docker: DockerManager
    state: SandboxState
    restored_files: int = 0


def _saved_files(project_id: str) -> dict[str, str]:
    from app.repositories.project_file_repo import files_for_project
    from app.tasks.build_worker import _get_session  # lazy: avoids import cycle

    db = _get_session()
    try:
        return files_for_project(db, project_id)
    finally:
        db.close()


def saved_paths(project_id: str) -> list[str]:
    """Paths of the project's saved code (empty for a brand-new project)."""
    from app.repositories.project_file_repo import paths_for_project
    from app.tasks.build_worker import _get_session  # lazy: avoids import cycle

    db = _get_session()
    try:
        return paths_for_project(db, project_id)
    finally:
        db.close()


def restore_project_files(docker: DockerManager, project_id: str) -> int:
    """Copy the project's saved files into a fresh sandbox. Returns how many."""
    files = _saved_files(project_id)
    if not files:
        return 0
    count = docker.write_files(files)
    log.info("Restored %d saved files into %s", count, docker.container_name)
    return count


# Build output and caches: never saved as project code
_IGNORED = re.compile(
    r"(^|/)(__pycache__|node_modules|\.venv|venv|\.git|\.pytest_cache|\.mypy_cache|target|build|dist|\.next)(/|$)"
    r"|\.(pyc|pyo|log|class|jar|so|o|exe)$"
)


def sync_workspace_to_db(docker: DockerManager, project_id: str) -> list[str]:
    """
    Make project_files match the sandbox after a code change, so edits made any
    way (not only via write_file) survive the container. Returns changed paths.
    Text files only; binaries and build output are skipped. Never deletes when
    the workspace listing comes back empty (that is a read failure, not a wipe).
    """
    from app.core.redis import publish_code
    from app.repositories import project_file_repo as repo
    from app.tasks.build_worker import _get_session  # lazy: avoids import cycle

    paths = {p for p in docker.list_files() if p and not _IGNORED.search(p)}
    if not paths:
        log.warning("sync: empty workspace listing for project=%s; nothing synced", project_id)
        return []

    raw = docker.read_workspace_files(paths)
    current: dict[str, str] = {}
    for path, (data, _exec) in raw.items():
        try:
            current[repo.normalise_path(path)] = data.decode("utf-8")
        except UnicodeDecodeError:
            continue  # binary (e.g. a compiled Go app)

    db = _get_session()
    changed: list[str] = []
    try:
        saved = repo.files_for_project(db, project_id)
        for path, content in current.items():
            if saved.get(path) != content and repo.upsert_file(db, project_id, path, content):
                changed.append(path)
                publish_code(project_id, {
                    "type": "file_created", "path": path, "content": content,
                    "lines": len(content.splitlines()), "size": len(content.encode("utf-8")),
                })
        for path in saved.keys() - current.keys():
            if not _IGNORED.search(path):
                repo.delete_file(db, project_id, path)
                changed.append(path)
                publish_code(project_id, {"type": "file_deleted", "path": path})
    finally:
        db.close()

    if changed:
        log.info("sync: saved %d changed files for project=%s: %s", len(changed), project_id, changed[:20])
    return changed


def ensure_sandbox(
    project_id: str,
    build_id: str,
    run_config: RunConfig | dict | None = None,
    stack: str | None = None,
) -> Sandbox:
    """A running sandbox for this build, recreated from the database if needed."""
    docker = DockerManager.reattach(project_id=project_id, build_id=build_id, run_config=run_config)

    if docker.container is not None:
        if docker.is_running():
            return Sandbox(docker, "running")
        if docker.container is not None:  # stopped, still exists
            docker.start()
            return Sandbox(docker, "started")

    # Gone: rebuild it from what the database holds
    log.warning("Sandbox for build=%s is gone; recreating it from saved files", build_id)
    fresh = DockerManager(project_id, build_id, stack)
    fresh.spin_up()
    fresh.run_config = docker.run_config
    count = restore_project_files(fresh, project_id)
    return Sandbox(fresh, "restored", count)
