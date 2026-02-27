"""
tasks/build_worker.py

Celery tasks that drive the LangGraph workflow.

KEY FIXES vs original:
  1. start_workflow_task — fixed double-stream.
     interrupt_before=["conductor"] means wf.stream(initial_state) seeds
     state and parks before conductor. wf.stream(None) then runs conductor
     once. That's it — no "while snap.next" loop needed for the first call
     because conductor either: (a) chats and returns to interrupt, or
     (b) sets build_requested=True and the graph auto-continues through
     artificer → guardian → deployer until it hits the deployer interrupt.
     The while loop IS needed but now has a hard cap of MAX_GRAPH_STEPS.

  2. resume_workflow_task — same loop cap applied.

  3. deploy_confirm_task — fixed interrupt strategy.
     We now use interrupt_before=["deployer"] (set in workflow.py).
     This means the deployer node hasn't run yet when we get here.
     So we: update_state({"deploy_payload": payload}) then stream(None).
     The deployer runs ONCE with full credentials. No re-entry bug.

  4. Module-level DB engine — one connection pool shared across all tasks
     in this worker process, not a new engine per task invocation.

  5. _save_state_to_db called once after the loop, not inside it.
     Already correct in original but made explicit with a comment.

  6. run_config persisted to Build.metadata so Guardian/Deployer can
     reattach with a working RunConfig without re-parsing tool logs.

  7. deploy_confirm_task checks for active build BEFORE fetching creds,
     and bails cleanly if there's nothing to deploy.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from celery import Celery
from langgraph.types import Command
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

log = logging.getLogger(__name__)

# ── Celery app ────────────────────────────────────────────────────

celery_app = Celery("aibuild", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.update(
    task_serializer            = "json",
    result_serializer          = "json",
    accept_content             = ["json"],
    timezone                   = "UTC",
    task_track_started         = True,
    task_acks_late             = True,
    task_reject_on_worker_lost = True,
    worker_prefetch_multiplier = 1,
    result_expires             = 60,          # don't pile up task results in Redis
)

# ── Module-level DB pool ──────────────────────────────────────────
# Created once per worker process, reused across all tasks.
# Avoids creating a new engine (= new pool) on every task invocation.

def _fix_ssl(url: str) -> str:
    """Neon/Supabase use ?ssl=require; psycopg2 needs ?sslmode=require."""
    return (
        url
        .replace("?ssl=require",  "?sslmode=require")
        .replace("&ssl=require",  "&sslmode=require")
    )


_engine: object | None = None
_SessionFactory: sessionmaker | None = None


def _get_session() -> Session:
    global _engine, _SessionFactory
    if _SessionFactory is None:
        _engine = create_engine(
            _fix_ssl(settings.DATABASE_URL),
            pool_size    = 5,
            max_overflow = 10,
            pool_pre_ping = True,   # detect stale connections
        )
        _SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _SessionFactory()


# ── LangGraph workflow factory ────────────────────────────────────
# Cached at module level to reuse the same PostgresSaver connection pool
# across all task invocations in this worker process.

_workflow_graph = None


def _workflow():
    global _workflow_graph
    if _workflow_graph is None:
        from app.agents.workflow import create_workflow
        _workflow_graph = create_workflow(_fix_ssl(settings.DATABASE_URL))
        log.info("LangGraph workflow created and cached for worker process")
    return _workflow_graph


# ── Constants ─────────────────────────────────────────────────────

MAX_GRAPH_STEPS = 20   # hard cap on while-loop iterations per task


# ═══════════════════════════════════════════════════════════════════
# DB HELPERS
# ═══════════════════════════════════════════════════════════════════

def _get_user(db: Session, user_id: str):
    from app.models import User
    return db.get(User, user_id)


def _create_build(db: Session, project_id: str, description: str = "") -> str:
    """Create a Build row and return its string ID."""
    from app.models import Build

    # Use SELECT FOR UPDATE to prevent duplicate build_numbers under concurrency
    result  = db.execute(
        select(func.coalesce(func.max(Build.build_number), 0))
        .where(Build.project_id == project_id)
        .with_for_update()
    )
    next_num = result.scalar_one() + 1

    build = Build(
        project_id    = project_id,
        build_number  = next_num,
        status        = "building",
        approved_plan = {"description": description},
        started_at    = datetime.now(timezone.utc),
    )
    db.add(build)
    db.flush()   # get build.id before commit
    db.commit()
    return str(build.id)


def _save_state_to_db(db: Session, state: dict, project_id: str, build_id: str | None) -> dict:
    """
    Persist messages + artifacts accumulated during one graph run.

    - Replaces temp artifact IDs with real DB UUIDs inside message blocks.
    - Persists run_config to Build.metadata for cross-node reattach.
    - NEVER persists deploy_payload (contains plaintext credentials).
    - After commit the caller MUST call wf.update_state(config, {"messages_to_save": None})
      to reset the reducer in the LangGraph checkpoint so messages aren't re-saved
      on the next invocation.
    """
    from app.models import Message, Artifact, Build

    temp_to_real: dict[str, str] = {}

    # ── Persist artifacts ─────────────────────────────────────────
    for art in state.get("artifacts", []):
        temp_id = art.get("temp_id")
        if not temp_id:
            continue
        row = Artifact(
            project_id    = project_id,
            build_id      = build_id,
            artifact_type = art.get("artifact_type", "unknown"),
            title         = art.get("title", "Artifact"),
            content       = art.get("content", {}),
        )
        db.add(row)
        db.flush()
        temp_to_real[temp_id] = str(row.id)

    # ── Persist messages ──────────────────────────────────────────
    for msg in state.get("messages_to_save", []):
        real_blocks = []
        for block in msg.get("content", []):
            if block.get("type") == "artifact" and block.get("artifact_id") in temp_to_real:
                real_blocks.append({
                    "type":        "artifact",
                    "artifact_id": temp_to_real[block["artifact_id"]],
                })
            else:
                real_blocks.append(block)
        db.add(Message(
            project_id   = project_id,
            role         = msg["role"],
            message_type = msg["message_type"],
            content      = real_blocks,
            metadata_    = msg.get("metadata"),
        ))

    # ── Persist run_config to Build for cross-node reattach ───────
    run_config = state.get("run_config")
    if run_config and build_id:
        build = db.get(Build, build_id)
        if build:
            meta = build.metadata_ or {}
            meta["run_config"] = run_config if isinstance(run_config, dict) else run_config.to_dict()
            build.metadata_    = meta

    db.commit()

    # Clear local dict copies — the actual checkpoint reset happens
    # via wf.update_state(config, {"messages_to_save": None}) in the caller.
    state["artifacts"]        = []
    state["messages_to_save"] = []
    return state


def _finalise_build(db: Session, state: dict) -> None:
    """Mark Build completed/failed and update Project with deploy/repo URLs."""
    from app.models import Project, Build

    build_id   = state.get("build_id")
    deploy_url = state.get("deploy_url")
    repo_url   = state.get("repo_url")

    if build_id:
        build = db.get(Build, build_id)
        if build:
            build.status                = "failed" if state.get("error") else "completed"
            build.deploy_url            = deploy_url
            build.repo_url              = repo_url
            build.security_iteration    = state.get("security_iteration", 0)
            build.security_issues_found = state.get("all_security_issues", [])
            build.completed_at          = datetime.now(timezone.utc)

    project = db.get(Project if build_id else None.__class__, state.get("project_id"))
    # Reload project properly
    from app.models import Project as ProjectModel
    project = db.get(ProjectModel, state.get("project_id"))
    if project:
        if deploy_url:
            project.latest_deploy_url = deploy_url
        if repo_url:
            project.repo_url = repo_url

    db.commit()


def _stream_until_interrupt_or_end(wf, config: dict, db: Session, project_id: str) -> dict:
    """
    Drive the graph forward until it either:
      - Reaches END (snap.next is empty)
      - Hits an interrupt (snap.next contains "conductor" or "deployer")

    Returns the final state dict.
    Raises RuntimeError if MAX_GRAPH_STEPS exceeded (runaway loop guard).
    """
    for step in range(MAX_GRAPH_STEPS):
        for _ in wf.stream(None, config=config):
            pass

        snap  = wf.get_state(config)
        state = dict(snap.values)

        # Create Build row as soon as conductor requests it
        if state.get("build_requested") and not state.get("build_id"):
            build_id = _create_build(db, project_id, state.get("build_description", ""))
            wf.update_state(config, {"build_id": build_id})
            state["build_id"] = build_id
            log.info("Build created project=%s build=%s", project_id, build_id)

        next_nodes = list(snap.next or [])

        # Stopped at interrupt or reached END
        if not next_nodes or "conductor" in next_nodes or "deployer" in next_nodes:
            return state

    raise RuntimeError(
        f"Graph exceeded MAX_GRAPH_STEPS ({MAX_GRAPH_STEPS}). "
        "Possible infinite loop — aborting."
    )


def _reset_graph_to_conductor(wf, config: dict, fresh_state: dict) -> None:
    """
    Reset the LangGraph state for this thread back to the conductor interrupt.

    This is used after a build failure or worker crash to "unstick" the graph.
    Without this, the checkpoint remembers snap.next = "artificer" (or wherever
    it crashed) and the user can never send a new message — resume_workflow
    would always say "A build is running".

    How it works:
      1. Re-seed the graph with a fresh initial state (like start_workflow does).
      2. The graph streams once and parks at interrupt_before=["conductor"].
      3. Next resume_workflow call sees snap.next = ["conductor"] and proceeds.
    """
    log.info("Resetting graph to conductor for thread=%s", config["configurable"]["thread_id"])

    # Re-seed — this overwrites the stale checkpoint with a fresh one
    for _ in wf.stream(fresh_state, config=config):
        pass

    snap = wf.get_state(config)
    log.info(
        "Graph reset complete — next=%s for thread=%s",
        list(snap.next or []),
        config["configurable"]["thread_id"],
    )


# ═══════════════════════════════════════════════════════════════════
# TASK 1 — START WORKFLOW
# First user message. Seeds state, runs conductor once, then continues
# through build pipeline if a build was requested.
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="workers.start_workflow", max_retries=1)
def start_workflow_task(
    self,
    project_id:          str,
    thread_id:           str,
    user_message:        str,
    message_type:        str,
    project_name:        str,
    project_description: str,
) -> None:
    from app.core.redis import publish

    db = _get_session()
    try:
        wf     = _workflow()
        config = {"configurable": {"thread_id": thread_id}}

        initial_state = {
            "project_id":           project_id,
            "build_id":             None,
            "project_name":         project_name,
            "project_description":  project_description,
            "chat_history":         [],
            "current_user_input":   {"message": user_message, "message_type": message_type},
            "build_requested":      False,
            "build_description":    "",
            "tech_stack_hint":      None,
            "run_config":           None,
            "app_url":              None,
            "security_iteration":   0,
            "security_issues":      [],
            "all_security_issues":  [],
            "deploy_payload":       None,
            "artifacts":            [],
            "messages_to_save":     [],
            "_saved_msg_count":     0,
            "repo_url":             None,
            "deploy_url":           None,
            "error":                None,
        }

        # Seed state — graph parks at interrupt_before=["conductor"]
        for _ in wf.stream(initial_state, config=config):
            pass

        # Run conductor (processes the first user message)
        state = _stream_until_interrupt_or_end(wf, config, db, project_id)

        _save_state_to_db(db, state, project_id, state.get("build_id"))
        wf.update_state(config, {"_saved_msg_count": state.get("_saved_msg_count", 0)})

        snap = wf.get_state(config)
        if not snap.next:
            _finalise_build(db, state)
            # Workflow completed - close SSE stream
            publish(project_id, {"type": "close_stream"})

    except Exception as e:
        log.exception("start_workflow_task failed project=%s", project_id)
        publish(project_id, {"type": "build_failed", "reason": str(e)})
        publish(project_id, {"type": "close_stream"})

        # ── Reset graph state to conductor so user isn't stuck ────
        # When a build fails mid-pipeline (e.g., at artificer or guardian),
        # the LangGraph checkpoint remembers snap.next = "artificer" etc.
        # Without this reset, resume_workflow_task blocks with
        # "A build is running" forever.
        try:
            _reset_graph_to_conductor(wf, config, {
                "project_id":           project_id,
                "build_id":             None,
                "project_name":         project_name,
                "project_description":  project_description,
                "chat_history":         [],
                "current_user_input":   None,
                "build_requested":      False,
                "build_description":    "",
                "tech_stack_hint":      None,
                "run_config":           None,
                "app_url":              None,
                "security_iteration":   0,
                "security_issues":      [],
                "all_security_issues":  [],
                "deploy_payload":       None,
                "artifacts":            [],
                "messages_to_save":     [],
                "_saved_msg_count":     0,
                "repo_url":             None,
                "deploy_url":           None,
                "error":                str(e),
            })
        except Exception:
            log.exception("Failed to reset graph state after error project=%s", project_id)

        # Don't retry — the graph is reset, user can send a fresh message
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TASK 2 — RESUME WORKFLOW
# Every user message after the first.
# Feeds the message to conductor and drives the graph forward.
#
# STALE BUILD RECOVERY:
#   If a previous build failed mid-pipeline (at artificer, guardian, etc.),
#   the LangGraph checkpoint still has snap.next pointing at that node.
#   Without recovery, the user would be permanently stuck with
#   "A build is running — please wait".
#
#   The fix: when snap.next is NOT conductor and the state has error set
#   (or the previous build's status is "failed"), we reset the graph back
#   to the conductor interrupt so the user can chat normally again.
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="workers.resume_workflow", max_retries=1)
def resume_workflow_task(
    self,
    project_id:   str,
    thread_id:    str,
    user_message: str,
    message_type: str,
) -> None:
    from app.core.redis import publish

    db = _get_session()
    try:
        wf     = _workflow()
        config = {"configurable": {"thread_id": thread_id}}

        snap = wf.get_state(config)
        if not snap or not snap.values:
            raise ValueError(f"No LangGraph state for thread {thread_id}")

        next_nodes = list(snap.next or [])
        state      = dict(snap.values)

        # ── Stale build recovery ──────────────────────────────────
        # If the graph is stuck at a non-conductor node (artificer, guardian,
        # deployer, etc.) it means a previous build failed or the worker was
        # killed mid-run. The checkpoint is stale.
        # Recovery: reset the entire graph state back to the conductor
        # interrupt so the user can chat again.
        if next_nodes and "conductor" not in next_nodes:
            log.warning(
                "resume_workflow: graph stuck at %s for project=%s — "
                "resetting to conductor (stale build recovery)",
                next_nodes, project_id,
            )
            publish(project_id, {
                "type":  "text_chunk",
                "chunk": "⚠️ Previous build was interrupted. Resetting so you can continue chatting.\n",
                "role":  "conductor",
            })

            # Preserve chat history and project info across reset
            _reset_graph_to_conductor(wf, config, {
                "project_id":           project_id,
                "build_id":             None,
                "project_name":         state.get("project_name", ""),
                "project_description":  state.get("project_description", ""),
                "chat_history":         state.get("chat_history", []),
                "current_user_input":   {
                    "message":      user_message,
                    "message_type": message_type,
                },
                "build_requested":      False,
                "build_description":    "",
                "tech_stack_hint":      None,
                "run_config":           None,
                "app_url":              None,
                "security_iteration":   0,
                "security_issues":      [],
                "all_security_issues":  [],
                "deploy_payload":       None,
                "artifacts":            [],
                "messages_to_save":     [],
                "_saved_msg_count":     0,
                "repo_url":             None,
                "deploy_url":           None,
                "error":                None,
            })

            # Now run conductor with the user's new message
            state = _stream_until_interrupt_or_end(wf, config, db, project_id)
            _save_state_to_db(db, state, project_id, state.get("build_id"))
            wf.update_state(config, {"_saved_msg_count": state.get("_saved_msg_count", 0)})

            snap = wf.get_state(config)
            if not snap.next:
                _finalise_build(db, state)
                publish(project_id, {"type": "close_stream"})
            return

        # ── Normal flow: parked at conductor ──────────────────────
        # Inject user message into state, then resume
        wf.update_state(config, {
            "current_user_input": {
                "message":      user_message,
                "message_type": message_type,
            }
        })

        state = _stream_until_interrupt_or_end(wf, config, db, project_id)

        _save_state_to_db(db, state, project_id, state.get("build_id"))
        wf.update_state(config, {"_saved_msg_count": state.get("_saved_msg_count", 0)})

        snap = wf.get_state(config)
        if not snap.next:
            _finalise_build(db, state)
            # Workflow completed - close SSE stream
        publish(project_id, {"type": "close_stream"})

    except Exception as e:
        log.exception("resume_workflow_task failed project=%s", project_id)
        publish(project_id, {"type": "build_failed", "reason": str(e)})
        publish(project_id, {"type": "close_stream"})

        # Reset graph so user isn't stuck after this failure too
        try:
            _reset_graph_to_conductor(wf, config, {
                "project_id":           project_id,
                "build_id":             None,
                "project_name":         "",
                "project_description":  "",
                "chat_history":         [],
                "current_user_input":   None,
                "build_requested":      False,
                "build_description":    "",
                "tech_stack_hint":      None,
                "run_config":           None,
                "app_url":              None,
                "security_iteration":   0,
                "security_issues":      [],
                "all_security_issues":  [],
                "deploy_payload":       None,
                "artifacts":            [],
                "messages_to_save":     [],
                "_saved_msg_count":     0,
                "repo_url":             None,
                "deploy_url":           None,
                "error":                str(e),
            })
        except Exception:
            log.exception("Failed to reset graph state after error project=%s", project_id)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TASK 3 — RAILWAY CONNECT
# User just saved their Railway API key.
# If a build is currently paused at the deployer interrupt, resume it.
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="workers.railway_connect", max_retries=1)
def railway_connect_task(self, project_id: str, thread_id: str) -> None:
    from app.core.redis import publish

    db = _get_session()
    try:
        wf     = _workflow()
        config = {"configurable": {"thread_id": thread_id}}

        snap = wf.get_state(config)
        if not snap or not snap.values:
            publish(project_id, {"type": "done", "status": "no_active_build"})
            publish(project_id, {"type": "close_stream"})
            return

        next_nodes = list(snap.next or [])

        # Only relevant if deployer is the next node waiting
        if "deployer" not in next_nodes:
            publish(project_id, {"type": "done", "status": "key_saved_for_future"})
            publish(project_id, {"type": "close_stream"})
            return

        log.info("Resuming deployer after Railway connect project=%s", project_id)

        # Signal the deployer that Railway is now connected.
        # Deployer will skip the Railway-key check and go straight to env_var_request.
        # We update state rather than passing a Command so the deployer node can
        # inspect state.get("railway_just_connected") normally.
        wf.update_state(config, {"railway_just_connected": True})

        state = _stream_until_interrupt_or_end(wf, config, db, project_id)
        _save_state_to_db(db, state, project_id, state.get("build_id"))
        wf.update_state(config, {"_saved_msg_count": state.get("_saved_msg_count", 0)})

        snap = wf.get_state(config)
        if not snap.next:
            _finalise_build(db, state)
            publish(project_id, {"type": "close_stream"})

    except Exception as e:
        log.exception("railway_connect_task failed project=%s", project_id)
        publish(project_id, {"type": "build_failed", "reason": str(e)})
        publish(project_id, {"type": "close_stream"})
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TASK 4 — DEPLOY CONFIRM
# User submitted their app env vars.
# Worker assembles FULL deploy_payload server-side (never from user),
# updates graph state, then resumes the deployer node.
#
# INTERRUPT STRATEGY:
#   workflow.py uses interrupt_before=["deployer"].
#   This means deployer has NOT run yet when we get here.
#   The deployer emitted env_var_request SSE *outside* the graph
#   (from the artificer→guardian→deployer transition logic below).
#   Now we inject credentials into state and stream — deployer runs once
#   with full credentials. No re-entry, no double-publish.
# ═══════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="workers.deploy_confirm", max_retries=1)
def deploy_confirm_task(
    self,
    project_id:     str,
    thread_id:      str,
    user_id:        str,
    plaintext_vars: dict,
) -> None:
    from app.core.redis import publish
    from app.utils.encryption import decrypt_token

    db = _get_session()
    github_token    = None
    railway_api_key = None
    deploy_payload  = None

    try:
        wf     = _workflow()
        config = {"configurable": {"thread_id": thread_id}}

        # ── Sanity check: deployer should be next ─────────────────
        snap = wf.get_state(config)
        if not snap or not snap.values:
            raise ValueError(f"No LangGraph state for thread {thread_id}")

        next_nodes = list(snap.next or [])
        if "deployer" not in next_nodes:
            log.warning(
                "deploy_confirm for project=%s but deployer not next (next=%s)",
                project_id, next_nodes,
            )
            publish(project_id, {
                "type":  "text_chunk",
                "chunk": "⚠️ No deployment is pending for this project.\n",
                "role":  "system",
            })
            publish(project_id, {"type": "done"})
            return

        # ── Fetch user credentials ────────────────────────────────
        user = _get_user(db, user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        if not user.github_token_encrypted:
            publish(project_id, {
                "type":  "text_chunk",
                "chunk": "❌ GitHub account not connected. Please reconnect via GitHub login.\n",
                "role":  "system",
            })
            publish(project_id, {"type": "done"})
            publish(project_id, {"type": "close_stream"})
            return

        if not user.railway_api_key_encrypted:
            # Emit connect_railway card — do NOT resume graph yet
            build_id = (snap.values or {}).get("build_id", "")
            _publish_connect_railway(project_id, build_id)
            return

        # ── Decrypt (in memory only from this point) ──────────────
        github_token    = decrypt_token(user.github_token_encrypted)
        railway_api_key = decrypt_token(user.railway_api_key_encrypted)

        log.info(
            "deploy_confirm project=%s user=%s vars_count=%d",
            project_id, user_id, len(plaintext_vars),
        )
        # NEVER log plaintext_vars

        # ── Assemble deploy_payload and inject into graph state ────
        deploy_payload = {
            "plaintext_vars":  plaintext_vars,
            "github_token":    github_token,
            "railway_api_key": railway_api_key,
        }

        # update_state before streaming — deployer reads from state, not Command
        wf.update_state(config, {"deploy_payload": deploy_payload})

        # ── Resume — deployer runs once with full credentials ──────
        state = _stream_until_interrupt_or_end(wf, config, db, project_id)

        # Wipe credentials from graph state immediately
        wf.update_state(config, {"deploy_payload": None})
        state["deploy_payload"] = None

        _save_state_to_db(db, state, project_id, state.get("build_id"))
        wf.update_state(config, {"_saved_msg_count": state.get("_saved_msg_count", 0)})

        snap = wf.get_state(config)
        if not snap.next:
            _finalise_build(db, state)
            publish(project_id, {"type": "close_stream"})

    except Exception as e:
        log.exception("deploy_confirm_task failed project=%s", project_id)
        publish(project_id, {"type": "build_failed", "reason": str(e)})
        publish(project_id, {"type": "close_stream"})
        raise self.retry(exc=e, countdown=30)
    finally:
        # Always wipe secrets from local scope
        plaintext_vars.clear()
        if github_token:    github_token    = None  # noqa: F841
        if railway_api_key: railway_api_key = None  # noqa: F841
        if deploy_payload:  deploy_payload  = None  # noqa: F841
        db.close()


# ── Connect Railway helper ────────────────────────────────────────

def _publish_connect_railway(project_id: str, build_id: str) -> None:
    """
    Emit connect_railway SSE event directly (graph stays paused at deployer interrupt).
    Called when user hasn't set their Railway API key yet.
    """
    import json
    from app.core.redis import publish

    publish(project_id, {
        "type":          "artifact",
        "artifact_type": "connect_railway",
        "title":         "Connect Railway to Deploy",
        "content": json.dumps({
            "build_id": build_id,
            "status":   "waiting_for_railway_key",
            "message":  (
                "🚂 Almost there! Your app is built and security-tested.\n\n"
                "To deploy, connect your Railway account once — "
                "future deployments are fully automatic.\n\n"
                "Get your token: railway.app → Account Settings → Tokens"
            ),
        }),
    })
    publish(project_id, {"type": "done"})
    publish(project_id, {"type": "close_stream"})  # This workflow path ends here
    log.info("Emitted connect_railway for project=%s build=%s", project_id, build_id)