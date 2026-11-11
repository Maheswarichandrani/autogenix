# Pipeline feedback loops: verify, fix, retest, escalate

## Goal

Turn the pipeline from a straight line (`conductor → artificer → END`) into a graph with
checked feedback loops:

```
                 ┌───────────── chat ─────────────┐
                 ▼                                │
START → conductor ──build──► artificer ──► verify ─┤
                                ▲          │ fail (≤3)
                                └── artificer_fix ◄┘
                                           │ pass
                                           ▼
                                       guardian ──issues (≤2)──► artificer_fix ──► verify
                                           │ clean
                                           ▼
                                  deploy_gate → [human approves] → deployer → END

   any cap hit / missing verdict / broken container ──► escalate ──► conductor (park)
```

Every code change is followed by `verify`. Nothing moves forward on a failure it cannot see.
When a cap is hit the graph stops and tells the user; it never continues to deploy.

This is roadmap step 4 (re-enable the pipeline), together with the defects that block it:
Reference §6.1 (graph cut off), §6.9 (verdict fails open), §6.10 (misused iteration
constants), and the AGENTS.md §12 items "`pkill` missing" and "`exec` ignores timeout".

## Prerequisite

The Deployer security fixes are uncommitted on `feature/github-push-token`
(`deploy_context.py`, `deploy_tools.py`, etc.). Land that branch into `develop` first, then
create `feature/pipeline-loops` from `develop`. This change re-enables the Deployer edge, so
it must not land before those fixes.

## Skills read

- `langgraph-fundamentals`: conditional edges for loops, routers should only pick the next
  node, side effects belong in nodes, counters in state.
- `langgraph-human-in-the-loop`: the graph keeps `interrupt_before`; no move to `interrupt()`
  in this change (AGENTS.md §4 says a move must be proposed separately). Side effects before a
  park must be idempotent, which is why `env_var_request` moves into its own node.

## Code inspected

- `server/app/agents/workflow.py`: `GraphState`, `conductor_node`, `artificer_node`
  (spins up a container, runs ReAct, extracts/infers RunConfig, calls `start_app`, prints a
  debug "ARTIFICER STAGE COMPLETE" line), `guardian_node` (source-only fallback hardcodes
  `security_issues: []`, cap branch returns `[]`, tool failure returns `[]`),
  `_parse_security_verdict` (returns `[]` on missing/malformed verdict, findings carry no
  detail), `route_after_guardian` (publishes `env_var_request` inside the router),
  `artificer_fix_node` (calls `restart_app`), `create_workflow` (edges commented out).
- `server/app/core/docker_manager.py`: `spin_up` apt line (`git curl`, no `procps`),
  `start_app` (install → pkill → nohup start → health check, raises with logs on failure),
  `restart_app` (no health check), `exec` (accepts `timeout`, never uses it).
- `server/app/core/stacks.py`: images are `python:3.11-slim`, `node:22-slim`,
  `golang:1.24-bookworm`, `maven:3.9-eclipse-temurin-21`; all Debian/Ubuntu, so `apt-get`
  and coreutils `timeout` are available.
- `server/app/core/config.py`: `MAX_SECURITY_ITERATIONS = 5`, never read.
- `server/app/tasks/build_worker.py`: `_stream_until_interrupt_or_end` stops when
  `next` contains `conductor` or `deployer`; Build is finalised only when the graph reaches END;
  `_reset_graph_to_conductor` reset dicts list every state field.
- `server/app/schemas/enums.py` and `client/types/workflow.ts`: `WorkflowStage.ERROR` and the
  `build_failed` event already exist, so **no contract change** is needed.

## Decisions

1. **New `verify` node, plain code, no LLM.** Calls `docker.configure_run(run_config)` then
   `docker.start_app()` (install, kill old process, start, health check). Pass sets `app_url`.
   Fail stores the error plus the last 4000 chars of `app.log` in `verify_error` and
   increments `startup_attempts`. No RunConfig counts as a failure.
2. **Artificer stops starting the app.** It writes code and produces `run_config` (extracted,
   else inferred, as today). `start_app` moves to `verify`. The debug "STAGE COMPLETE" line and
   the "Guardian will review source code only" messages are removed.
3. **One fixer for both loops.** The diagram's "fail → artificer" arrow goes to
   `artificer_fix`, which reuses the same container (the full `artificer` node would start a new
   container). `artificer_fix` takes `fix_reason`: `"startup"` gets the verify error and logs;
   `"security"` gets Guardian's findings. It no longer restarts the app; `verify` does. The
   `pkill` line in its prompt is removed.
4. **Fail-closed Guardian.** The verdict becomes
   `{"status": "clean"|"issues", "findings": [{"severity", "title", "file", "evidence", "fix_hint"}]}`.
   The parser returns `("clean", [])`, `("issues", findings)` or `("invalid", [])`. Missing,
   malformed, or `"issues"` with no CRITICAL/HIGH finding all count as `"invalid"`. The
   source-only fallback, the "max iterations reached → []" branch and the
   "tools unavailable → []" branch are removed; each of those cases goes to `escalate`.
   Guardian only runs after `verify` passed, so the app is always running.
5. **Caps in config.** `MAX_STARTUP_FIX_ATTEMPTS = 3` and `MAX_SECURITY_ITERATIONS = 2` live in
   `config.py` (the existing unused `5` becomes `2`); `workflow.py` reads them from settings.
   The ReAct `max_iter` values stay as literals and are not tied to these caps.
6. **`escalate` node routes to `conductor`, not END.** It publishes a clear message (what
   failed, after how many attempts, the last error summary), `stage_change: error` and
   `build_failed`, spins the container down, and sets `escalation_reason` and `error`. Routing to
   `conductor` parks the graph at the existing `interrupt_before`, so the user's next chat
   message works normally ("try again" starts a fresh build). No new UI, no `interrupt()`.
7. **`deploy_gate` node.** Publishes `env_var_request` (moved out of `route_after_guardian`)
   and returns. `interrupt_before=["deployer"]` then parks as it does today. Routers become pure.
8. **Counters reset per build.** `conductor_node`'s `start_build` branch returns
   `build_id: None`, `startup_attempts: 0`, `security_iteration: 0`, `security_issues: []`,
   `verify_error: None`, `escalation_reason: None`, `error: None`, so a second build in the same
   project does not inherit the first build's counters or Build row.
9. **Worker finalises escalated builds.** After `_stream_until_interrupt_or_end`, if
   `state.escalation_reason` is set and there is a `build_id`, call `_finalise_build` (marks it
   `failed` because `error` is set), then `wf.update_state(config, {"build_id": None,
   "escalation_reason": None})`. Applied in `start_workflow_task`, `resume_workflow_task` (both
   paths) and `railway_connect_task`.
10. **Sandbox prerequisites.**
    - `spin_up` installs `git curl procps`, so `pkill` exists and a restart really replaces
      the old process.
    - `exec` honours `timeout` by running `timeout -k 5 <n> /bin/sh -c <shlex-quoted cmd>`.
      Exit 124/137 returns `(124, output + "\n[timed out after <n>s]")`. Background starts
      (`nohup … &`) return immediately and are not affected.

## Assumptions

- `start_app` raising `RuntimeError` with logs is a good enough failure signal for `verify`.
- `MAX_GRAPH_STEPS = 20` in `build_worker.py` stays large enough: the worst path is
  3 startup fixes + 2 security rounds, about 15 node steps.
- After this change the worker still runs `--pool=solo`, so one build blocks others (§6.8).
  Out of scope.

## Files to touch

- `server/app/core/docker_manager.py`: `procps`, real `exec` timeout.
- `server/app/core/config.py`: `MAX_STARTUP_FIX_ATTEMPTS`, `MAX_SECURITY_ITERATIONS = 2`.
- `server/app/agents/workflow.py`: state fields, `verify_node`, `escalate_node`,
  `deploy_gate_node`, artificer/guardian/fix changes, Guardian prompt + parser, pure routers,
  wiring.
- `server/app/tasks/build_worker.py`: finalise escalated builds; add the new state fields to
  both reset dicts.

No client changes. No migration.

## Requirements

**New `GraphState` fields:** `startup_attempts: int`, `verify_error: Optional[str]`,
`fix_reason: Optional[str]`, `security_status: Optional[str]`,
`escalation_reason: Optional[str]`.

**Routers (pure, no publish):**

- `route_after_artificer`: `error` set → `escalate`; else → `verify`.
- `route_after_verify`: `app_url` set and no `verify_error` → `guardian`;
  `startup_attempts < MAX_STARTUP_FIX_ATTEMPTS` → `artificer_fix`; else → `escalate`.
- `route_after_guardian`: `security_status == "clean"` → `deploy_gate`;
  `"issues"` and `security_iteration < MAX_SECURITY_ITERATIONS` → `artificer_fix`;
  otherwise (`"invalid"`, cap reached, or anything unexpected) → `escalate`.

**Node returns:**

- `verify` sets `fix_reason = "startup"` on failure and clears `verify_error` on pass.
- `guardian` sets `security_status`, `security_issues`, increments `security_iteration`, and on
  `"issues"` sets `fix_reason = "security"`.
- `artificer_fix` keeps `fix_reason` and the matching details in its system prompt. The prompt
  uses `.format()`, so any literal braces must be doubled.

**Wiring:**

```
START → conductor
conductor     → {artificer, conductor}
artificer     → {verify, escalate}
verify        → {guardian, artificer_fix, escalate}
artificer_fix → verify
guardian      → {deploy_gate, artificer_fix, escalate}
deploy_gate   → deployer
deployer      → END
escalate      → conductor
interrupt_before = ["conductor", "deployer"]   (unchanged)
```

**Guardian prompt:** ask for the new verdict block with findings, show one example, and say
that a missing block is treated as a failed scan. Keep `<<<SECURITY_VERDICT>>>` /
`<<<END_VERDICT>>>` markers. Escape the JSON braces (`{{ }}`).

## Security considerations

- Fail closed: no path sends a build to `deploy_gate` without `security_status == "clean"`
  from a parsed verdict.
- `app.log` and Guardian findings come from AI-written code and are untrusted. They are
  truncated (4000 chars) and only ever passed as data in the fixer's prompt. No secrets live in
  the container, so logs cannot leak them.
- Deploy stays behind the human gate (`interrupt_before=["deployer"]`); deploy secrets still
  never enter state.
- `exec` timeouts stop a hanging command from holding the worker forever.

## Acceptance criteria

1. A normal build goes `artificer → verify → guardian → deploy_gate` and the env-var card
   appears, with the graph parked before `deployer`.
2. A build whose app fails its health check is sent back to `artificer_fix` with the log, up to
   3 times, then escalates with a clear message; the Build row is `failed`.
3. Guardian output without a verdict block escalates; it never reaches `deploy_gate`.
4. Guardian findings reach `artificer_fix` with file, title and evidence; the fixed app is
   re-verified before Guardian retests; after 2 rounds with issues it escalates.
5. After an escalation the user can type a new message and chat or start a fresh build;
   counters start from 0 and a new Build row is created.
6. A command that hangs inside the container returns after its timeout with exit code 124.
7. The "ARTIFICER STAGE COMPLETE" debug line is gone.

## Checks to run

- `cd server; python -c "from app.main import app"`
- `cd server; python -c "from app.agents.workflow import create_workflow; create_workflow()"`
  (compiles the graph with `MemorySaver`).
- Parser and router spot-checks in one `python -c` script: clean verdict, issues verdict,
  missing block, malformed JSON, `"issues"` with only LOW findings, each router at and past its
  cap.
- `cd client; npm run lint` is not needed (no client change).

## Manual test steps

1. Start Docker Desktop, Redis, Celery worker, FastAPI and Next.js (AGENTS.md §13). Purge the
   Celery queue first.
2. Sign in, create a project, send: "build me a FastAPI todo API with a /health endpoint".
   Watch the stream: Artificer → verify (app healthy) → Guardian → env-var card. Check the
   worker log shows the graph parked before `deployer`.
3. Health-check failure: send "build a Flask app with no /health route, and start it on port
   5000". Expect up to 3 "fixing startup" passes, then either a pass or an escalation message
   and stage `error`. Confirm in Postgres that the Build row is `failed` if it escalated.
4. Chat after escalation: send "hi". Conductor replies normally. Send a new build request; a
   new Build row is created.
5. Verdict missing: temporarily change the Guardian prompt line that requests the verdict
   (local only, do not commit), run a build, and confirm it escalates with "security scan did
   not return a verdict". Revert.
6. Timeout: in a Python shell, `DockerManager.reattach(...)` on a running build and call
   `exec("sleep 30", timeout=3)`. Expect `(124, "...timed out after 3s")` in about 3 seconds.

## Implementation notes (added after building)

- **Cap meaning.** Each cap is the number of *fix rounds*: up to 3 startup fixes (4 verify
  runs) and up to 2 security fixes (3 Guardian scans). The routers use `<=` for this; a graph
  simulation caught the first version allowing one round fewer.
- **Found while building:** the old `_GUARDIAN_SYSTEM` had single `{ }` braces in its verdict
  line and is passed through `.format()`, so Guardian would have raised `KeyError` the first
  time it ran. The new prompt doubles them, and a spot check formats it.
- **Pre-existing, not fixed here:** `_stream_until_interrupt_or_end` only creates the Build row
  when `build_id` is empty *after* the stream, but Artificer sets its own uuid during that same
  stream, so no Build row is ever created. `_finalise_build` (and the escalation path) then
  finds no row and does nothing. Acceptance criterion 2's "Build row is failed" depends on this
  being fixed in a separate change.
- **Verified with:** app import, worker import, graph compile, parser/router spot checks, and a
  simulated run of the compiled graph (fake Docker/LLM) over six paths: happy path, startup
  fixed on the 4th try, startup never fixed, missing verdict, issue fixed on retest, issues
  persisting. None of the failure paths emitted the env-var card; all parked at `conductor`.
