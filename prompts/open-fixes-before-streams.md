# Open fixes before Redis Streams

## Goal

Fix the four open defects, and delete the scratch file, before starting Redis Streams.

1. Guardian concludes from source review alone, without testing the running app.
2. Raw `<<<RUN_CONFIG>>>` / `<<<SECURITY_VERDICT>>>` blocks show in chat messages.
3. `DELETE /account/railway-key` never saves.
4. The Alembic history on Neon is broken (issues spec A4).
5. `server/_check_builds.py` is a scratch file.

Branch: `feature/open-fixes`, from `develop` (`088a6ee`). One commit per fix.

## Skills / code read

- AGENTS.md (§7 fail closed, §10 prompts are code and use doubled braces, §12), `docs/ISSUES_SPEC.md` A4.
- `server/app/agents/workflow.py`: `_GUARDIAN_SYSTEM`, `guardian_node`, `_invalid`.
- `server/app/agents/react.py`: `run_react_agent` returns `(final_text, tool_calls_log)`, where each entry is `{tool, input, output}`.
- `server/app/agents/tools/security_tools.py`:
  - `run_rate_limit_scan` always sends `{"username","password"}`.
  - `run_sql_injection_scan` is POST-only, with a fixed `password` field.
- Last real Guardian report (project e39ac361):
  - It never ran the injection scan, and said "source review shows no SQL".
  - Every rate-limit request got a 422, so the limiter was never really tested.
- `client/components/workspace/markdown-content.tsx` and `streaming-markdown.tsx` render agent text. The step feed shows tool input/output in an expandable debug row; that stays raw.
- `server/app/api/routes/v1/env_vars.py:153`: `delete_railway_key` calls `db.flush()`, and `get_db` never commits.
- Alembic:
  - The repo chain is `4293691e1fc0 → 2caeebd5e2df → bf9af9f94147 → c7d2e4f1a9b3` (head).
  - Neon is stamped `181838669d0d`, which is in neither the repo nor git history. `alembic current` fails with "Can't locate revision".
- Schema diff, Neon vs the models (`compare_metadata`):
  - Every model table and column exists on Neon.
  - Extra on Neon:
    - The LangGraph tables `checkpoints`, `checkpoint_writes`, `checkpoint_blobs` and `checkpoint_migrations`. `PostgresSaver` owns these.
    - `user_integrations`, with 0 rows.
    - `users`: `display_name`, `kdf_salt`, `work_function` and four `privacy_*` columns. One user has `display_name` and `work_function` set.
    - `builds`: `raw_plan`, `security_issues_found` and `security_iteration` (NOT NULL, default 0).
- `server/app/core/database.py:46`: `init_db()` runs `Base.metadata.create_all` on every API start.

## Decisions

### 1. Guardian tests the live app (`workflow.py`, `security_tools.py`)

- **Prompt.** Add a "RULES" section to `_GUARDIAN_SYSTEM`:
  - Find the endpoints first, from `/openapi.json` (FastAPI) or the source files.
  - Test every area that applies with real requests through the tools. Source review supports a finding but never replaces a live test.
  - Use valid-format bodies, so the app's validation does not reject the test before the logic under test runs.
  - Evidence must quote a real response.
  - Braces stay doubled.
- **Code check (fail closed).** After the agent returns, count the live calls in `tool_calls_log`.
  - A live call is one of `http_request`, `run_sql_injection_scan`, `run_auth_bypass_scan`, `run_rate_limit_scan` or `check_security_headers`, whose output is not a connection or request failure.
  - The scan needs at least 3 live calls, and at least one must send an attack payload (`http_request` or `run_sql_injection_scan`).
  - Otherwise the scan is `_invalid("Security scan did not test the running app …")`, which uses the existing fail-closed path. No silent pass.
  - The live-call check lives in a pure helper, `_count_live_security_calls(tool_log)`.
- **Tools.**
  - `run_rate_limit_scan` gets an optional `body` (JSON string, default as today).
  - `run_sql_injection_scan` gets an optional `method` (`POST` sends a JSON body; `GET` sends a query string) and an optional `base_body` (JSON merged with the payload field), replacing the hardcoded `password`.
  - The existing defaults keep current calls working.

### 2. Hide parser markers in chat (client only)

- New `client/lib/agent-markers.ts`, exporting `stripAgentMarkers(text)`. It removes:
  - Complete `<<<NAME>>>…<<<END_…>>>` blocks.
  - While streaming, an unterminated trailing `<<<NAME>>>…` or a partial `<`, `<<` or `<<<NA…` at the very end.
  - The whitespace those leave behind.
- Use it in `MarkdownContent` and `StreamingMarkdown`.
- The server still stores the raw text. The parsers and debugging need it, and old messages get cleaned up on display for free.
- The step feed's tool-detail rows are unchanged.

### 3. Railway key delete

- `delete_railway_key`: change `await db.flush()` to `await db.commit()`.

### 4. Alembic (non-destructive)

1. **Ignore the orphans in `alembic/env.py`.** Add an `include_object` hook so autogenerate never touches:
   - The 4 LangGraph checkpoint tables (`PostgresSaver` owns them).
   - The legacy orphans: `user_integrations` and the 9 columns listed above.

   Each one gets a comment saying why it is there. No data is dropped. Removing the legacy columns is a separate, later decision.
2. **Stamp Neon at the real head**, with `alembic stamp --purge c7d2e4f1a9b3`. The schema already matches every revision up to there (checked above). `--purge` is needed because the current stamp names a revision that does not exist. Only the `alembic_version` row changes.
3. **Remove `create_all` from startup.**
   - `init_db()` now checks that the database revision equals the Alembic head.
   - If it doesn't, it raises: `Database is at <rev>, expected <head>. Run: alembic upgrade head`. That fails loudly instead of creating tables outside Alembic.
4. **Verify on a scratch Postgres** (Docker, `postgres:16`, throwaway port):
   - `alembic upgrade head` from empty.
   - `compare_metadata` reports no differences (with the ignore list).
   - Remove the container afterwards.

   If the old chain cannot build the current schema from scratch, I stop and report rather than patch history.

### 4b. Added after the scratch-DB check (user chose "New migration")

The scratch DB showed the chain cannot build the current schema:
- `2caeebd5e2df` ("Added env table") is empty, so `project_env_vars` was never created by Alembic.
- `c7d2e4f1a9b3` leaves `project_files.updated_at` nullable, but the model requires it.

The fix is a new migration after `c7d2e4f1a9b3`:
- Create `project_env_vars` only if it is missing.
- Set `project_files.updated_at` NOT NULL, after backfilling any NULLs with `now()`.

On Neon: `alembic stamp --purge c7d2e4f1a9b3`, then `alembic upgrade head`. The table already exists there, so only the no-op NOT NULL runs. Then verify that both a fresh scratch DB and Neon show no diff against the models.

### 5. Scratch file

- Delete the untracked `server/_check_builds.py`.

## Files

- `server/app/agents/workflow.py`
- `server/app/agents/tools/security_tools.py`
- `client/lib/agent-markers.ts` (new)
- `client/components/workspace/markdown-content.tsx`
- `client/components/workspace/streaming-markdown.tsx`
- `server/app/api/routes/v1/env_vars.py`
- `server/alembic/env.py`
- `server/app/core/database.py`
- `server/app/main.py`, only if the startup call needs adjusting

## Security

- The Guardian gate becomes stricter: a scan that never touched the app now blocks deploy (fail closed).
- Guardian's tools still send requests only to the build's own `app_url`. No new targets.
- Removing the Railway key now really takes effect, so the next deploy asks for it again.
- The marker strip is display-only, and the parsers still read the raw text.
- Alembic: no schema change on Neon, only the version stamp. The DB URL is never printed.

## Acceptance

1. Guardian on a normal build calls the live tools. Its report quotes real responses, and the rate-limit test uses valid-format bodies (not all 422).
2. If Guardian answers with no live calls, the build stops with "Security scan did not test the running app".
3. Chat shows no `<<<…>>>` text, live or after reload. The step-feed debug rows still show raw tool I/O.
4. `DELETE /account/railway-key`, then the user row shows `railway_api_key_encrypted` as NULL.
5. `alembic current` on Neon prints `c7d2e4f1a9b3 (head)`. The API starts. A scratch DB built with `upgrade head` matches the models.

## Checks

- `server/`: `python -c "from app.main import app"`; `alembic current`; scratch-DB `alembic upgrade head` plus `compare_metadata`.
- `client/`: `npm run lint`, `npm run build`.
- Pure helpers run against sample input: `_count_live_security_calls` (the last real tool log shape), and `stripAgentMarkers` (complete, partial and streaming cases).
- Pipeline: one in-process build through Guardian, inspecting Guardian's tool log and report.

## Manual test

1. Start Redis, Celery, FastAPI and Next.js. Send "build a notes API with JWT auth".
2. Open Guardian's step rows: you see `http_request` / scan calls with real responses. Its chat message has no `<<<SECURITY_VERDICT>>>` text.
3. Reload the page: the messages still have no markers.
4. In the deploy card flow, connect Railway, then call `DELETE /api/v1/account/railway-key` (or disconnect). The next deploy asks for the key again.
5. In `server/`, run `alembic current`. It should show `c7d2e4f1a9b3 (head)`.
