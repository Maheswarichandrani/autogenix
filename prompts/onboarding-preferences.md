# Implementation prompt: onboarding preferences and multi-stack builds

## Goal

Make onboarding answers change what gets built, across six stacks.

- Onboarding asks two questions: stack and developer level.
- Offered stacks: FastAPI, Flask, Django, Express, Spring Boot, Go + Gin.
- The stack step tells the user how the default works.
- Agents use the saved stack when the chat names none. A supported stack named in chat overrides it.
- Each build runs in a sandbox image that matches its stack.
- A request for an unsupported stack is declined before any container starts.

## Skills read

- `fastapi`, for Pydantic and route conventions. Project overrides in AGENTS.md section 4 apply.
- `celery-expert`, for task arguments. Project overrides apply.
- `langgraph-fundamentals` is not needed, because the graph shape does not change.

## Code inspected

| File | What matters |
| --- | --- |
| `client/app/getting-started/page.tsx` | `STEPS` drives the form, so removing a step is mostly data |
| `client/types/user.ts` | `UpdateUserData` requires `preferred_language` and is used only by onboarding |
| `server/app/schemas/user_schemas.py` | `preferred_stack` accepts any string |
| `server/app/api/routes/v1/user_routes.py` | Onboarding route passes the three values to the repo |
| `server/app/repositories/user_repo.py` | `complete_onboarding` already skips empty values |
| `server/app/api/routes/v1/message_routes.py` | Enqueues both workflow tasks and has `current_user` available |
| `server/app/tasks/build_worker.py` | Builds `current_user_input` in three places: lines 368, 507, 542 |
| `server/app/agents/workflow.py` | Conductor sets `tech_stack_hint`. Artificer prints it into its prompt. `_infer_run_config` already handles Node, Java, and Go |
| `server/app/core/docker_manager.py` | One image and fixed limits in `spin_up`, 300s install timeout, `exec` default 120s. `STACK_DEFAULTS` has `springboot` and no Gin entry |
| `server/app/agents/tools/docker_tools.py` | `exec_command` uses the 120s default. `check_syntax` skips Go and Java |

## Decisions and assumptions

1. **One stack table.** New `server/app/core/stacks.py` holds each stack's language, image, limits, and timeouts. Schemas, the Conductor guard, and `DockerManager` all read from it.
2. **Preferences travel in `current_user_input`.** The route reads them from `current_user` and passes them on each message. This needs no new `GraphState` fields, survives stale-build resets, and picks up changes on the next message, even on old threads.
3. **Defaults are applied in code, not by the LLM.** After `start_build`, a pure function fills in missing values and rejects unsupported ones. The Conductor prompt also states the rule, but the code is the guarantee.
4. **Fallback stack is FastAPI.** Users with no saved stack, or an old one such as `nextjs` or `rust`, get FastAPI. No data migration is needed.
5. **`preferred_language` column stays.** The onboarding route saves the language from the stack table.
6. **Limits come from the stack table only.** The agent cannot set them, which keeps the existing rule in `docker_manager.py`.
7. **Stack table values:**

| Key | Language | Image | Memory | CPU | Command timeout | Install timeout |
| --- | --- | --- | --- | --- | --- | --- |
| `fastapi` | python | `settings.DOCKER_BASE_IMAGE` | 512m | 50% | 120s | 300s |
| `flask` | python | `settings.DOCKER_BASE_IMAGE` | 512m | 50% | 120s | 300s |
| `django` | python | `settings.DOCKER_BASE_IMAGE` | 512m | 50% | 120s | 300s |
| `express` | javascript | `node:22-slim` | 512m | 50% | 120s | 300s |
| `gin` | go | `golang:1.24-bookworm` | 512m | 50% | 300s | 300s |
| `springboot` | java | `maven:3.9-eclipse-temurin-21` | 1536m | 100% | 600s | 600s |

8. **All images must support `apt-get`,** because `spin_up` installs git and curl with it, and the health check needs curl.
9. **`developer_level` reaches Conductor only for now.** It changes how Conductor explains things, never what gets built.
10. **No migration and no event changes,** so `client/types/workflow.ts` and `enums.py` stay as they are.

Assumption: the values in the table are starting points. Real test builds may change Go or Spring limits.

## Files to touch

| File | Change |
| --- | --- |
| `server/app/core/stacks.py` | New: stack table, `PreferredStack`, `_resolve`-style helper |
| `server/app/core/docker_manager.py` | Accept a stack, use its image, limits, and timeouts. Add `gin` to `STACK_DEFAULTS` |
| `server/app/agents/tools/docker_tools.py` | `exec_command` uses the manager's stack timeout |
| `server/app/agents/workflow.py` | Conductor prompt and guard, Artificer prompt, pass stack to `DockerManager` and three `reattach` calls |
| `server/app/tasks/build_worker.py` | Accept preferences, add them at the three `current_user_input` sites |
| `server/app/api/routes/v1/message_routes.py` | Pass `preferred_stack` and `developer_level` to both tasks |
| `server/app/api/routes/v1/user_routes.py` | Save language from the stack table |
| `server/app/schemas/user_schemas.py` | Use `PreferredStack`, remove language from the onboarding request |
| `client/app/getting-started/page.tsx` | Remove language step, set six stack options, add note |
| `client/types/user.ts` | Remove `preferred_language` from `UpdateUserData`, update stale comments |
| `AGENTS.md` | Pending decision notes, committed with this work |

## Requirements

### Stack module

- `PreferredStack = Literal["fastapi", "flask", "django", "express", "springboot", "gin"]`.
- `get_stack(key)` returns the table entry, falling back to `fastapi`.
- `resolve_tech_stack(tech_stack, preferred_stack) -> tuple[dict | None, str | None]` returns `(resolved stack, unsupported name)`, with one of the two `None`.
  - Comparison ignores case, spaces, and punctuation.
  - Aliases: `node`, `nodejs` → `express`. `spring`, `spring boot` → `springboot`. `golang` → language `go`.
  - Language without a framework: `python` uses the saved stack if it is Python, otherwise `fastapi`. `javascript` and `typescript` → `express`. `go` → `gin`. `java` → `springboot`.
  - Nothing named: saved stack if supported, otherwise `fastapi`.
  - Anything else: return the unsupported name.
  - The result keeps other keys such as `database`, sets `framework` to the table key, and sets `language` from the table.

### Frontend

- `STEPS` has two steps. Stack options are FastAPI, Flask, Django, Express, Spring Boot, and Go + Gin.
- `STEPS` entries may carry an optional `note`. The stack step shows this text between the card header and the options:

  > This is your default stack. If you don't mention a stack in chat, Autogenix builds with this one. If you ask for a supported stack in chat, Autogenix follows your message instead.

- Remove `preferredLanguage` from form state, hidden inputs, validation, and `canSubmit`.
- Reuse existing components and Tailwind patterns. No other visual changes.

### Backend schema

- `OnboardingCompleteRequest.preferred_stack` uses `PreferredStack` and is required. `preferred_language` is removed from this request.
- `UserUpdate.preferred_stack` uses it as optional.
- `UserResponse` stays `str | None`, so old saved values still load.

### Passing preferences

- `start_workflow_task` and `resume_workflow_task` gain `preferred_stack: str | None = None` and `developer_level: str | None = None`. Defaults keep tasks queued before the deploy working.
- All three `current_user_input` dicts include both values.

### Conductor

- `CONDUCTOR_SYSTEM` gains `{default_stack}` and `{developer_level}` and these rules:
  - Autogenix builds backends with FastAPI, Flask, Django, Express, Spring Boot, or Go + Gin.
  - If the user names a supported stack, use it. If they name none, leave `tech_stack` empty and the default is applied.
  - If the user asks for anything else, call `respond_to_user`, say it is not supported yet, and list the supported stacks.
  - Match explanation depth to the developer level. Never change build scope because of it.
- Unknown levels fall back to `beginner`. Saved stacks pass through `get_stack`, so only validated values reach the prompt.
- In `start_build`: when a name comes back unsupported, stream a decline message, publish `stage_change` to `IDLE` and `done`, and return `build_requested: False`. No container starts. Otherwise store the resolved stack in `tech_stack_hint`.

### Sandbox

- `DockerManager.__init__` gains `stack: str | None = None`, and uses `get_stack` for image, memory, CPU, and timeouts.
- `DockerManager.reattach` accepts the same argument. The three callers in `workflow.py` pass the framework from `tech_stack_hint`, so fix passes keep the right timeouts.
- `start_app` uses the stack's install timeout. `exec_command` uses its command timeout.
- `STACK_DEFAULTS` gains `gin` with `go mod tidy && go build -o app .` and `./app`.
- `RunConfig.from_dict` keeps working for all six keys.

### Artificer

- Rule 2 names each stack's dependency file: `requirements.txt`, `package.json`, `go.mod`, `pom.xml`.
- `RUN_CONFIG` examples cover Flask, Express, Gin, and Spring Boot. Spring Boot uses `startup_wait_secs` of 30.
- New rule: for Go and Java, run the build as the check, because `check_syntax` skips those files.
- Keep doubled braces in the prompt.

## Out of scope

- Editing preferences in settings. Today's settings page has no such control, so chat is the only override.
- A syntax-check tool for Go and Java.
- Email fix, build limits, and billing display.
- Passing `developer_level` to Artificer or Guardian.
- Re-enabling Guardian and Deployer, so generated Dockerfiles and Railway deploys stay untested for new stacks.

## Security considerations

- Stack and level are validated before entering a prompt.
- The `Literal` blocks arbitrary text through onboarding and `PATCH /users/me`.
- Images are pinned to a major version and come only from the stack table, never from user input.
- A larger Spring limit costs more on the host, so it stays fixed in code.
- No token or secret is added to task arguments or graph state.
- Saved preferences are read from `current_user`, so one user cannot set another's.

## Acceptance criteria

- Onboarding shows two steps, six stacks, and the note on the stack step.
- Finishing onboarding saves `preferred_stack`, `developer_level`, and the matching `preferred_language`, then goes to `/home`.
- A `POST` with `preferred_stack: "rust"` returns 422.
- "Build a todo API" with no stack named builds with the saved stack.
- "Build a todo API with Django" uses Django when the saved stack is FastAPI.
- "Build a todo API in Rust" is declined, with no `build-*` container created.
- **All six stacks complete a real build:** app starts, and `/health` returns 200.
- Any stack that still fails after reasonable fixes is removed from the onboarding list and `PreferredStack`, then reported.
- `resolve_tech_stack` passes the cases below.

| Chat stack | Saved | Result |
| --- | --- | --- |
| none | `flask` | `flask` |
| none | `nextjs` | `fastapi` |
| none | none | `fastapi` |
| `Fast API` | `flask` | `fastapi` |
| `Django` + `postgres` | `flask` | `django`, keeps `postgres` |
| `node` | `flask` | `express` |
| `Spring Boot` | `flask` | `springboot` |
| language `golang` | `flask` | `gin` |
| language `python` | `express` | `fastapi` |
| language `python` | `django` | `django` |
| `rust` | `flask` | unsupported |
| `nextjs` | `flask` | unsupported |

## Checks to run

- `client/`: `npm run lint`, `npm run build`.
- `server/`: `python -c "from app.main import app"`.
- `server/`: a one-off script asserting the table above.
- `server/`: confirm `CONDUCTOR_SYSTEM.format(...)` and `_ARTIFICER_SYSTEM.format(...)` raise no `KeyError`.
- Manual test below. Real builds need Docker, Redis, the worker, and working LLM keys, and they spend LLM credits. If any is unavailable, report that this was not run.

## Manual test steps

1. Pull images first, so builds don't wait on them: `docker pull node:22-slim`, `docker pull golang:1.24-bookworm`, `docker pull maven:3.9-eclipse-temurin-21`.
2. Start Redis, the Celery worker, FastAPI, and Next.js. The worker must restart to load the new task arguments.
3. Reset onboarding for a test user: set `onboarding_completed` to 0, then sign out and back in.
4. Confirm `/getting-started` shows two steps, six stacks, and the note.
5. Choose Flask and Beginner, then finish. Confirm the `users` row and the redirect to `/home`.
6. Create a project and send "Build a todo API". Confirm Flask is used.
7. For each stack, create a new project and send "Build a todo API with <stack>". Confirm the right image with `docker ps` and a healthy app.
8. New project: send "Build a todo API in Rust". Confirm the decline message, and that `docker ps -a` shows no new `build-*` container.

## Branch

`feature/onboarding-preferences`, from `develop`.

## Changes made during implementation

- **Per-stack timeouts dropped.** `DockerManager.exec` ignores its `timeout` argument, so commands never time out and the table's timeout columns would do nothing. `reattach` and `exec_command` therefore stay unchanged. The defect is recorded in AGENTS.md section 9 and needs its own fix.
- **Standing UI rule added.** The user asked for consistent design and full responsiveness across the application, so AGENTS.md section 3 now says so. This change applies it to the onboarding page only.
