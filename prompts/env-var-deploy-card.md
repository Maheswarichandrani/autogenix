# Env-var deploy card

## Goal

When a build passes Guardian, the user can approve the deploy from the browser. The
`env_var_request` (and fallback `connect_railway`) artifact renders as a clean,
professional form card instead of a JSON dump. The user connects Railway if needed,
enters env vars (or none), clicks Deploy, and the existing `provide_env_vars` →
`deploy_confirm_task` path runs. The card survives a page reload.

## Skills read

- AGENTS.md (sections 2, 3, 5, 7, 11, 12)
- `fastapi` skill (route validation, match existing `= Depends(...)` style)
- `security-review` will run after the change (touches tokens and deploy secrets)

## Code inspected

- `client/components/workspace/artifact-card.tsx`: generic card, dumps `JSON.stringify(content)`.
- `client/components/workspace/assistant-message.tsx:56` and `streaming-message.tsx:116`: the two places that render `ArtifactCard`.
- `client/hooks/use-workflow.ts:252,313`: `sendAction`, which handles optimistic user message + running state.
- `client/components/workspace/workspace-client.tsx:40`: owns `useWorkflow`.
- `client/lib/api/config.ts`, `messages.ts`, `fetch.ts`: API helpers.
- `server/app/agents/workflow.py:1126` `deploy_gate_node`, `:1179` `_publish_env_var_request`: publishes the card over SSE only. **Not persisted**, so it vanishes on reload.
- `server/app/api/routes/v1/message_routes.py:158`: `provide_env_vars`. `if not body.vars` rejects `{}`, so **"submit an empty form" returns 422**.
- `server/app/api/routes/v1/env_vars.py`: `account_router` (`GET /account/credentials`, `POST /account/railway-key`). **Never registered in `main.py`**, so the browser cannot save a Railway key.
- `env_vars.py:140-160`: saving the Railway key fires `railway_connect_task` on the user's *most recently updated* project (can be the wrong project).
- `server/app/tasks/build_worker.py:648` `railway_connect_task`: resumes the deployer with no `deploy_context`, so `deployer_node` errors with "deploy context missing" (`workflow.py:1335`). **The connect_railway path is broken end to end.**
- `build_worker.py:741-770` `deploy_confirm_task`: if no Railway key, emits `connect_railway` and returns. The submitted env vars are discarded.
- `build_worker.py:185-215` `_save_state_to_db`: persists `state["artifacts"]` (`temp_id`, `artifact_type`, `title`, `content`) and swaps temp ids in message blocks.

## Decisions and assumptions

1. **Design:** no design reference exists. The user approved composing a clean, professional card from existing shadcn parts (`Card`, `Input`, `Label`, `Button`, `Badge`, `Alert`, `Separator`, `Tooltip`) and lucide icons, matching current workspace spacing and tokens. No new UI library.
2. **One card, two artifact types.** `env_var_request` and `connect_railway` both render `DeployCard`. The card reads `GET /account/credentials` and shows a Railway step only when Railway is not connected. Railway is saved *before* the vars are submitted, so the `deploy_confirm_task` "no Railway key" branch becomes a rare guard. When it fires, its `connect_railway` card is the same full form, so the user re-enters vars and nothing silently goes missing.
3. **Remove the auto-resume** from `POST /account/railway-key` (the `railway_connect_task.delay` block). It targets a guessed project and resumes into a guaranteed error. The endpoint now only saves the key. `railway_connect_task` is left in place but unused. Deleting it is a separate cleanup.
4. **Register only `account_router`** in `main.py`. `env_router` (browser-encrypted ProjectEnvVar store + a second `deploy-confirm`) stays unregistered. It is a separate feature with its own path and is out of scope.
5. **Persist the card (revised during implementation).** The first plan routed it through `state["artifacts"]` + `messages_to_save`. A DB check showed `_save_state_to_db` re-saves earlier messages (one conductor message is stored 4 times; `_saved_msg_count` is never advanced), so the card would be duplicated on the next save. Instead the worker persists the card itself: when `_stream_until_interrupt_or_end` parks at `deployer`, a helper `_persist_deploy_card` writes one `Artifact` + one `deployer` message. It is idempotent: it skips if an unsubmitted card of the same type for that build already exists. The `connect_railway` fallback uses the same helper. The duplicate-message bug is a separate defect, left for its own branch.
6. **Build FK guard.** Artifacts carry `build_id` with an FK to `builds`. Because of the known "Build row never created" bug, the helper sets `Artifact.build_id` only when that Build row exists, otherwise `None` (the id is still inside `content`).
7. **Submitted state.** On a successful `provide_env_vars`, the route sets `status: "submitted"` and `submitted_keys: [...]` (names only, never values) on the latest `env_var_request`/`connect_railway` artifact for this project. The card renders read-only when `content.status === "submitted"`, and also immediately after a local submit.
8. **Wiring the action.** A small `WorkspaceActionsContext` (provided in `workspace-client.tsx`) exposes `projectId` and `sendAction`, so the card uses the same `sendAction` path as chat (optimistic message, running state) without prop-drilling through message components.
9. **Branch:** `feature/env-var-card` from `feature/pipeline-loops`. That branch holds the deploy-gate work this depends on and is not merged into `develop` yet.

## Card design (built from shadcn parts)

```
┌───────────────────────────────────────────────────────────┐
│ [Rocket]  Ready to deploy                [Waiting for you] │
│           Built and security-tested. Add the environment   │
│           variables your app needs, or deploy without any. │
├───────────────────────────────────────────────────────────┤
│ RAILWAY                                                    │
│  ✓ Railway connected                     (when connected)  │
│  ─ or ─                                                    │
│  API token  [••••••••••••••••••••••]      (when not)       │
│  Create one at railway.com → Account → Tokens  ↗           │
├───────────────────────────────────────────────────────────┤
│ ENVIRONMENT VARIABLES                                      │
│  Key                      Value                            │
│  [DATABASE_URL        ]   [••••••••••••       ] [👁] [🗑]   │
│  [JWT_SECRET          ]   [••••••••••••       ] [👁] [🗑]   │
│  + Add variable                                            │
├───────────────────────────────────────────────────────────┤
│ 🔒 Values are encrypted before queueing and never         │
│    shown to the AI agents.        [ Deploy → ] (primary)   │
└───────────────────────────────────────────────────────────┘
```

- Header: icon in a soft `bg-primary/10` square, title `text-sm font-semibold`, muted description, status `Badge`: `Waiting for you` / `Deploying…` / `Submitted`.
- Section labels: small uppercase muted `text-xs tracking-wide`, separated by `Separator`.
- Rows: `grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]`. On mobile the key stacks above the value, and the buttons sit at the row end. Keys use a mono font. Values are `type="password"` with an eye toggle per row. Remove is a ghost icon button with a tooltip.
- Prefill: one row per `suggested_vars` key, values empty. No suggestions means an empty list plus "Add variable".
- Primary button label: `Deploy` with 1+ rows, `Deploy without variables` with 0 rows. It shows a spinner while sending.
- Errors: inline under the field (bad key, duplicate, empty value), and a destructive `Alert` at the bottom for request failures.
- Submitted view: header badge `Submitted`, body collapses to "Deploying with N variables" and the key names as small mono badges. No inputs, no values.
- Dark and light mode use existing tokens only. Width follows the chat column. No horizontal scroll at 360px.
- `connect_railway` uses the same card with a description stating Railway must be connected first.

## Files expected to change

Client:
- `client/components/workspace/deploy-card.tsx` (new): the card.
- `client/components/workspace/artifact-card.tsx`: route `env_var_request` / `connect_railway` to `DeployCard`, keep the generic fallback.
- `client/components/workspace/workspace-actions-context.tsx` (new): context + hook.
- `client/components/workspace/workspace-client.tsx`: provide the context.
- `client/lib/api/account.ts` (new) + `config.ts` + `index.ts`: `getCredentials`, `saveRailwayKey`.

Server:
- `server/app/main.py`: include `account_router`.
- `server/app/api/routes/v1/env_vars.py`: drop the auto-resume block in `save_railway_key`.
- `server/app/api/routes/v1/message_routes.py`: accept `{}`, validate keys and sizes, mark the artifact submitted.
- `server/app/agents/workflow.py`: `deploy_gate_node` returns the artifact + message for persistence.
- `server/app/tasks/build_worker.py`: Build-exists guard on `Artifact.build_id`. The `connect_railway` content gains `suggested_vars` from state.

No enum or contract change (`provide_env_vars` already exists in both `enums.py` and `workflow.ts`).

## Requirements

1. `env_var_request` and `connect_railway` render `DeployCard`. Every other type keeps the generic card.
2. The card parses `content` whether it arrives as an object (history API) or a JSON string (SSE).
3. The Railway step shows only when `railway_connected` is false. The token is posted to `POST /api/v1/account/railway-key` before `provide_env_vars`. On failure, stop and show the error.
4. Client validation: key `^[A-Za-z_][A-Za-z0-9_]*$`, no duplicates, value required for every row, at most 50 rows, value at most 8192 chars.
5. Server validation in `provide_env_vars`: `vars` must be present (may be `{}`), the same key regex, max 50 keys, value max 8192 chars, all strings. Return 422 otherwise.
6. After a successful submit, clear values from React state. The card goes read-only and the chat shows the existing "Submitted environment variables" user message via `sendAction`.
7. On reload after `deploy_gate`, the card is present (from history) and interactive if not submitted. After submitting it is read-only.
8. `POST /account/railway-key` only saves the key. It no longer enqueues anything.

## Security considerations

- Values never leave the form except in the one HTTPS POST. They are never logged, stored in localStorage, or put in a URL. Inputs are `autoComplete="off"` and `type="password"` by default.
- The server already Fernet-encrypts vars before `.delay()`, and `deploy_context` keeps them out of graph state, the prompt, and tool inputs. This change must not alter that.
- The persisted artifact content and `submitted_keys` contain **key names only**, never values.
- The Railway token goes only to `/account/railway-key` and is encrypted server-side. It is never echoed back. `GET /account/credentials` returns booleans and the username only.
- Removing the auto-resume closes a wrong-project resume (it picked the user's most recent project, not this one).
- The artifact submitted update is scoped by `project_id` from the ownership-checked project.
- Run `security-review` after the change.

## Acceptance criteria

- A build that passes Guardian shows the designed card, not JSON.
- Deploy with no rows works (no 422) and reaches the deployer.
- With Railway disconnected, the card asks for the token, saves it, then deploys in one click.
- A reload at the deploy gate still shows the interactive card. A reload after submit shows it read-only.
- An invalid key or duplicate key is blocked client-side and rejected server-side.
- No value appears in the worker logs, the API logs, the `artifacts` table, or the `checkpoints` table.
- The layout is clean at 360px and desktop, in light and dark mode.

## Checks to run

- `client/`: `npm run lint`, `npm run build`.
- `server/`: `python -c "from app.main import app"`.
- A real end-to-end build up to the deploy gate (manual steps below).
- `security-review` on the diff.

## Manual test steps

1. Start Docker Desktop, Redis, Celery (`.\start_celery.ps1`), FastAPI, and Next.js.
2. Sign in, create a project, send: `build me a REST API for a todo list with JWT auth`.
3. Wait for Guardian clean. The "Ready to deploy" card appears with `JWT_SECRET` prefilled.
4. Reload the page. The card is still there and editable.
5. Type the key `1BAD` and click Deploy. An inline error shows and nothing is sent.
6. If Railway is not connected, paste the token and enter a `JWT_SECRET` value. Click Deploy.
7. The card turns read-only ("Deploying with 1 variable"), and the deployer stream starts.
8. Reload. The card is read-only and no value is visible.
9. Run `SELECT content FROM artifacts ORDER BY created_at DESC LIMIT 1;` and confirm key names only.
10. Repeat on a fresh project and remove all rows. "Deploy without variables" works.
11. In devtools, resize to 360px wide and toggle dark mode. Check that nothing overflows.
