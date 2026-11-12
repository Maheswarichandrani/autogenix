# Fix: Deployer repo reuse (D2) and secrets in LangGraph state (D3)

## Goal

1. **D2:** the Deployer must never write into a GitHub repo it did not create for this project, and the model must not be able to make the repo public.
2. **D3:** the GitHub token, the Railway key, and the user's app env var values must never be written to LangGraph state (Postgres checkpoints), the Celery queue (Redis), the LLM prompt, or tool-call inputs streamed to the browser.

Same branch as D1 (`feature/github-push-token`), as a separate commit.

## Skills read

- `AGENTS.md` sections 5, 7, 12 and the Celery notes in section 4 (`task_acks_late`, `max_retries=1`, idempotency key for tasks that create GitHub repos).
- `langgraph-persistence` concepts: every `update_state` and every node step writes a **new** checkpoint row. Later "wiping" a key with another `update_state` does not delete the earlier rows.
- `security-review` will be run on the diff.

## Code inspected

- `server/app/tasks/build_worker.py:678-784` `deploy_confirm_task`.
- `server/app/agents/workflow.py:1217-1305` `_DEPLOYER_SYSTEM`, `deployer_node`; `GraphState` (`deploy_payload`, `repo_url`).
- `server/app/agents/tools/deploy_tools.py` `create_github_repo`, `deploy_to_railway`.
- `server/app/api/routes/v1/message_routes.py:177` and `env_vars.py:316`, the two callers of `deploy_confirm_task.delay`.
- `server/app/agents/react.py:120, 248-271`: tool inputs (`_safe_preview`) and results are published to the browser and kept in the transcript.

## What is wrong today

**D3, wider than listed.** Secrets reach four persistent or external places:

| Secret | Where it leaks | How |
|---|---|---|
| GitHub token, Railway key, app env vars | Postgres checkpoints | `wf.update_state(config, {"deploy_payload": {...}})` writes a checkpoint; the later `update_state(... None)` adds a new row and leaves the old one |
| App env vars | Redis (Celery broker) | `deploy_confirm_task.delay(plaintext_vars=...)` puts plaintext into the queue message |
| App env vars | LLM provider, transcript, checkpoints | `user_prompt=f"... Environment variables: {json.dumps(plaintext_vars)}"` |
| App env vars | Browser stream | The model passes them back as `deploy_to_railway(env_vars=...)`, and `_safe_preview` only redacts if the JSON happens to contain "key"/"token"/... (e.g. `DATABASE_URL` values are shown) |

Side bug: the `finally` block calls `plaintext_vars.clear()` before `self.retry(...)`, so a retry would deploy with no env vars.

Because the graph currently ends after Artificer, `deployer` is never `next`, and `deploy_confirm_task` returns before `update_state`. So no real secrets should be in existing checkpoints. A check query is in the manual test.

**D2.** On HTTP 422 (name exists), `create_github_repo` fetches and returns the user's existing repo, so the Deployer writes into an unrelated repo with the same name. The model also chooses the name and can pass `private=False`. A Celery retry (`acks_late`, `max_retries=1`) would create a second repo, because nothing ties a repo to the project.

## Decisions

### D3: secrets travel outside the graph, in a process-local deploy context

- New small module `server/app/agents/deploy_context.py`:
  - `@dataclass DeployContext(github_token, railway_api_key, app_env_vars: dict[str, str])`
  - `put(thread_id, ctx)`, `take(thread_id) -> DeployContext | None` (pop), `discard(thread_id)`. A module-level dict guarded by a lock.
  - Works because `deploy_confirm_task` runs the graph synchronously in the same process (`_stream_until_interrupt_or_end`), and the worker is `--pool=solo`. Documented in the module docstring. If the pool or execution model changes, this must be revisited.
  - Rejected: `config["configurable"]`, because LangGraph copies configurable values into checkpoint metadata. Rejected: `update_state`, the current defect.
- `deploy_confirm_task`:
  - takes `encrypted_vars: str` instead of `plaintext_vars: dict`;
  - decrypts it with `decrypt_token` → `json.loads`, decrypts the two tokens, `deploy_context.put(thread_id, ...)`;
  - resumes the graph with no state update (`interrupt_before` resume works without one);
  - `finally: deploy_context.discard(thread_id)`. No `.clear()` on task args, so a retry gets the same encrypted input.
- Both API callers encrypt before enqueueing: `encrypted_vars = encrypt_token(json.dumps(vars))` (Fernet, same key as the stored tokens). Redis only ever sees ciphertext.
- `deployer_node(state, config)`:
  - reads `thread_id` from `config["configurable"]`, calls `deploy_context.take(thread_id)`;
  - if missing: publish a clear error and `done`, return an `error`. Fail loudly, no deploy;
  - passes the secrets straight into `get_deploy_tools(...)`;
  - the prompt gets **env var names only**: `Environment variables to set (values are applied automatically): DATABASE_URL, STRIPE_KEY`.
- Remove `deploy_payload` from `GraphState`, from the initial state dicts in `build_worker.py`, and from the deployer return value. Old checkpoints that still have the key load fine (unknown channel values are ignored).
- `deploy_to_railway(github_repo_url, project_name)`: drop the `env_vars` argument. The tool sets the bound `app_env_vars` itself and returns only the count and the names.

### D2: one repo per project, created by us, always private

- The repo name is set by code, not the model: `<slug(project_name)>-<first 8 hex of project_id>`. The slug is lowercase `[a-z0-9-]`, collapsed, max 30 chars, fallback `autogenix-app`.
- Creation always sends `"private": True`. The `private` and `repo_name` parameters are removed from the tool, so the tool is `create_github_repo(description: str = "")`. This also covers D6.
- The repo description ends with a marker: `[autogenix:<project_id>]`.
- On 422 (name exists): fetch `/repos/<login>/<name>`. Reuse it **only** if its description contains this project's marker, which happens on a redeploy or a Celery retry. That makes creation idempotent. Otherwise return `❌ A repo named <name> already exists in your account and was not created by Autogenix for this project. Rename or delete it, then deploy again.` Nothing is written.
- The Deployer prompt step 1 becomes "create_github_repo — creates (or reuses this project's) private repo".

## Files expected to change

- `server/app/agents/deploy_context.py` (new)
- `server/app/agents/tools/deploy_tools.py`: `get_deploy_tools(docker, github_token, railway_api_key, app_env_vars, repo_name, project_id)`, `create_github_repo`, `deploy_to_railway`
- `server/app/agents/workflow.py`: `GraphState`, `_DEPLOYER_SYSTEM`, `deployer_node`
- `server/app/tasks/build_worker.py`: `deploy_confirm_task`, initial state dicts
- `server/app/api/routes/v1/message_routes.py`, `server/app/api/routes/v1/env_vars.py`: encrypt before `.delay`
- `AGENTS.md` section 12: update the "Fix before re-enabling Deployer" lines

No schema change, no frontend change, and no `enums.py`/`workflow.ts` contract change.

## Out of scope

- Re-enabling the Deployer edges (E1), D4 (verdict fails open), D5 (`procps`).
- The zero-knowledge `ProjectEnvVar` store: at confirm time the browser still sends plaintext vars over HTTPS, by design.
- Any change to `react.py` redaction.

## Security considerations

- After this change, no secret is passed to `update_state`, returned from a node, put in `GraphState`, put in a Celery argument in plaintext, or put in an LLM message.
- The deploy context lives only in worker memory, for the duration of one task, and is discarded in `finally`.
- Repo creation can no longer target or overwrite an existing user repo, and can't be made public by the model.
- The process-local context is a deliberate limit: it must not be used across tasks or processes.

## Acceptance criteria

1. `grep -n "github_token\|railway_api_key\|plaintext_vars" server/app/agents/workflow.py` shows no use in state or prompts.
2. `deploy_confirm_task` arguments contain no plaintext env vars or tokens.
3. The deployer user prompt and the `deploy_to_railway` tool input contain env var names only, never values.
4. `create_github_repo` with an existing unrelated repo of the same name returns the refusal and makes no write.
5. Calling it twice for the same project creates one repo, and the second call reuses it.
6. The created repo is private even if the model asks otherwise (there is no parameter to ask).
7. `deployer_node` with no deploy context fails with a clear message and does not call any tool.

## Checks to run

- `cd server; python -c "from app.main import app"`
- `python -c "from app.tasks.build_worker import deploy_confirm_task; from app.agents.workflow import build_workflow"` (or whichever factory exists)
- Scratchpad script (not committed): slug and repo-name function, deploy-context put/take/discard, encrypt → decrypt round trip of env vars, `create_github_repo` 422 handling with a stubbed `requests` (no network).
- `security-review` on the diff.

## Manual test

The full deploy path is unreachable while the graph ends after Artificer (E1), so:

1. Run the scratchpad checks above (I run these).
2. Optional, against your real GitHub (you run it or tell me to): call `create_github_repo` from `get_deploy_tools(...)` for a fake project id twice → one private repo with the `[autogenix:<id>]` marker. Create a repo by hand with the same name but without the marker, and confirm the tool refuses. Delete the test repos.
3. Confirm no secrets sit in existing checkpoints (read-only query on your database):
   `SELECT count(*) FROM checkpoints WHERE checkpoint::text ILIKE '%github_token%';` → expect 0. If not 0, tell me before deleting anything.
4. End-to-end deploy is tested once E1 re-enables the graph.
