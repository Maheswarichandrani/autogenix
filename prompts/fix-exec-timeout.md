# Fix: `DockerManager.exec` ignores its timeout

## Goal

Stop any command run inside a build container once its time limit passes, so one hanging command cannot freeze the worker and every later build. This is a known defect in AGENTS.md section 9.

## Skills read

- `AGENTS.md` sections 2, 7, 9, 12, 13. The Docker SDK has no project skill, so the installed `docker` 7.1.0 source is the reference (section 4).

## Code inspected

- `server/app/core/docker_manager.py:459-491`: `exec(command, timeout=120, workdir=...)` calls `container.exec_run(["/bin/sh", "-c", command])`, and `timeout` is never used.
- `docker/api/client.py:475` (SDK 7.1.0): exec output reads call `socket.settimeout(None)`, so the worker blocks forever on a command that never ends. The client's 60-second default does not apply here.
- Callers:
  - `docker_tools.py:44`: the agent's `exec_command` uses the default 120 s.
  - `docker_manager.py:292`: install with 300 s.
  - `docker_manager.py:261`: `apt-get` bootstrap with the default 120 s.
  - `deploy_tools.py:140`: git steps with 120 s. Deployer is disabled.
- All four sandbox images ship GNU `timeout`, which I checked by running each image:
  - `python:3.11-slim`: 9.7
  - `node:22-slim`: 9.1
  - `golang:1.24-bookworm`: 9.1
  - `maven:3.9-eclipse-temurin-21`: 9.4

Reference: `docs/PROJECT_REFERENCE.md` lists per-tool timeouts under budgets (around line 450), with no design beyond that.

## Root cause

A command that never ends never closes the exec output stream, and the SDK waits on that stream with no timeout. Typical triggers are:
- the agent starting a server in the foreground, such as `uvicorn main:app` without `&`;
- a prompt waiting for input;
- a stalled `npm install`.

Because the worker runs `--pool=solo`, every queued build waits behind it.

## Decisions and assumptions

1. **Enforce inside the container:** run `["timeout", "--kill-after=5", str(timeout), "/bin/sh", "-c", command]`. GNU `timeout` signals the whole process group, so child processes such as `npm` or `uvicorn` stop too. When it fires, the stream closes and `exec_run` returns. Passing a list avoids quoting problems.
2. **Report clearly:** exit 124 (TERM) or 137 (KILL after the grace period) appends `Command timed out after {timeout}s and was stopped.` to the output and logs a warning. The agent sees the reason and can adjust. This is a clear error, not a silent failure.
3. **Missing `timeout` binary:** fail loudly. If the output shows `timeout` was not found (exit 127), raise `RuntimeError`, because running without a limit is the bug being fixed. All four current images have it.
4. **Agent tool limit:** `exec_command` passes `timeout=300`, because agents run installs and builds through it (`pip`, `npm`, `mvn`). The 120 s default stays for short internal commands such as `cat`, `mkdir`, and syntax checks.
5. **Bootstrap:** `apt-get update && install git curl` passes `timeout=300`, because it downloads packages.
6. **Background starts:** commands ending in `&` with output redirected, such as the `nohup` app start, return at once as before. `timeout` exits normally, and the app keeps running.
7. **Out of scope:**
   - a per-build wall-clock limit;
   - LLM token budgets;
   - the `pkill`/`procps` issue;
   - the worker pool.

## Files to touch

- `server/app/core/docker_manager.py`: `exec` only, plus the bootstrap call's timeout.
- `server/app/agents/tools/docker_tools.py`: `exec_command` passes `timeout=300`.
- `AGENTS.md`: remove the "ignores its timeout" known defect line in section 9.

## Requirements

1. The `exec` signature and return type are unchanged, and no caller breaks.
2. The `exec` docstring states the timeout is enforced inside the container.
3. No new dependency.

## Security considerations

- Strengthens the sandbox: commands inside the container can no longer pin the worker indefinitely.
- `command` is still passed as one argument to `/bin/sh -c`, with no new interpolation.
- No change to images, limits, network, or tokens.

## Acceptance criteria

- `exec("sleep 30", timeout=3)` returns in about 3 seconds, with exit 124 and the timeout message.
- A child process of the timed-out command is gone afterwards.
- `exec("echo ok")` returns exit 0 and `ok`.
- `exec("nohup sleep 100 > /dev/null 2>&1 &")` returns at once, and the background process is still alive.
- `python -c "from app.main import app"` and a worker import both succeed.

## Checks to run

1. In `server/`: `python -c "from app.main import app"` and `python -c "import app.tasks.build_worker"`.
2. A scratch script outside the repo runs the four acceptance cases against a throwaway `python:3.11-slim` container, using the real `DockerManager.exec`, then removes the container.
3. Restart the Celery worker so it loads the change, then ping it.

## Manual test steps

1. Start the app and sign in.
2. Send: `build me a FastAPI hello world API`.
3. The build completes, and the code panel shows files.
4. Optional: ask for a build and tell it to "run uvicorn in the foreground to test it". The step now fails after 5 minutes with "timed out" in the agent's output, instead of freezing.
