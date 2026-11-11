# Autogenix — Issues Spec

Every known problem, checked against the code on 2026-11-07, in the order to fix them. Each item still gets its own implementation prompt in `prompts/` before any code changes (AGENTS.md section 2).

Legend:
- Size: **S** under an hour, **M** a few hours, **L** a day or more.
- `Ref §x` means `docs/PROJECT_REFERENCE.md` section x.

---

## Part A — Blockers: the demo cannot run until these are fixed

### A1. Agents run on a dead OpenAI key — **S** (decision) + **M** (code)
- **Problem:** OpenAI rejects the `OPENAI_API_KEY` in `server/.env` with a 401, tested directly. The Artificer, Guardian, fix pass, and Deployer all use `gpt-4o`, so no build can produce code.
- **Where:** `server/app/agents/workflow.py:493, 508, 987, 1038, 1194, 1284`.
- **Fix:** pick one provider.
  - **(a) Claude:** the working Anthropic key is already in `.env`.
  - **(b) OpenAI:** a new key plus credit.

  For (a), switch those six calls to a Claude model. Either way, check the account's billing balance.
- **Note:** a Claude.ai or Claude Code subscription cannot be used here. Only API credit works.

### A2. Model ids are scattered, and two are retired — **M**
- **Problem:** model names are hard-coded in many files, which AGENTS.md section 10 says to centralise. `server/app/core/llm.py` still lists **Claude 3.5 Sonnet** (retired 28 Oct 2025) and **Claude 3 Opus** (retired 5 Jan 2026). `get_llm()`, `chat()`, and `chat_stream()` default to `claude-3-5-sonnet` (`llm.py:528, 658, 663, 670`), so any call without an explicit model fails.
- **Also check:** the Groq ids `llama-3.1-70b-versatile` and `mixtral-8x7b-32768` look retired on Groq. Verify before use. `project_repo.py:33` names projects with `llama-3.1-8b`.
- **Fix:**
  1. Move model choices to settings, with one constant per agent role.
  2. Replace the retired ids (`claude-sonnet-5-5` / `claude-opus-5-5`), or `/claude-api migrate`.
  3. Change the defaults to current models.

### A3. `Build.metadata_` does not exist — **S**
- **Problem:** `server/app/tasks/build_worker.py:227-229` reads `build.metadata_`, but `server/app/models/build.py` has no such column. The first build that returns a run config raises `AttributeError`, which turns into `build_failed`. Ref §6.2.
- **Twist:** the Neon database already has a `metadata` column on `builds`, added by the unknown migration in A4.
- **Fix:** add `metadata_ = mapped_column("metadata", JSONB)` to the model, matching `Message.metadata_`. Then fix the `docker_manager.py` docstring.

### A4. Database and migrations out of sync — **M**
- **Problem:** Neon is stamped with Alembic revision `181838669d0d`, which is not in this repo or its git history, so `alembic upgrade head` fails. The DB has columns the models do not define:
  - `users`: `display_name`, `kdf_salt`, `privacy_*` (4), `work_function`
  - `builds`: `metadata`, `raw_plan`, `security_issues_found`, `security_iteration`
- **Also:** `server/app/core/database.py:46-48` runs `Base.metadata.create_all` on every API start, which silently creates tables outside Alembic.
- **Fix:**
  1. Ask the team who created `181838669d0d`, and recover that migration file.
  2. If it cannot be recovered, write a matching migration and `alembic stamp` it.
  3. Remove `create_all` from startup.

  Do not run new migrations until this is resolved.

### A5. Finished fixes not merged — **S**
- **`feature/exec-timeout`:** commit `2cfd1f0`, pushed but not merged. The worker can hang forever on a stuck command without it.
- **`feature/theme-hydration-fix`:** the `suppressHydrationWarning` change in `client/app/layout.tsx` and this spec, pushed but not merged.
- **Fix:** open a PR for each and merge both into `develop`. Exec-timeout first.

---

## Part B — Phase 0 cleanup (roadmap step 1, still open)

### B1. `requirements.txt` still polluted — **S**
- **Problem:** 74 Zope/Grok/ZODB lines remain. `torch`, `transformers`, and `sentence-transformers` (about 2 GB) are only for the unused RAG code (Ref §6.4).
- **Correction to AGENTS.md:** `langchain-openai` is **not** imported anywhere, so it is not missing.
- **Fix:** hand-write direct dependencies only, then test a fresh `pip install` in a new venv.

### B2. No `.env.example`, and the README uses wrong env names — **S**
- **Problem:** neither `server/.env.example` nor `client/.env.example` exists. `README.md:116-121` says `NEXTAUTH_SECRET` and `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` for the client. The code reads `AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`. Ref §4.5.
- **Fix:** add both example files with every key and no values, and correct the README.
- **Also document:**
  - Environment variables override `.env`. A Windows user variable `ANTHROPIC_API_KEY` caused a 401 this week.
  - The OAuth callback URL.

### B3. Env-vars router never registered — **S**
- **Problem:** `server/app/api/routes/v1/env_vars.py` (the encrypted env store) is not in `server/app/main.py:39-43`. Ref §6.3.
- **Fix:** register it, then test one round trip.

### B4. Junk and dead files — **S**
- **Server:**
  - `server/app/agents/react.py.bak` and `workflow.py.bak` (tracked)
  - `server/venvcls/`
  - `server/_check_builds.py`
- **Markdown notes:**
  - `FIXES_SUMMARY.md` and `SSE_STREAMING_FIX_SUMMARY.md` (root)
  - `server/ISSUE_CELERY_WORKER.md` and `server/STARTUP_GUIDE.md`
  - `client/components/workspace/CHAT_COMPONENTS.md` and `VISUAL_GUIDE.md`
- **Empty files (0 bytes):** `client/store/artifact-store.ts` and `client/components/workspace/artifact-sidebar.tsx`.
- **Shipped debug pages:** `client/app/workspace-test/` and `client/app/workspace/`. The second has mock messages and is not linked anywhere.
- **Fix:** delete them, or move anything still useful into `docs/`.

### B5. Docker compose files — **S**
- **Problem:** both files have an obsolete `version: '3.8'`, which warns on every run. `docker-compose.dev.yml` sets a Redis password that the default `REDIS_URL` lacks, and AGENTS.md section 12 already warns about it.
- **Fix:** remove `version`. Then delete `docker-compose.dev.yml`, or align its password with the env example.

### B6. Server prints that crash or leak — **S**
- **Problem:** `database.py:50` prints an emoji. It crashes startup when output is redirected on Windows (cp1252). `api/middleware/auth.py:35` prints every user's id and email, which is a privacy leak in logs.
- **Fix:** switch both to `log.info` and leave out the email.

### B7. CORS hard-coded — **S**
- **Problem:** `server/app/main.py:26` allows only `http://localhost:3000`, which breaks any deploy.
- **Fix:** read the allowed origins from settings.

---

## Part C — Frontend: settings and polish

### C1. All four settings pages are static mock-ups — **M** (each **S–M**)
None of them calls the API (checked by grepping each page).

| Page | What is fake |
| --- | --- |
| `client/app/home/settings/general/page.tsx` | Name hard-coded as `"Srikar"` (lines 34, 45). Role select does not save. |
| `client/app/home/settings/integrations/page.tsx` | Lists Google, Notion, and Mail, which Autogenix does not use. "Connected" flags are hard-coded. Railway, which the project does use, is missing. |
| `client/app/home/settings/billing/page.tsx` | "Free Plan" and "Upgrade to Pro" are hard-coded. Real limits live in `User.monthly_builds_used` / `monthly_builds_limit`. |
| `client/app/home/settings/privacy/page.tsx` | Switches do not save. The DB has `privacy_*` columns (A4) but the model does not. |

- **Fix order:**
  1. General: show the real GitHub name, email, stack, and level, and allow editing stack and level.
  2. Integrations: show real GitHub and Railway status only.
  3. Billing: show real usage. Roadmap item 13 says this is low priority.
  4. Privacy: only after A4.

### C2. Debug text shown to users — **S**
- **Problem:** `server/app/agents/workflow.py:614` streams "🔧 ARTIFICER STAGE COMPLETE - Workflow ended for debugging" to the chat.
- **Fix:** remove it with the pipeline work in E1, or replace it with a real completion message now.

### C3. `/home/projects` logs a build error — **S**
- **Problem:** `npm run build` prints "Error fetching projects … Dynamic server usage … used `headers`". The page tries static rendering, then fails and logs it as an error.
- **Fix:** mark the page dynamic, or stop catching and logging that Next.js signal.

### C4. 42 ESLint warnings — **S**
- **Problem:** errors are now 0, and 42 warnings remain (unused imports and variables, hook dependencies).
- **Fix:** one cleanup pass.

### C5. Generated-app stack check — **S**
- **Problem:** six stacks are offered, but AGENTS.md section 7 says not to offer a stack until it passes a real test build.
- **Fix:** after A1, run one build per stack and remove any that fail.

---

## Part D — Secure Deployer (roadmap step 3)

These must be fixed **before** re-enabling the pipeline (AGENTS.md section 12).

| # | Problem | Where | Fix | Size |
| --- | --- | --- | --- | --- |
| D1 | GitHub token written into the git remote URL, left in `.git/config` inside the container. The comment claiming otherwise is wrong | `agents/tools/deploy_tools.py:123, 130` | Use a credential helper or `http.extraHeader` for one command only, then unset it | M |
| D2 | An existing repo with the same name is reused, then **force-pushed**, which can overwrite a user's repo | `deploy_tools.py:94-105, 134` | Fail on a name clash, or create a unique name. Never force-push | S |
| D3 | Decrypted GitHub and Railway tokens put into LangGraph state, so they are saved in Postgres checkpoints | `tasks/build_worker.py` `deploy_confirm_task` (Ref §6.7) | Load and decrypt inside `deployer_node`. Never put tokens in state | M |
| D4 | Security verdict **fails open**: a missing or garbled verdict returns `[]`, meaning "no issues" | `agents/workflow.py:1061` (Ref §6.9) | Return a failure, and treat a missing verdict as failed | S |
| D5 | `pkill` is missing from the images, so `restart_app` leaves the old app running after a fix | `core/docker_manager.py` bootstrap | Add `procps` to the `apt-get` line | S |
| D6 | `create_github_repo` default visibility | `deploy_tools.py` | Confirm private by default (AGENTS.md section 7) | S |

---

## Part E — Re-enable the pipeline (roadmap step 4)

### E1. Graph ends after Artificer — **M**
- **Problem:** `server/app/agents/workflow.py:1385` has `graph.add_edge("artificer", END)`, and the Guardian, fix-loop, and deployer edges are commented out (line 1388 on). Ref §6.1.
- **Fix:** restore the edges after Part D. Then test one full run through to deploy confirmation.

### E2. Iteration constants misused — **S**
- **Problem:** `config.py:35` declares `MAX_SECURITY_ITERATIONS = 5`, which is never read. `workflow.py:924` hard-codes `2`, and line 986 reuses it as Guardian's ReAct budget, which caps source review at 2 steps. Ref §6.10.
- **Fix:** read the loop count from settings, and give Guardian's step budget its own constant.

---

## Part F — Later roadmap (after the demo works)

| # | Problem | Where | Roadmap | Size |
| --- | --- | --- | --- | --- |
| F1 | No build limits enforced, despite the `monthly_builds_*` columns | `models/user.py`, message route | Step 5 | M |
| F2 | Cancel does not stop a running agent: `mark_cancelled()` has 0 callers, and the registry is per process | `agents/execution_registry.py` (Ref §6.6) | Step 6 | L |
| F3 | `--pool=solo` runs one build at a time, and a paused agent blocks everyone | `start_celery.ps1` (Ref §6.8) | Step 6 | L |
| F4 | Fake typewriter `time.sleep(0.015)` per word blocks the worker | `react.py:142`, `workflow.py:152` (Ref §6.11) | Any time | S |
| F5 | Redis pub/sub loses events on page reload, with no replay | `core/redis.py` (Ref §6.12) | Step 9 | L |
| F6 | `apt-get install git curl` runs on every build. Pre-build six small "base + tools" images once (this also fixes D5) | `docker_manager.py:261` | With D5 | M |
| F7 | No rate limiting or request size limits | `main.py` | Before going public | M |
| F8 | Free-text status and role columns with no DB enums | `models/` (Ref §6.13e) | Step 8 | M |
| F9 | Dead line `db.get(Project if build_id else None.__class__, ...)` | `build_worker.py:256` | Any time | S |
| F10 | `workflow.py` (1403 lines) and `build_worker.py` (813 lines) too large | `server/app/` | Any time | L |
| F11 | RAG fully built, never called. Its table is created by raw DDL | `agents/rag.py`, `repositories/rag_repository.py` (Ref §6.4) | Step 10 | L |
| F12 | Zero tests. Start with the pure parsers listed in AGENTS.md section 13 | repo-wide | With D4 | M |

---

## Suggested order for tomorrow

1. **A5:** push and merge `feature/exec-timeout`, then commit the theme fix.
2. **A1 + A2:** choose the AI provider, centralise model ids, and replace retired models.
3. **A3:** add the `Build.metadata_` mapping, then run the to-do test build end to end.
4. **A4:** sort out the missing migration before any schema change.
5. Part B, the quick wins, then Part C1 General, then Part D, then Part E.

## Already fixed this week (for reference)

- GitHub sign-in `issuer` error.
- Client ESLint errors (33 down to 0).
- Welcome screen after login.
- Exec timeout (on a branch, see A5).
- The 401 from a stray Windows `ANTHROPIC_API_KEY` variable.
- Docker data moved to F:.
