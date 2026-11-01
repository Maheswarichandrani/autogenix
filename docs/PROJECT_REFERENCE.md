# Autogenix — Project Reference

Detailed background for **Autogenix** (formerly NexusAI), an autonomous multi-agent platform that turns a natural-language request into a built, security-tested, deployed backend application.

[AGENTS.md](../AGENTS.md) holds the working rules and wins on any conflict. This file holds the depth: architecture, auth flows, the defect list, and roadmap designs. Defect notes are a snapshot, so confirm them against the code before acting.

---

## 0. Naming — NEXUS-AI → AUTOGENIX

The product is **Autogenix**. The rename has been applied across the codebase (45 files, ~135 occurrences). `Autogenix` is the only correct name in anything you write.

What changed, for reference when you hit an old branch or a stale container:

| Layer | Old → New |
| --- | --- |
| Backend identity | `APP_NAME = "NexusAI"` → `"Autogenix"`; root endpoint message; `Celery("aibuild", …)` → `Celery("autogenix", …)` |
| Docker network | `DOCKER_NETWORK = "aibuild_network"` → `"autogenix_network"` |
| Agent prompts | `CONDUCTOR_SYSTEM` platform name; `deployer_node` default repo `"nexus-app"` → `"autogenix-app"` |
| Infra | Redis container and Docker network renamed from the old `nexusai-*` prefix to `autogenix-redis` / `autogenix-network` in both compose files and every PowerShell script |
| Frontend | Brand strings in 20 files; Monaco themes `nexus-dark`/`nexus-light` → `autogenix-dark`/`autogenix-light`; sub-brands `NexusForge`/`NexusAgent` collapsed into `Autogenix`/`AutogenixAgent` |
| Database | `DATABASE_URL` database name `nexusai` → `autogenix` in the README. An **existing local database may keep its old name** — it is only a connection string. New setups use `autogenix`. |
| Repo | Clone URL is now `https://github.com/Maheswarichandrani/autogenix.git` |

**Not renamed on purpose:** `server/app/agents/*.bak` (dead files, delete them — §6.13f) and this file's own §6 defect descriptions where the old name is quoted as historical fact.

⚠️ **After pulling the rename:** the Celery app name and the Redis container name both changed. Stop the old worker, `docker rm -f autogenix-redis`, prune stray build containers (`python server/cleanup_containers.py`), and purge the queue before starting again. A worker on the new name will not see tasks queued under the old one.

The working directory is still called `nexus-ai` on some machines. That is cosmetic — git does not care about the folder name. Rename it locally whenever convenient.

### 0.1 Repository and branches

Autogenix lives at **`https://github.com/Maheswarichandrani/autogenix.git`**.

| Branch | Purpose |
| --- | --- |
| `main` | Releasable. Never commit to it directly; it only advances by merging `develop`. |
| `develop` | Integration branch. Feature branches merge here. |
| `feature/<short-name>` | One branch per unit of work. Branch from `develop`, merge back via PR. |

**History note — read this before you go looking for old commits.** The project previously lived at `Srikar132/nexus-ai`, whose `main` carried 32 commits ending 2026-02-27. The branch this repository was seeded from (`srikar`) was started as a **separate git root** on that same day, so the two histories share no common ancestor and cannot be merged. The old `main` is fully superseded — everything unique to it was either relocated (`workspace/code-editor/` → `components/code-editor/`, `build_task.py` → `build_worker.py`, `code-store.ts` → `code-stream-store.ts`), empty (`workflow_approval_tests.py`), or an abandoned earlier approach (`workspace/code-panel/`). It is preserved in the old repository; do not attempt to merge it in.

Local remotes are configured as:

```
origin     https://github.com/Maheswarichandrani/autogenix.git
```

Check `git remote -v` before pushing. `develop` does not exist yet.

---

## 1. What Autogenix is

A user types "build me a REST API for a bookstore with JWT auth". Autogenix then, without further input:

1. **Conductor** decides whether that is a build request or ordinary chat.
2. **Artificer** spins up a Docker container, writes the whole application into `/workspace`, installs dependencies, checks syntax, and starts the app on port 8080.
3. **Guardian** attacks the running app — SQL injection, auth bypass, rate limiting, security headers, source review — and emits a structured verdict.
4. **Artificer (fix pass)** patches whatever Guardian found, restarts the app, and Guardian re-tests (bounded loop).
5. **Deployer** creates a GitHub repo, pushes the workspace, deploys to Railway, and reports the live URL.

Throughout, every reasoning step, tool call, tool result, and generated file streams live to the browser: a chat panel on the left, a Monaco code editor filling up file-by-file on the right.

**Status: steps 3–5 are currently disabled in code.** See §6.

---

## 2. Repository layout

```
autogenix/
├── client/                      Next.js 16 frontend
│   ├── app/                     App Router pages
│   │   ├── (auth)/login/        GitHub sign-in
│   │   ├── (root)/              Landing page
│   │   ├── api/auth/[...nextauth]/  NextAuth route handlers
│   │   ├── getting-started/     Onboarding
│   │   ├── home/                Dashboard, projects, settings
│   │   └── project/[id]/        The workspace (chat + code editor)
│   ├── components/
│   │   ├── workspace/           Chat, streaming message, task panel, sidebars
│   │   ├── code-editor/         Monaco wrapper, file explorer, tabs
│   │   ├── landing-page/        Marketing sections
│   │   └── ui/                  shadcn/ui primitives
│   ├── hooks/                   use-workflow (SSE), use-code-stream, use-typewriter
│   ├── lib/api/                 Typed fetch layer (config, fetch, messages, projects, users)
│   ├── lib/auth.ts              NextAuth v5 config
│   ├── proxy.ts                 Route middleware (Next 16 renamed middleware.ts → proxy.ts)
│   ├── store/                   Zustand: workflow-store, code-stream-store, right-sidebar-store
│   └── types/                   workflow.ts — SSE event union, mirrors server enums
└── server/                      FastAPI backend
    ├── app/
    │   ├── main.py              App factory, CORS, auth middleware, routers
    │   ├── agents/
    │   │   ├── workflow.py      LangGraph StateGraph — the 4 agent nodes
    │   │   ├── react.py         Resumable ReAct loop (reason → act → observe)
    │   │   ├── execution_registry.py  Pause/resume/cancel control plane
    │   │   ├── rag.py           ProjectRAG — pgvector code search (DEAD CODE, §6.4)
    │   │   ├── embedder.py      sentence-transformers all-MiniLM-L6-v2, 384-dim
    │   │   └── tools/           docker_tools, security_tools, deploy_tools
    │   ├── api/
    │   │   ├── middleware/auth.py   NextAuth JWE decryption
    │   │   ├── deps.py              get_current_user
    │   │   └── routes/v1/           user, project, message, build, artifact, env_vars
    │   ├── core/
    │   │   ├── config.py        Pydantic settings from .env
    │   │   ├── database.py      Async SQLAlchemy engine + session
    │   │   ├── docker_manager.py One container per build; write/read/exec/start/reattach
    │   │   ├── llm.py           Provider abstraction: Anthropic | OpenAI | Groq
    │   │   ├── redis.py         Pub/sub bridge worker → SSE
    │   │   └── stream_parser.py
    │   ├── models/              SQLAlchemy 2.0: User, Project, Build, Message, Artifact, ProjectEnvVar
    │   ├── repositories/        Data access per aggregate
    │   ├── schemas/             Pydantic request/response + shared enums
    │   └── tasks/build_worker.py  Celery tasks that drive the LangGraph
    └── alembic/versions/        3 migrations
```

---

## 3. Tech stack — what is actually used

| Concern | Choice | Where |
| --- | --- | --- |
| Frontend framework | Next.js 16.1.6, React 19.2, App Router | `client/` |
| Styling | Tailwind CSS v4, shadcn/ui, Radix, framer-motion | `client/components/ui/` |
| Client state | Zustand (live workflow state), TanStack Query (initial history fetch only) | `client/store/`, `client/hooks/use-workflow.ts` |
| Code editor | Monaco via `@monaco-editor/react`, `react-complex-tree` for the file tree | `client/components/code-editor/` |
| **Authentication** | **NextAuth v5 beta (Auth.js), GitHub OAuth only** | `client/lib/auth.ts`, `client/proxy.ts` |
| API framework | FastAPI 0.129 | `server/app/main.py` |
| ORM | SQLAlchemy 2.0 async + asyncpg; psycopg2/psycopg3 sync in the worker | `server/app/core/database.py` |
| Database | PostgreSQL (Neon-compatible), pgvector extension for RAG | `server/alembic/` |
| Migrations | Alembic 1.18 | `server/alembic/` |
| Background jobs | Celery 5.6 + Redis 7 broker/backend | `server/app/tasks/build_worker.py` |
| Agent orchestration | **LangGraph 1.0.9** with `PostgresSaver` checkpointing | `server/app/agents/workflow.py` |
| LLM providers | Anthropic, OpenAI, Groq behind one interface | `server/app/core/llm.py` |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local, free, 384-dim) | `server/app/agents/embedder.py` |
| Sandbox | Docker SDK — one throwaway container per build | `server/app/core/docker_manager.py` |
| Realtime transport | **Redis pub/sub → SSE via `sse-starlette` EventSourceResponse → browser `EventSource`** | `server/app/core/redis.py`, `client/hooks/use-workflow.ts` |
| Deploy target | GitHub API + Railway GraphQL API | `server/app/agents/tools/deploy_tools.py` |
| Secret encryption | Fernet (server, for OAuth tokens); AES-256-GCM in-browser (project env vars) | `server/app/utils/encryption.py`, `server/app/models/project_env_var.py` |

**Not used, do not introduce:** Clerk, Auth0, Supabase auth, Prisma, tRPC, socket.io (yet — see §7.4), LangChain agents (only `langchain_core.tools` for the `@tool` decorator and `BaseTool` typing).

---

## 4. Authentication — read this before touching anything auth-related

This is the part teams get wrong. There are **two different tokens** and they do different jobs.

### 4.1 The flow

```
Browser                    Next.js (client/)                FastAPI (server/)              GitHub
   │                              │                              │                          │
   │──  click "Sign in" ─────────▶│                              │                          │
   │                              │── OAuth redirect ────────────────────────────────────── ▶│
   │◀──────────────────────────── callback with code ─────────────────────────────────────── │
   │                              │                              │                          │
   │                              │  signIn() callback           │                          │
   │                              │  POST /api/v1/users/signin ─▶│                          │
   │                              │  { github_token }            │  verify token w/ GitHub ▶│
   │                              │                              │  upsert User row         │
   │                              │                              │  Fernet-encrypt the      │
   │                              │                              │  GitHub token → DB       │
   │                              │◀─ { id, email, username,  ───│                          │
   │                              │     onboarding_completed }   │                          │
   │                              │                              │                          │
   │                              │  jwt() callback: put the     │                          │
   │                              │  DATABASE user id in the JWT │                          │
   │                              │                              │                          │
   │◀─ Set-Cookie: ───────────────│                              │                          │
   │   authjs.session-token       │                              │                          │
   │   (encrypted JWE, HttpOnly)  │                              │                          │
   │                              │                              │                          │
   │── any API call, cookie sent ────────────────────────────── ▶│  NextAuthJWTMiddleware   │
   │                              │                              │  HKDF-derives key from   │
   │                              │                              │  the shared secret,      │
   │                              │                              │  decrypts the JWE,       │
   │                              │                              │  sets request.state      │
```

### 4.2 The two tokens

| Token | Lives where | Purpose | Never do |
| --- | --- | --- | --- |
| **GitHub OAuth access token** | Fernet-encrypted in `users.github_token_encrypted`. Decrypted only inside a Celery task, in memory, for the duration of a deploy. | Create repos, push code on the user's behalf. Scope: `read:user user:email repo`. | Never put it in the session, never send it to the browser, never log it. `client/lib/auth.ts` explicitly strips it from the session — keep it that way. |
| **NextAuth session JWE** | `authjs.session-token` HttpOnly cookie. | Proves identity to FastAPI. Carries `{ id, email, username, onboardingCompleted }` where `id` is the **Postgres user id**, not the GitHub id. | Never read it in client JS; it is HttpOnly and encrypted. Never use `getSession()` inside a server-side NextAuth callback — `client/lib/auth.ts` documents why (it throws; use plain `fetch`). |

### 4.3 Server-side verification

`server/app/api/middleware/auth.py` runs on **every** request. It:

- lets `OPTIONS` (CORS preflight), `/`, `/docs`, `/openapi`, `/redoc`, `/health` and `/api/v1/users/signin` through unauthenticated;
- otherwise calls `JWT_HANDLER(request)` from `fastapi_nextauth_jwt`, which reads the cookie, derives the decryption key via HKDF from the shared secret, and decrypts the JWE;
- sets `request.state.user_id`, `request.state.user_email`, `request.state.user_jwt`;
- returns 401 on any failure.

`app/api/deps.py::get_current_user` then loads the `User` row from `request.state.user_id`. **Every route depends on it.** Ownership is enforced per query — `ProjectRepo.get_by_id(project_id, user_id)` always takes the user id; never write a repository method that fetches by id alone.

### 4.4 Route protection on the frontend

`client/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts` — this is not a mistake) wraps `auth()` and:

- redirects signed-in users away from `/login` and `/` to `/home`;
- redirects anonymous users to `/login` for anything non-public;
- forces users with `onboardingCompleted === false` to `/getting-started`.

### 4.5 ⚠️ Live secret-name mismatch — fix this first

The shared secret **must be byte-identical** on both sides or every API call 401s.

| Side | Variable currently read | File |
| --- | --- | --- |
| Client | `AUTH_SECRET` | `client/lib/auth.ts` (`secret:`) |
| Server | `NEXTAUTH_SECRET` | `server/app/core/config.py` |
| README documents | `NEXTAUTH_SECRET` on both | `README.md` |

Likewise the GitHub app credentials: `client/lib/auth.ts` reads `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, while `README.md` tells you to set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`. **The code wins.** Pick one naming scheme, apply it to code + README + a committed `.env.example`, and delete the other.

---

## 5. How a request flows end to end

### 5.1 Write path

```
POST /api/v1/projects/{id}/messages   { action: "send_message", content: "..." }
  ↓ message_routes.send_message
  ↓ persist a user Message row, mint or reuse project.langgraph_thread_id
  ↓ Celery: start_workflow_task (first message) | resume_workflow_task (subsequent)
  ↓ [Celery worker process]
  ↓ build_worker._workflow()  → cached compiled LangGraph + PostgresSaver pool
  ↓ wf.stream(...) drives nodes until an interrupt or END
  ↓ each node calls run_react_agent(), which calls tools, which publish to Redis
```

### 5.2 Read path

```
Redis channel project:{id}:stream   ← publish() from the worker (sync client)
Redis channel project:{id}:code     ← publish_code() from write_file/delete_file
  ↓ FastAPI GET /messages/stream and /messages/code-stream
  ↓ redis.subscribe_and_stream() async generator
  ↓ sse_starlette.EventSourceResponse(ping=15)   ← NOT StreamingResponse, see §5.4
  ↓ browser EventSource
  ↓ useWorkflow.onmessage → flushSync(handleSSEEvent) → Zustand → React
```

### 5.3 The event taxonomy

`client/types/workflow.ts` and `server/app/schemas/enums.py` are mirrors. Change one, change the other in the same commit.

| Event | Meaning | UI behaviour |
| --- | --- | --- |
| `stage_change` | Pipeline stage moved | Header stage pill |
| `thinking` | Transient status | **Replaces** the single status line |
| `step` | A tool is about to run | **Appends** a row to the step timeline |
| `tool_call` / `tool_result` | Tool detail, `is_error` flag | Nested under its step row |
| `text_chunk` | One word of the agent's prose | Appends, drives the typewriter |
| `agent_start` / `agent_done` | Agent bracket | Opens/closes a message bubble |
| `file_created` / `file_deleted` | Code panel only, separate channel | Monaco file tree + tab |
| `artifact` | Structured card (`env_var_request`, `connect_railway`) | Renders an interactive card |
| `agent_paused` / `agent_resumed` / `agent_cancelled` / `model_switched` | Human-in-the-loop control | Pause banner with Continue / Switch model / Cancel |
| `done` / `build_failed` / `close_stream` / `error` | Terminal | Settles the UI; the SSE connection deliberately stays open |

### 5.4 Two streaming traps already solved — do not regress them

1. **Server:** FastAPI's `StreamingResponse` buffers in uvicorn and delivers every event in one burst at the end. `EventSourceResponse` from `sse-starlette` flushes per event. `server/app/api/routes/v1/message_routes.py` carries a long comment about this. Do not "simplify" it back.
2. **Client:** React 18+ batches state updates from native listeners, including `EventSource.onmessage`, so 200 `text_chunk` updates collapse into one render. `client/hooks/use-workflow.ts` wraps only the high-frequency events in `flushSync`. Do not add `flushSync` to one-shot events — it degrades performance.

---

## 6. Known defects — verified, with file and line

These are real, present in `main` as of this writing, and must be understood before any feature work. Several make whole features unreachable.

### 6.1 🔴 The pipeline is cut off after Artificer

`server/app/agents/workflow.py:1338`

```python
# TEMPORARY: End workflow after artificer for debugging
graph.add_edge("artificer", END)
# COMMENTED OUT FOR ARTIFICER DEBUGGING:
# graph.add_conditional_edges("guardian", route_after_guardian, {...})
# graph.add_edge("artificer_fix", "guardian")
# graph.add_edge("deployer", END)
```

`guardian`, `artificer_fix` and `deployer` are registered as nodes but **unreachable**. There is no security testing, no fix loop, no deploy. `interrupt_before=["deployer"]` never fires, so `deploy_confirm_task` and `railway_connect_task` can never run. The env-var request card is never emitted.

Related debug residue shipped to users: `workflow.py:565` publishes `"🔧 ARTIFICER STAGE COMPLETE - Workflow ended for debugging."`

### 6.2 🔴 `Build.metadata_` does not exist

`server/app/tasks/build_worker.py:227-229` does `build.metadata_ or {}` then assigns to it. `server/app/models/build.py` has **no** `metadata_` column — it has `progress: JSONB`. (`metadata` itself is reserved by SQLAlchemy Declarative, hence the underscore convention used on `Message`.) Any build that produces a `run_config` raises `AttributeError` at persist time, which the task's `except` swallows into a `build_failed` event.

Fix: add a `metadata_` JSONB column via Alembic (mirroring `Message.metadata_`), or write to `progress`. Pick one and make `docker_manager.py`'s docstring — which claims `run_config` is "stored as a plain dict in `Build.metadata`" — agree with it.

### 6.3 🔴 The env-vars router is never registered

`server/app/api/routes/v1/env_vars.py` (328 lines) implements the zero-knowledge encrypted env var store. `server/app/main.py` includes user, project, message, build and artifact routers — **not** this one. The `ProjectEnvVar` model and its migration exist; the API does not. Dead feature.

### 6.4 🔴 RAG is fully implemented and fully unused

`agents/rag.py` (ProjectRAG), `agents/embedder.py` (MiniLM), `repositories/rag_repository.py` (pgvector + HNSW index) form a working vector search stack. **Nothing imports them.** Grep confirms zero call sites outside their own files. Consequences:

- The `code_chunks` table is created by raw DDL in `rag_repository.ensure_schema()`, not by Alembic, and is never invoked, so the table does not exist.
- `project_id` there is `TEXT` with no FK to `projects.id` — orphan rows on project delete.
- Agents re-read files through `read_file` with no semantic recall of the codebase.

### 6.5 🔴 `requirements.txt` is corrupt and incomplete

> Partly fixed in the working tree: the file is now readable text and includes `sse-starlette`. The unrelated packages and the missing `langchain-openai` remain.

- Encoded **UTF-16** (from a PowerShell `>` redirect), so some tooling cannot parse it.
- Polluted with an entire unrelated Zope/Grok/ZODB stack (`zope.*`, `grokcore.*`, `ZODB`, `BTrees`, `Chameleon`, `z3c.*` — 60+ packages) from a `pip freeze` of a dirty global environment.
- **Missing `sse-starlette`**, which `message_routes.py` imports at module level. A fresh `pip install -r requirements.txt` produces a server that cannot start.
- Also missing `langchain-openai`; `pgvector`, `torch`, `transformers` and `sentence-transformers` (~2 GB) are pulled in for a feature that does not run (§6.4).

Fix: hand-write a real `requirements.txt` (UTF-8, direct dependencies only) or move to `pyproject.toml` + `uv`/`pip-tools`.

### 6.6 🔴 Cancel does not cancel a *running* agent

`execution_registry._registry` is a module-level dict **inside the Celery worker process**. The FastAPI process has its own, always-empty copy.

- `mark_cancelled()` has **zero call sites** anywhere in the codebase.
- `is_cancelled()` reads the worker-local dict, which nothing ever sets to `CANCELLED`.
- `POST /messages` with `agent_cancel` only publishes a Redis signal, and that signal is read **only** inside `wait_for_control_signal()`, i.e. only while the agent is already parked at a pause.

So the pause/continue/switch-model path works; cancelling a mid-flight agent silently does nothing. The API also ignores the boolean returned by `send_control_signal`, so the user is told "cancelled" when no subscriber received it.

### 6.7 🔴 Plaintext deploy credentials reach the LangGraph checkpoint

`build_worker.deploy_confirm_task` does `wf.update_state(config, {"deploy_payload": {...github_token, railway_api_key...}})`. `update_state` **writes a checkpoint row to Postgres**. The payload is wiped afterwards, but the intermediate checkpoint — containing decrypted GitHub and Railway tokens in plaintext — persists in the `checkpoints` table's history. The `GraphState` comment claims "Wiped after use — NEVER persisted"; that is not what the code does.

Fix: never put credentials in graph state. Pass them out-of-band — a short-TTL Redis key, or fetch and decrypt them inside `deployer_node` from the DB.

### 6.8 🟠 Celery concurrency deadlock on pause

`start_celery.ps1` runs `--pool=solo --concurrency=2`. **`solo` ignores concurrency — it is a single process.** A paused ReAct agent blocks on `wait_for_control_signal()` for up to `PAUSE_TIMEOUT_SECS = 300`, holding that one process. During those 5 minutes, **no other project in the entire system can build**. `react.py` documents holding the slot as intentional; that is only defensible with a real pool and per-project queues.

### 6.9 🟠 Security verdict fails open

`workflow._parse_security_verdict` returns `[]` — "no issues" — when the `<<<SECURITY_VERDICT>>>` block is missing or malformed. A Guardian that crashes, truncates, or simply forgets the format reads as a clean bill of health. A security gate must fail **closed**.

### 6.10 🟠 Duplicated and misused iteration constants

- `config.py` declares `MAX_SECURITY_ITERATIONS: int = 5`. It is never read.
- `workflow.py:877` hardcodes `MAX_SECURITY_ITERATIONS = 2` and uses that.
- `workflow.py:939` passes that same constant as `max_iter` to `run_react_agent` for the source-only Guardian review — a *loop-count* constant reused as a *ReAct iteration budget*, capping source review at 2 steps.

### 6.11 🟠 Fake typewriter runs inside the worker

`workflow._stream_text` and `react._stream_final_text` `time.sleep(0.015)` **per word** while publishing. A 400-word response blocks the Celery worker for 6 seconds doing nothing. The client already animates via `use-typewriter.ts`. Publish the text in one event (or in chunks with no sleep) and let the client pace it.

### 6.12 🟠 Redis pub/sub loses events during reconnects

`publish()` is fire-and-forget. If no subscriber is attached — page reload, tab switch, the 3-second `connectSSE` retry window, a dropped Wi-Fi — those events are **gone permanently**. There is no replay, no cursor, no buffer. The user sees a build that jumps from "Writing app.py" to "done". This is the strongest argument for the transport rework in §7.4.

### 6.13 🟡 Smaller items

| # | Item | Location |
| --- | --- | --- |
| a | Dead line: `db.get(Project if build_id else None.__class__, ...)` immediately re-done on the next line | `build_worker.py:256` |
| b | `print()` of user id and email instead of `log.info` | `api/middleware/auth.py:36` |
| c | CORS origin hardcoded to `http://localhost:3000` — no env var, breaks any deploy | `main.py:26` |
| d | No rate limiting, no request size limits, no per-user build quota enforcement despite `monthly_builds_used` / `monthly_builds_limit` columns existing on `User` | `models/user.py` |
| e | `Message.role` / `message_type`, `Build.status`, `Artifact.artifact_type` are free-form `String` with the allowed values only in comments — no DB enum, no validation | `models/` |
| f | `.bak` files, `_check_builds.py`, `venvcls/`, and a committed `venv/` in the tree | `server/` |
| g | `store/artifact-store.ts` and `components/workspace/artifact-sidebar.tsx` are 0-byte files | `client/` |
| h | **Zero tests** — no pytest, no vitest, no Playwright, anywhere | repo-wide |
| i | Nine stray `*_SUMMARY.md` / `*_GUIDE.md` / `ISSUE_*.md` files acting as changelog-by-markdown | repo root + `server/` + `client/components/workspace/` |
| j | `workflow.py` is 1356 lines and `build_worker.py` 800 — both need splitting per node/task | `server/app/` |

---

## 7. The repair roadmap

Seven workstreams. Each has a definition of done. Do them in this order — the ordering is a dependency chain, not a preference.

### Phase 0 — Make the thing runnable (prerequisite for everything)

Fix §6.5 (requirements), §6.2 (`Build.metadata_`), §6.1 (re-wire the graph edges), §6.3 (register the env-vars router), §4.5 (secret names). Add `.env.example` for both workspaces. Delete `.bak`/`venv`/`venvcls` from the tree and from git. Without this nobody on the team can reproduce a green run, and every later phase is unverifiable.

**Done when:** a clean clone + documented setup reaches a deployed Railway URL from a single chat message.

---

### 7.1 Human in the loop

**What exists.** More than you would guess. `react.py` implements a genuinely resumable ReAct loop: when the iteration budget is exhausted it publishes `agent_paused` and blocks on a Redis control channel rather than terminating. `execution_registry.py` defines `ControlSignal(action, model, budget)` with `continue` / `switch_model` / `cancel`. `message_routes.py` maps three `UserAction`s onto it. The frontend renders the pause banner. LangGraph's `interrupt_before=["conductor", "deployer"]` provides two graph-level parks.

**What is missing.**

1. **Cancel is broken** (§6.6). The registry must move out of process memory — Redis hash keyed `execution:{project_id}` — so the API can write `CANCELLED` and the worker can read it. `mark_cancelled()` must actually be called from the `agent_cancel` branch.
2. **No approval gates.** The only human decision points are "the agent ran out of budget" and "give me env vars". There is no "approve this plan", "approve this deploy", "approve this dependency", "this migration is destructive — confirm".
3. **Pause state is not durable.** Kill the worker while an agent is paused and the pause is lost; the UI shows a banner for an execution that no longer exists. Persist pause state on the `Build` row.
4. **No timeout policy per surface.** One global `PAUSE_TIMEOUT_SECS = 300` that auto-cancels. A plan approval should wait hours; a "continue?" prompt should not.
5. **No audit trail.** Which human approved what, when, is recorded nowhere. For a final-year project this is exactly the kind of thing that demos well and is cheap to add: a `human_decisions` table, one row per intervention.

**Design.** Introduce a single `InterventionPoint` abstraction: `{ id, project_id, build_id, kind, payload, options[], created_at, resolved_at, resolved_by, decision }`. Every pause — budget exhausted, plan approval, deploy approval, destructive action — emits one. The frontend renders it generically from `kind`. The worker blocks on it via the control channel. One concept, one table, one UI component, instead of four bespoke flows.

**Done when:** a build can be cancelled mid-tool-call; every pause survives a worker restart; every human decision is queryable.

---

### 7.2 Plan mode

**What exists.** Vestigial traces of a removed feature. `Build.status` comments list `planning|waiting_approval|approved`; `Build.approved_plan` is a live JSONB column; `Artifact.artifact_type` comments list `plan`; `BuildRepo.get_active_build` treats `waiting_approval` and `approved` as active; `artifact_routes.PATCH` exists specifically "for editing before approval". And then `schemas/enums.py` declares: *"PIPELINE v2 — No plan/approval. Agents have full autonomy."*

So the schema still believes in plans; the pipeline does not. Today Conductor hands a one-line description straight to Artificer, which starts writing files from a blank container.

**Why it must come back.** It is the single highest-leverage fix in this document. Every downstream cost — wrong tech stack, wrong file layout, 20 wasted ReAct iterations, a Guardian pass against the wrong app, a Railway deploy of something the user did not ask for — is decided in the first thirty seconds by an LLM with no checkpoint. A plan is also the natural place to attach RAG context (§7.7) and existing-codebase context (§7.6).

**Design.**

```
conductor ──start_build──▶ planner ──▶ [interrupt_before] ──▶ artificer ──▶ ...
                              │                                   ▲
                              │         user edits / rejects      │
                              └───────────◀───────────────────────┘
```

- New `planner_node` in `workflow.py`. Input: build description, tech stack hint, RAG context if the project has an existing codebase. Output: a **structured** plan — files to create with one-line purposes, dependencies, endpoints, data model, the run config, and explicit risks. Structured, not prose: the frontend renders it as an editable card, and Artificer consumes it as a checklist.
- Persist it as an `Artifact` with `artifact_type="plan"`, and on approval copy it to `Build.approved_plan` (the column is already there).
- `interrupt_before=["artificer"]`. Build status `waiting_approval`.
- New `UserAction`s: `approve_plan`, `reject_plan` (with a reason, which loops back to `planner` with the critique in context), `edit_plan` (PATCH the artifact, then approve).
- `_ARTIFICER_SYSTEM` changes from "build this description" to "execute this approved plan; do not deviate; if the plan is wrong, say so and stop".

**Done when:** no container is ever created before a human has approved a plan, and Artificer's prompt contains the plan rather than the raw user sentence.

---

### 7.3 Error management

**What exists.** Defensive `try/except` sprayed generously — `artificer_node` alone has seven nested handlers with string-matching on exception messages (`if "Cannot connect to the Docker daemon" in str(e)`). Celery tasks catch broadly, publish `build_failed`, and call `_reset_graph_to_conductor` to unstick the checkpoint. `llm.py` retries Anthropic 429s with exponential backoff.

**Why that is not error management.** It is error *suppression*. The characteristic failure of this codebase: something breaks deep in a node, gets caught, gets turned into a friendly string, and the pipeline **continues in a degraded state**. Guardian "reviews source only". The verdict parser "assumes clean". `configure_run` fails and the code comments *"Continue without configuring"*. The user sees a green finish for a build that did nothing. String-matching on exception text is also locale- and version-fragile.

**Design.**

1. **A typed exception hierarchy.** `AutogenixError` → `DockerUnavailable`, `ContainerLost`, `BuildTimeout`, `RunConfigMissing`, `LLMRateLimited`, `LLMRefused`, `ToolExecutionFailed`, `SecurityGateFailed`, `DeployFailed`, `CredentialsMissing`. Raise these at the source. Catch by type, never by message substring.
2. **A classification policy per type:** `retryable | fatal | needs_human`. Wire `needs_human` into the §7.1 intervention mechanism — "Docker is not running, start it and click retry" is a far better product than a red toast.
3. **An error artifact.** `artifact_type="error"` with the type, a human explanation, the remediation, and a correlation id. Rendered as a card in chat with a retry button.
4. **Correlation ids.** One id minted per build, threaded through every log line, SSE event, and artifact. Today, correlating a browser symptom with a worker traceback means grepping timestamps.
5. **Structured logging.** Replace `print()` and bare `log.warning("...: %s", e)` with structured JSON logs carrying `project_id`, `build_id`, `node`, `tool`, `correlation_id`. Add Sentry (free tier) for the worker.
6. **Explicit budgets.** Per-build wall-clock limit, per-tool timeout, per-build LLM token/cost ceiling. `docker.exec` already has a timeout; nothing else does. A runaway ReAct loop currently burns tokens until `MAX_GRAPH_STEPS`.
7. **Fail closed on security.** §6.9.
8. **Idempotent, bounded retries.** `max_retries=1` with `countdown=30` on tasks that create Docker containers and GitHub repos, with no idempotency key, risks duplicate repos. Use `(project_id, build_number)` as the key.

**Done when:** every failure path either succeeds, asks a human, or fails loudly with a typed error and a correlation id — and none of them silently continue.

---

### 7.4 Sockets

**What exists.** One-way SSE over Redis pub/sub, and it is well built — the two hard bugs (§5.4) are already solved and documented. Two channels: workflow events and code events. Control flows the other way over plain HTTP POST.

**What is actually wrong.** Not "SSE is one-way" — that is fine for a firehose of events. Three things:

1. **Pub/sub is lossy** (§6.12). Any event published with no live subscriber is destroyed. Reconnect gaps lose build output permanently.
2. **No replay on reconnect.** `EventSource` supports `Last-Event-ID`; the server sets no event ids and could not honour one anyway, since nothing is stored.
3. **Control round-trip latency.** Cancel goes browser → HTTP POST → FastAPI → Redis publish → worker. Every hop is a place to drop the signal, and §6.6 shows it already does.

**Design — two independent changes, in this order.**

**(a) Replace pub/sub with Redis Streams.** `XADD` per event to `stream:{project_id}`, capped with `MAXLEN ~ 10000`. The SSE endpoint `XREAD`s from a cursor. Pass the client's `Last-Event-ID` as the cursor on reconnect and replay everything missed. This fixes loss and replay **without changing the transport**, and it is the higher-value half of the work. Do this first.

**(b) Add WebSockets for the control plane.** A single `/ws/projects/{id}` carrying bidirectional traffic: events down, and `cancel` / `approve_plan` / `continue` / `switch_model` / cursor position up. Benefits: one connection instead of two SSE connections plus POSTs; instant cancel; presence (is the user still watching? auto-pause if not); typing/streaming acks. Keep SSE as a fallback for restrictive networks — the event shapes are identical, only the transport differs.

FastAPI has native `WebSocket` support; no socket.io needed. Authenticate the WS handshake with the same JWE cookie — `NextAuthJWTMiddleware` is `BaseHTTPMiddleware` and **does not run for WebSocket scopes**, so verify explicitly in the endpoint. Do not skip that.

**Done when:** a page reload mid-build replays the full event history and the build continues uninterrupted; cancel takes effect in under a second.

---

### 7.5 PR analyzer

**What exists.** Nothing. Zero matches for `pull_request`, `pr_analy`, or any review flow. There is, however, a landing-page section called `code-review-section.tsx` marketing a feature that does not exist.

**What exists to build on.** The encrypted GitHub token with `repo` scope, the Docker sandbox, the ReAct loop, the Guardian security tooling, and (once §7.7 lands) code-aware RAG. A PR analyzer is mostly wiring existing parts together.

**Design.**

- **New agent: Reviewer.** `agents/reviewer.py`, another ReAct node, same shape as Guardian.
- **New tools:** `agents/tools/github_tools.py` — `list_pull_requests`, `get_pr_diff`, `get_pr_files`, `get_file_at_ref`, `post_review_comment`, `post_review_summary`, `get_pr_checks`. All via the GitHub REST API with the decrypted token.
- **Input modes:** (i) a PR URL pasted into chat; (ii) a webhook on `pull_request.opened` / `synchronize` for repos Autogenix deployed.
- **Method:** fetch the diff → for each changed hunk, retrieve surrounding context from RAG (§7.7) so the review understands the code the diff touches, not just the diff → run the Guardian security tool suite statically over changed files → produce findings, each with `{file, line, severity, category, explanation, suggested_fix}`.
- **Output:** structured findings rendered as an artifact card, and optionally posted back as inline PR comments (that is an outward-facing write — gate it behind explicit human approval per §7.1, never automatic).
- **New model:** `Review` (`project_id`, `pr_number`, `head_sha`, `findings` JSONB, `status`). Dedupe on `head_sha` so a re-push does not re-post identical comments.

**Done when:** pasting a GitHub PR URL produces a grounded review whose every finding cites a real file and line in that diff.

---

### 7.6 Working on an existing codebase

**What exists.** Nothing. The Artificer always starts from `docker.spin_up()` with an empty `/workspace`. Autogenix can only greenfield.

**Why it matters most for the demo.** "Generates an app from a prompt" is a crowded category. "Understands my existing repo and modifies it safely" is the harder and more valuable capability, and it is what makes §7.5 (PR review) and §7.7 (RAG) pay off.

**Design.**

1. **Import.** New action: connect a GitHub repo to a project. Store `repo_url` and default branch on `Project` (the `repo_url` column already exists). `git clone --depth=1` into the build container using the stored token.
2. **Comprehension pass.** A new `Surveyor` node runs once per import: walk the tree, detect language/framework/package manager/test runner/entrypoint, read the README and config files, and write a **repo profile** artifact. Index every source file into RAG (§7.7).
3. **Plan against reality.** Planner (§7.2) receives the repo profile plus retrieved context, and must plan *edits* — which existing files change and how — not a greenfield file list.
4. **Safe edits.** Today's `write_file` overwrites whole files, which is catastrophic on an existing repo. Add `edit_file(path, old_string, new_string)` with exact-match-and-unique semantics, plus `git diff` review before commit. Keep whole-file writes for new files only.
5. **Verification against the repo's own gates.** Run the project's existing test and lint commands from the repo profile, not a generic `check_syntax`. Never mark a change done on a red suite.
6. **Branch discipline.** Never commit to the default branch. Create `autogenix/<slug>`, push, and open a PR — which loops straight into §7.5.

**Done when:** Autogenix can be pointed at a real repo, asked for a small feature, and produce a PR whose tests pass.

---

### 7.7 RAG

**What exists.** A complete, unused implementation (§6.4): `ProjectRAG` with `index_file` / `retrieve` / `get_file_tree`, 50-line chunking, batched MiniLM embeddings, asyncpg + pgvector with an HNSW cosine index, and connection pooling tuned for Neon (`statement_cache_size=0` for PgBouncer — that detail is correct and non-obvious; keep it).

**Why it is needed.** Today an agent's only memory of the code it wrote is its own conversation transcript, which is truncated by the token budget. Ask for a change in iteration 18 and it has forgotten what it wrote in iteration 3. Guardian re-reads files blind. Nothing can reason about a codebase larger than a context window — which rules out §7.5 and §7.6 entirely.

**Design — wiring, not building.**

1. **Move the DDL into Alembic.** Drop `ensure_schema()`'s raw DDL. Add the `vector` extension, the `code_chunks` table, and the HNSW index as a proper migration. Make `project_id` a real `UUID` FK to `projects.id` with `ON DELETE CASCADE` — currently orphaned `TEXT` (§6.4).
2. **Index on write.** In `docker_tools.write_file`, after a successful write and the `file_created` publish, index the content. Both are side effects of the same event; keep them adjacent. Handle `delete_file` symmetrically.
3. **Retrieve in prompts.** Give every agent a `search_codebase(query)` tool, and inject a retrieved-context block into the Artificer-fix and Guardian system prompts — they always operate on code that already exists.
4. **Fix the sync/async boundary.** `ProjectRAG` is `async` (asyncpg); `docker_tools` and the ReAct loop are sync (Celery). Do not sprinkle `asyncio.run()` per call — it creates and tears down an event loop each time. Either give the worker one persistent loop, or add a sync `ChunkRepository` on psycopg. Decide once, document it.
5. **Chunk on structure, not line count.** 50-line windows split functions in half. Use tree-sitter or a language-aware splitter so a chunk is a function or class. This is the largest single quality win available.
6. **Store richer metadata** per chunk: language, symbol name, kind (function/class/config/test), last-modified build. Enables filtered retrieval ("only test files", "only this module").
7. **Decide on the embedding model deliberately.** MiniLM is local and free but weak on code. The `torch` + `transformers` + `sentence-transformers` dependency is ~2 GB and slow to cold-start in a worker. A hosted code embedding model may be the better trade. Either way, pin the dimension — the DB column is `VECTOR(384)` and a model swap is a migration.

**Done when:** an agent asked "where is the auth middleware?" answers from retrieval rather than from `list_files` plus guesswork.

---

## 8. How to run the project

`SET_UP.md` at the repo root is the short version and it is broadly correct; this is the complete version with the gaps filled in. **Five things must be running**: Docker Desktop, Redis, the Celery worker, the FastAPI server, and the Next.js dev server.

### 8.1 Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 18+ (20 LTS recommended) | |
| Python | 3.11–3.12 | Use 3.12. On 3.14, LangChain's Pydantic V1 layer warns it is unsupported |
| PostgreSQL | 14+ | Local, or Neon serverless. **pgvector extension required** once §7.7 lands |
| Redis | 7 | Via the provided `docker-compose.yml` |
| Docker Desktop | latest | **Mandatory, not optional** — every build spawns a container |
| Git | any | |

### 8.2 Environment files

`server/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@localhost:5432/autogenix
NEXTAUTH_SECRET=<same value as the client's, see §4.5>
ENCRYPTION_KEY=<Fernet key: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
REDIS_URL=redis://localhost:6379
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...          # agents currently request "gpt-4o"; required today
GROQ_API_KEY=                  # optional
DEBUG=true
```

`client/.env.local`:

```env
AUTH_SECRET=<same value as the server's NEXTAUTH_SECRET>
AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=<GitHub OAuth app client id>
GITHUB_CLIENT_SECRET=<GitHub OAuth app client secret>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

GitHub OAuth app: **Settings → Developer settings → OAuth Apps → New**. Homepage `http://localhost:3000`, callback `http://localhost:3000/api/auth/callback/github`. The `repo` scope is requested because the Deployer pushes code on the user's behalf.

> Note the secret-name mismatch in §4.5. Until it is fixed, `AUTH_SECRET` (client) and `NEXTAUTH_SECRET` (server) must hold the **same value**.

### 8.3 First-time setup

```powershell
# Redis — Docker Desktop must already be running
cd server
docker-compose up -d redis

# Python environment
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install sse-starlette              # missing from requirements.txt — see §6.5

# Database
alembic upgrade head

# Frontend
cd ../client
npm install
```

### 8.4 Every session — four terminals

| # | Directory | Command | Serves |
| --- | --- | --- | --- |
| 1 | `server/` | `docker-compose up -d redis` | Redis on 6379 (once; stays up) |
| 2 | `server/` | `.\venv\Scripts\Activate.ps1` then `.\start_celery.ps1` | The Celery worker — **without it, messages are accepted and nothing ever happens** |
| 3 | `server/` | `.\venv\Scripts\Activate.ps1` then `python -m app.main` | FastAPI on 8000 |
| 4 | `client/` | `npm run dev` | Next.js on 3000 |

Then open `http://localhost:3000`. API docs: `http://localhost:8000/docs`. Health: `http://localhost:8000/health`.

`server/start_all.ps1` attempts all of this in one shot; the four-terminal form is easier to debug because you can see which process is failing.

### 8.5 Command reference

| Task | Directory | Command |
| --- | --- | --- |
| New migration | `server/` | `alembic revision --autogenerate -m "message"` |
| Apply migrations | `server/` | `alembic upgrade head` |
| Roll back one | `server/` | `alembic downgrade -1` |
| Inspect Celery queue | `server/` | `celery -A app.tasks.build_worker:celery_app inspect active` |
| Purge the queue | `server/` | `celery -A app.tasks.build_worker:celery_app purge` |
| Redis ping | anywhere | `docker exec -it autogenix-redis redis-cli ping` |
| Clean up stray build containers | `server/` | `python cleanup_containers.py` |
| Frontend build | `client/` | `npm run build` |
| Frontend lint | `client/` | `npm run lint` |

### 8.6 When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| Message sent, nothing ever streams back | Celery worker not running | Terminal 2 |
| `Cannot connect to the Docker daemon` | Docker Desktop not started | Start it, then restart the worker |
| Every API call 401s | `AUTH_SECRET` ≠ `NEXTAUTH_SECRET` | §4.5 |
| Events all arrive at once at the end | Something replaced `EventSourceResponse` or dropped `flushSync` | §5.4 |
| `ModuleNotFoundError: sse_starlette` | Missing from requirements | §6.5 |
| "A build is running" forever | Stale LangGraph checkpoint | `resume_workflow_task` has stale-build recovery; if it persists, clear the thread's checkpoint rows |
| Builds stop after Artificer | Expected — the graph ends there | §6.1 |
| Second user's build never starts | `--pool=solo` single process blocked | §6.8 |

---

## 9. Working rules

### 9.1 Boundaries that must not be crossed

- **The browser never holds a secret.** No GitHub token, no Railway key, no LLM key, no DB URL. Only `NEXT_PUBLIC_*` values reach the client bundle. Project env var *values* are AES-GCM encrypted in the browser before they are sent; the server stores ciphertext it cannot read.
- **The API process never runs agents.** FastAPI validates, persists, and enqueues. All LLM calls, all Docker work, all tool execution happens in Celery. If you find yourself importing `workflow.py` into a route, stop.
- **The worker never serves HTTP.** It communicates outward exclusively by publishing to Redis and writing to Postgres.
- **Ownership is checked on every query.** Repository methods take `user_id`. Never fetch by primary key alone for a user-facing route.
- **Nothing writes to the user's GitHub without an explicit human decision.** Pushing code, opening PRs, and posting review comments are outward-facing and irreversible.
- **`client/types/workflow.ts` and `server/app/schemas/enums.py` change together, in the same commit.** They are one contract in two languages.

### 9.2 Before writing code

1. Read this file and the code you are about to change — not just the function, the file around it.
2. Check §6 for whether the thing you are about to fix is already a known defect with a decided approach.
3. For anything larger than a one-file change, write a short implementation note first: goal, files touched, decisions, risks, how to test it manually. Get it agreed before you build.
4. Do not fix unrelated defects in the same change. Note them, land them separately. A diff that fixes five things is a diff nobody can review.

### 9.3 After writing code

Run and report the **real** output. Never claim a check passed without running it.

| Layer | Checks |
| --- | --- |
| `client/` | `npm run lint`, `npm run build` when routes/config/server components changed |
| `server/` | Import the app (`python -c "from app.main import app"`), `alembic upgrade head` on a scratch DB if you added a migration |
| Both | A manual end-to-end run: sign in → create project → send a build message → watch the stream |

There is no test suite (§6.13h). Adding one is not optional forever — start with the pure functions that are trivially testable and already bug-prone: `_extract_run_config`, `_parse_security_verdict`, `_infer_run_config`, `_split_into_chunks`, and the `_serialise` message mapper.

### 9.4 UI work

Reuse what is in `client/components/ui/` (shadcn) and the existing Tailwind patterns before adding anything new. Where a design reference is provided, it is the source of truth — reproduce it, do not improve on it. Everything must work down to mobile width. This file deliberately says nothing about visual style.

### 9.5 Prompt engineering rules

Agent prompts are code. They live in `workflow.py` as module constants and change behaviour more than most functions do.

- Anything the pipeline depends on parsing (`<<<RUN_CONFIG>>>`, `<<<SECURITY_VERDICT>>>`) must be requested in the prompt **and** parsed defensively **and** have a defined behaviour when absent — and for security gates, that behaviour is failure, not success (§6.9).
- These are `.format()`ed strings: literal braces must be doubled (`{{`). `_ARTIFICER_SYSTEM` already does this; breaking it produces a confusing `KeyError` at runtime.
- Change a prompt, change the parser's tests in the same commit.
- Model ids are strings scattered across nodes (`"gpt-4o"`, `"claude-haiku-4-5"`). Centralise them in config before adding any more.

---

## 10. Quick orientation for new team members

Read these six files, in this order. Two hours, and you will understand the system.

1. `server/app/agents/workflow.py` — the whole pipeline; start at `create_workflow()` at the bottom and read upward.
2. `server/app/agents/react.py` — how a single agent thinks and acts.
3. `server/app/tasks/build_worker.py` — how the graph is actually driven, and where state is persisted.
4. `server/app/core/redis.py` — how anything reaches the browser.
5. `client/hooks/use-workflow.ts` — how the browser receives it.
6. `client/store/workflow-store.ts` — how 18 event types become UI state.

Then pick one item from §6.13 and fix it. It is the fastest way to get the whole loop — edit, restart worker, reload browser, watch the stream — into your hands.

---

## 11. When in doubt

Keep the change small. Preserve the process boundaries and the secret rules in §9.1. Fix the known defect rather than routing around it. Fail loudly rather than degrading silently. Write the plan before the code. Run the checks and report what actually happened.
