"""
tools/docker_tools.py

Tools given to the Artificer agent.

Design decision on start_app:
  start_app is NOT a tool here. The agent uses exec_command() to run
  install + start commands itself (it knows the commands from the plan).
  After the ReAct loop finishes, the artificer_node calls docker.start_app()
  exactly once to get the URL for Guardian. This avoids double-start conflicts.

  The agent CAN still check logs with get_app_logs() and restart manually
  with exec_command("pkill uvicorn && nohup uvicorn ...") if something fails.
"""
import os
import logging
from langchain_core.tools import tool
from app.core.docker_manager import DockerManager
from app.core.redis import publish_code
from app.repositories import project_file_repo

log = logging.getLogger(__name__)


def _store(action, project_id: str, *args) -> None:
    """
    Write-through to project_files so the code survives the container.
    A DB failure is logged loudly but does not fail the agent's tool call.
    """
    from app.tasks.build_worker import _get_session  # lazy: avoids import cycle
    db = _get_session()
    try:
        action(db, project_id, *args)
    except Exception:
        log.exception("Could not store file change for project=%s", project_id)
        db.rollback()
    finally:
        db.close()


def get_docker_tools(docker: DockerManager, project_id: str | None = None) -> list:
    """
    Returns tool functions bound to this build's DockerManager instance.
    Call once per build, pass returned list to run_react_agent().
    """

    @tool
    def exec_command(command: str) -> str:
        """
        Run any shell command inside the Docker build container at /workspace.
        Use for: installing packages, running scripts, checking errors, viewing output.
        Returns exit code status and full command output.

        Examples:
          exec_command("pip install -r requirements.txt")
          exec_command("python -m pytest tests/ -v")
          exec_command("ls -la")
          exec_command("cat requirements.txt")
          exec_command("python -c 'import fastapi; print(fastapi.__version__)'")
        """
        # Agents run installs and builds through this, so allow longer than the default
        exit_code, output = docker.exec(command, timeout=300)
        status = "✅ EXIT 0" if exit_code == 0 else f"❌ EXIT {exit_code}"
        result = output.strip() if output.strip() else "(no output)"
        return f"{status}\n{result}"

    @tool
    def write_file(path: str, content: str) -> str:
        """
        Write a complete file into /workspace/{path} inside the container.
        Parent directories are created automatically.
        Always write the COMPLETE file — never partial or truncated content.
        IMPORTANT: Always use relative paths like "main.py" or "src/models.py".
        Do NOT use absolute paths like "/tmp/..." or "/workspace/...".

        Examples:
          write_file("main.py", "from fastapi import FastAPI\\napp = FastAPI()\\n...")
          write_file("src/models.py", "from sqlalchemy import ...\\n...")
          write_file("requirements.txt", "fastapi==0.115.0\\nuvicorn[standard]==0.30.0\\n")
        """
        try:
            docker.write_file(path, content)
            lines = len(content.splitlines())
            size  = len(content.encode("utf-8"))
            rel   = project_file_repo.normalise_path(path)

            if project_id:
                _store(project_file_repo.upsert_file, project_id, rel, content)

            # Publish file_created event to the code stream channel
            if project_id:
                try:
                    publish_code(project_id, {
                        "type":    "file_created",
                        "path":    rel,
                        "content": content,
                        "lines":   lines,
                        "size":    size,
                    })
                except Exception as pub_err:
                    log.warning("Failed to publish file_created for %s: %s", path, pub_err)

            return f"✅ Written: {path} ({lines} lines, {size} bytes)"
        except Exception as e:
            return f"❌ Failed to write {path}: {e}"

    @tool
    def read_file(path: str) -> str:
        """
        Read the current contents of a file from /workspace/{path}.
        Use this before modifying an existing file to see what's there.

        Example: read_file("main.py")
        """
        try:
            content = docker.read_file(path)
            return content if content.strip() else "(file is empty)"
        except Exception as e:
            return f"❌ Cannot read {path}: {e}"

    @tool
    def list_files() -> str:
        """
        List all files currently in /workspace.
        Use this to see what has been created, check structure, or verify a file exists.
        """
        files = docker.list_files()
        if not files:
            return "(workspace is empty — no files written yet)"
        return "\n".join(sorted(files))

    @tool
    def check_syntax(path: str) -> str:
        """
        Validate the syntax of a Python or JavaScript/TypeScript file without running it.
        Call this after writing each file to catch syntax errors early.

        Examples:
          check_syntax("main.py")
          check_syntax("src/models.py")
          check_syntax("index.js")
        """
        ext = os.path.splitext(path)[1].lower()
        if ext == ".py":
            exit_code, output = docker.exec(
                f"python3 -m py_compile /workspace/{path} 2>&1 && echo 'SYNTAX_OK'"
            )
            if "SYNTAX_OK" in output:
                return f"✅ {path} — syntax OK"
            return f"❌ {path} — syntax error:\n{output}"

        elif ext in (".js", ".ts", ".jsx", ".tsx"):
            # Use node --check for JS, tsc --noEmit for TS if available
            if ext in (".ts", ".tsx"):
                exit_code, output = docker.exec(
                    f"npx tsc --noEmit /workspace/{path} 2>&1 || node --check /workspace/{path} 2>&1 && echo 'SYNTAX_OK'"
                )
            else:
                exit_code, output = docker.exec(
                    f"node --check /workspace/{path} 2>&1 && echo 'SYNTAX_OK'"
                )
            if "SYNTAX_OK" in output or exit_code == 0:
                return f"✅ {path} — syntax OK"
            return f"❌ {path} — syntax error:\n{output}"

        return f"⚠️ Syntax check not available for {ext} files — skipped"

    @tool
    def get_app_logs() -> str:
        """
        Get the current application runtime logs.
        Use this to diagnose startup failures or runtime errors.
        The logs come from /workspace/app.log written when the app starts.
        """
        return docker.get_app_logs()

    @tool
    def delete_file(path: str) -> str:
        """
        Delete a file from /workspace/{path}.
        Use when you need to replace a file completely or clean up.

        Example: delete_file("old_config.py")
        """
        try:
            exit_code, output = docker.exec(f"rm -f /workspace/{path}")
            if exit_code == 0:
                rel = project_file_repo.normalise_path(path)
                if project_id:
                    _store(project_file_repo.delete_file, project_id, rel)

                # Publish file_deleted event to the code stream channel
                if project_id:
                    try:
                        publish_code(project_id, {
                            "type": "file_deleted",
                            "path": rel,
                        })
                    except Exception as pub_err:
                        log.warning("Failed to publish file_deleted for %s: %s", path, pub_err)

                return f"✅ Deleted: {path}"
            return f"❌ Delete failed: {output}"
        except Exception as e:
            return f"❌ Error deleting {path}: {e}"

    return [
        exec_command,
        write_file,
        read_file,
        list_files,
        check_syntax,
        get_app_logs,
        delete_file,
    ]