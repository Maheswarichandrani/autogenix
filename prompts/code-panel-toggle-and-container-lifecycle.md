# Code panel toggle + sandbox container lifecycle

## Problems (user report)

1. **The code panel can't be opened.**
   - It opens only from a file card, and messages from before today have no cards (no `metadata.files`).
   - The reference screenshot (5) shows a panel icon left of "Share" in the header. We don't have it.
2. **Containers of inactive projects keep running.** On 2026-11-12 nine `build-*` containers were up:
   - 5 are my E2E test builds.
   - 1 is the user's current todo build.
   - 3 are orphans with no Build row.

## Code read

- `core/docker_manager.py`:
  - `spin_down()` stops and removes a container.
  - `reattach()` gets the container but **does not start it if it is stopped**.
  - `spin_up()` restarts an existing stopped container.
- `agents/workflow.py`: containers are removed only on Artificer failure, on escalation, and after the deployer finishes.
- `tasks/build_worker.py`: the graph parks at `deployer` (deploy card) with the container still running, and stays that way until the user deploys. Every new build creates a new container, and older ones are never cleaned up.
- The deployer reads the workspace from the container (`read_workspace_files` via `get_archive`, plus `exec` for the git file list). So the container must exist and be running at deploy time. Its files are also in `project_files`.
- Build containers are named `build-{build_id}` and carry no labels.

## Decisions

### 1. Code panel toggle (client)

- Add an icon button (lucide `PanelRight`, tooltip "Code") to the workspace header, left of Share, as in the reference. It toggles the code panel on the project's main file.
- It is disabled with the tooltip "No files yet" until the project has files.
- While the panel is open, the panel's × closes it (the header loses Share and the toggle, as now).

### 2. Container lifecycle (worker), fail loudly, no Celery Beat

1. **Parked at the deploy card:** after the card is persisted, `docker stop` the build's container. Files are kept, and CPU and RAM are freed. The sandbox preview stops then; the deploy URL takes over after deploy.
2. **`reattach()` starts a stopped container.** If it can't, it raises a clear `RuntimeError` instead of handing back a dead container. Deploy confirm and any resumed node go through `reattach`, so they work after a stop.
3. **A new build in a project:** `_create_build` removes the containers of that project's earlier builds. They are superseded, and their files are in `project_files`.
4. **Worker start sweep** (Celery `worker_ready` signal, once per start):
   - `remove` any `build-*` container whose build id has no Build row.
   - `stop` every other running `build-*` container. With `--pool=solo`, no build is mid-run at startup, and a retried task restarts its container through (2).
   - Every action is logged.
5. **Labels:** new containers get `autogenix.project_id` and `autogenix.build_id` labels, so (3) and (4) can find them without parsing names. Old unlabelled containers fall back to their names.

### 2b. Architecture: the container is disposable, the database is the source of truth (user review)

The user asked what happens when a stopped or removed project is reopened.

**Today:**
- Viewing a project (chat and code panel) already needs no container: messages, steps and files come from Postgres.
- **The gap:** a follow-up build starts with an EMPTY `/workspace`. Nothing restores the project's saved files, so asking an older project to "add X" makes the Artificer rewrite the app from scratch.

**Rule:** any node that needs a container calls one helper, `DockerManager.ensure(...)`:
1. Running: use it.
2. Stopped: start it.
3. Missing (removed, swept, or Docker restarted): create a fresh container and **restore the project's files from `project_files`**. The app is started again by the verify node as usual.

If none of these work, it raises a clear error. It never hands back a dead container.

It is used by:
- **New builds** (`artificer_node`). The fresh container is first restored with the project's current files. When files were restored, the Artificer's task message says so and lists them: "This project already has these files. Read the ones you need and change them; do not start over." A brand-new project is unchanged.
- **Guardian, fix, verify and deployer** (instead of the bare `reattach`). A deploy approved days later still works even if the container was removed: it is recreated from the saved files.

Executable bits are not stored in `project_files`, so restored files are written as regular files. Generated apps run through `python`, `node`, `go` or `java`, not `./script`, so this is noted and accepted.

With this in place, removing superseded and orphan containers (2.3 and 2.4) is always safe.

### 3. One-off cleanup now (needs your OK, see the question)

- Remove the 3 orphan containers and my 5 E2E test containers. Soft-delete my 5 E2E test projects (`status='deleted'`) so they leave your Recents.
- Your todo build is left alone. It will be stopped (not removed) when it parks at its deploy card.

## Files

- `client/components/workspace/workspace-header.tsx` and `workspace-client.tsx` (the toggle).
- `server/app/core/docker_manager.py`: `ensure()` (start or restore), labels, and a `stop()` helper.
- `server/app/repositories/project_file_repo.py`: a sync `list_files(db, project_id)` for restore.
- `server/app/agents/workflow.py`: the nodes use `ensure()`, and the Artificer task mentions restored files.
- `server/app/tasks/build_worker.py`: stop at the gate, and supersede in `_create_build`.
- `server/app/tasks/build_worker.py` or a new `server/app/tasks/container_sweep.py`: the worker-start sweep.

## Security

- Only containers named `build-*` (and, once labelled, carrying the label) are touched. Never other containers on the machine. The user has unrelated Supabase containers running.
- Stopping or removing changes no project data: files stay in `project_files`.

## Acceptance

1. The header toggle opens and closes the code panel on any project with files, including old ones.
2. After a build reaches the deploy card, `docker ps` no longer lists its container, while `docker ps -a` shows it as Exited.
3. Approving the deploy afterwards works: the container starts again and the push reads the files. With the container removed, it is recreated from the saved files and the deploy still works.
3b. A follow-up message on an existing project (container gone) builds on its existing files instead of starting over.
4. Starting a second build in the same project removes the first build's container.
5. Restarting the worker removes orphan containers and stops idle ones. Non-`build-*` containers are untouched.

## Checks

- `client`: lint and build.
- `server`: import check.
- An in-process build to the deploy gate, then `docker ps` shows it stopped.
- `reattach` on the stopped container, then it is running.
- A second build in the same project, then the first container is gone.
- Run the sweep, then check orphans are removed and the Supabase containers are untouched.

## Addendum: found while testing the follow-up build for real

1. **The Conductor didn't know the project had code.** It replied "please share your code" instead of starting a build.
   - Fix: the Conductor prompt gets an `Existing code:` line (the file count and the first 15 paths, from `project_files`).
   - A new rule: a request to change existing code is a build.
2. **The Artificer edited `main.py` with a shell command, not `write_file`.** The sandbox had the change, but the database kept the old file.
   - Fix 1: both builder prompts require `write_file` for every file change.
   - Fix 2 (safety net): `verify_node` calls `sync_workspace_to_db()` after every code change. This makes `project_files` match the sandbox, with text files only and build output and caches skipped, and publishes `file_created` / `file_deleted` so the code panel updates.
   - The sync never deletes when the workspace listing is empty. If saving fails, the build stops with a clear error.

Re-run result: the Artificer received the existing files, `/quotes` and its list were kept, `/quotes/random` was added and saved, the sandbox stopped at the deploy card, and the card was created.
