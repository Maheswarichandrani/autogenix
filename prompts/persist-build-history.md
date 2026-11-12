# Persist build history (code, builds, messages)

## Goal

What a build produces must survive a page reload, leaving the workspace, and a
new day. Today the user built a todo app at 10:38 IST (05:08 UTC, project
`27d6abf8…`). After that, the generated code is gone from the UI, no Build row
exists, and earlier chat messages are stored several times.

## Skills read

- AGENTS.md (sections 5, 7, 8, 11, 12)
- `langgraph-persistence` (reducers, `update_state`), `langgraph-fundamentals` (`interrupt_before`)
- `fastapi` (new GET route, Pydantic response model; match `= Depends(...)` style in existing files)

## What I found (verified against the DB and code)

1. **Generated code is never stored on the server.**
   - `docker_tools.write_file` (`agents/tools/docker_tools.py:50`) writes into the container and publishes `file_created` over Redis pub/sub. That is all it does.
   - The browser keeps files only in the Zustand `code-stream-store` (localStorage, one global key for all projects). `use-code-stream.ts:136` calls `reset()` whenever the project changes or the workspace unmounts.
   - So leaving the workspace wipes the code, and nothing can reload it.
   - The 10:38 files still exist only because container `build-e956590c…` is still running: `main.py`, `Dockerfile`, `requirements.txt`, `test_main.py`.
2. **Build rows are never created.**
   - The `builds` table is empty.
   - `_stream_until_interrupt_or_end` (`build_worker.py`) creates the Build row only *after* `wf.stream()` returns. But conductor → artificer → verify → guardian all run inside that one stream call.
   - `artificer_node` therefore invents its own id (`workflow.py:439`, `state.get("build_id") or str(uuid.uuid4())`), and the row is never written.
   - Consequence: `provide_env_vars` returns **409 "No active build"**, so the deploy card from the last change cannot deploy.
3. **Chat messages are saved repeatedly.**
   - `GraphState.messages_to_save` uses plain `operator.add`, so the list never clears.
   - `_save_state_to_db` saves the whole list on every run. `_saved_msg_count` is written but never read. The DB has one conductor message stored 4 times.
   - A resettable reducer, `_resettable_list_add`, already exists in `workflow.py:68` but is not used.

## Decisions

1. **New table `project_files`.** Columns: `id`, `project_id` (FK to `projects`, `ON DELETE CASCADE`), `path`, `content` (Text), `size`, `updated_at`, unique on (`project_id`, `path`).
   - Created through an Alembic migration.
   - Keeps the latest version of each file per project. No per-build history; that is out of scope.
2. **Write-through from the worker.**
   - `write_file` upserts the row right after the container write succeeds and next to the `file_created` publish.
   - `delete_file` deletes the row.
   - Uses a small sync repository (`repositories/project_file_repo.py`) on the worker's psycopg session, matching how `build_worker` already talks to Postgres.
   - Files over 1 MB are not stored and are logged by path only.
   - A DB failure is logged loudly but does not fail the tool, the same as the publish failure today.
3. **Read API.** `GET /api/v1/projects/{project_id}/files` returns `[{path, content, size, updated_at}]`. Ownership is checked with `ProjectRepo.get_by_id(project_id, user.id)`.
4. **Code panel loads from the server.**
   - When the workspace opens, `use-code-stream.ts` fetches `/files` and seeds the store, then live `file_created`/`file_deleted` events update it as today.
   - (Corrected during implementation: the store uses only `devtools`, not `persist`. There is no localStorage to remove. Files were lost because `reset()` runs on project change or unmount and nothing reloaded them.) A `seedFiles` action merges the server files, and live events received during the fetch win.
5. **Build row before artificer.**
   - Add `"artificer"` to `interrupt_before` (currently `["conductor", "deployer"]`). The graph pauses between conductor and artificer.
   - The existing loop in `_stream_until_interrupt_or_end` sees `build_requested` with no `build_id`, creates the Build row, puts its id in state, and keeps looping. It does not return on an `artificer` pause, so the build continues in the same task.
   - `artificer_node` keeps its uuid fallback only as a safety net, and logs an error if it is ever used.
   - This stays with `interrupt_before` (no move to `interrupt()`).
6. **Stop duplicate saves.**
   - `messages_to_save` switches to `_resettable_list_add`.
   - After each `_save_state_to_db`, callers clear the list with `wf.update_state(config, {"messages_to_save": None})` instead of writing `_saved_msg_count`.
   - Re-seeds set `messages_to_save: None` so old messages are not carried over.
   - `_saved_msg_count` is removed.
   - Existing duplicate rows are left as they are (no data cleanup in this change).
7. **Recover today's code.** A one-off script reads the source files from the running `build-e956590c…` container and upserts them into `project_files` for project `27d6abf8…`. It skips `todos.db`, `app.log` and `.pytest_cache`. This runs only once, from `server/` (not committed).
8. **Branch.** Keep working on `feature/env-var-card`, as two separate commits (deploy card, then history). The deploy card cannot pass its end-to-end test until Build rows exist, so both are tested together.

## Files expected to change

Server:
- `app/models/project_file.py` (new), `app/models/__init__.py`, and `Project.files` relationship.
- `alembic/versions/<new>_add_project_files.py` (new).
- `app/repositories/project_file_repo.py` (new): sync upsert/delete for the worker, and async list for the API.
- `app/agents/tools/docker_tools.py`: write-through in `write_file` / `delete_file`.
- `app/api/routes/v1/project_routes.py`: `GET /projects/{id}/files`.
- `app/schemas/project_schemas.py`: `ProjectFileResponse`.
- `app/agents/workflow.py`: `interrupt_before` gets `artificer`, `messages_to_save` reducer, and a log line on the uuid fallback.
- `app/tasks/build_worker.py`: clear `messages_to_save` after saves, re-seed with `None`, drop `_saved_msg_count`.

Client:
- `client/lib/api/projects.ts` + `config.ts`: `getFiles(projectId)`.
- `client/hooks/use-code-stream.ts`: fetch and seed on mount.
- `client/store/code-stream-store.ts`: drop `persist`, add `seedFiles(files)`.

## Requirements

1. Reload, navigate away and back, or come back tomorrow: the code panel shows every file the agents wrote, for that project only.
2. Every build creates exactly one Build row before Artificer starts. The deploy card's `provide_env_vars` no longer returns 409.
3. Each chat message is stored once, across later messages, the deploy confirm, and error resets.
4. Today's 10:38 todo-app files appear in project `27d6abf8…`'s code panel.

## Security considerations

- `GET /files` is ownership-checked, so another user's project id returns 404.
- File contents are AI-written code from the sandbox. They are stored as text and rendered in Monaco (not as HTML), so this adds no new XSS path.
- No tokens or env var values are written to `project_files`. Env vars never reach the container workspace through `write_file`.
- The size cap stops one huge file from bloating the DB.

## Acceptance criteria

- After a build, `SELECT path FROM project_files WHERE project_id = …` lists the written files.
- Leaving the workspace and reopening it shows the same files in the code panel.
- `SELECT * FROM builds` has one row per build, with the same id as the container name.
- Sending 3 chat messages after a build creates no duplicate rows (checked with a GROUP BY query).
- Deploy card → Deploy no longer returns 409 and reaches the deployer.

## Checks to run

- `server/`: `python -c "from app.main import app"`. Alembic is **not** run. Neon is stamped with the missing revision `181838669d0d` (ISSUES_SPEC A4), so `upgrade head` fails. The user chose to ship the migration file for clean databases and let the existing `create_all` at FastAPI startup create `project_files` on Neon. A4 stays a separate fix.
- `client/`: `npm run lint`, `npm run build`.
- A real build end-to-end (steps below).

## Manual test steps

1. Restart the Celery worker and FastAPI after `alembic upgrade head`.
2. Open project "build me a todo application". The code panel shows `main.py`, `Dockerfile`, `requirements.txt` and `test_main.py` (recovered).
3. Create a new project and send `build me a REST API for a todo list with JWT auth`.
4. While it builds, check that files appear live. Then go to Home, come back, and confirm the files are still there.
5. Close the browser tab, reopen the project, and confirm the files and chat are still there with no duplicated messages.
6. At the deploy card, click Deploy. The deploy starts with no 409.
7. Run the duplicate-messages SQL query. It should return no rows for the new project.
