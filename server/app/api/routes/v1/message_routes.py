"""
api/routes/message_router.py

Message endpoints for project chat + build pipeline.

═══════════════════════════════════════════════════════════════════
THE STREAMING FIX — EventSourceResponse replaces StreamingResponse
═══════════════════════════════════════════════════════════════════

The original used FastAPI's built-in StreamingResponse:

    return StreamingResponse(
        subscribe_and_stream(str(project_id)),
        media_type="text/event-stream",
        ...
    )

StreamingResponse does NOT flush each yielded chunk to the network
immediately. It passes chunks to uvicorn's ASGI send() call, but
uvicorn's HTTP/1.1 implementation may buffer them until the connection
closes or the TCP buffer fills. Result: ALL events arrive at once.

THE FIX: sse-starlette's EventSourceResponse

    pip install sse-starlette

EventSourceResponse is specifically designed for SSE. It calls
send() with body_complete=False on every single yield, which forces
uvicorn to flush that chunk immediately as a chunked-transfer-encoding
HTTP frame. Each SSE event becomes its own TCP segment.

This is the ONLY reliable way to get true per-event streaming with
FastAPI + uvicorn. No hacks, no extra asyncio.sleep() calls needed.

Install: pip install sse-starlette
Docs:    https://github.com/sysid/sse-starlette
"""

from __future__ import annotations

import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

# THE FIX: import EventSourceResponse instead of using StreamingResponse
from sse_starlette.sse import EventSourceResponse

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.redis import subscribe_and_stream, subscribe_code_stream
from app.models.user import User
from app.repositories.artifact_repo import ArtifactRepo
from app.repositories.build_repo import BuildRepo
from app.repositories.message_repo import MessageRepo
from app.repositories.project_repo import ProjectRepo
from app.schemas.enums import ACTION_TO_MESSAGE_TYPE, UserAction
from app.schemas.message_schemas import SendMessageRequest
from app.schemas.project_schemas import SendMessageResponse
from app.tasks.build_worker import deploy_confirm_task, resume_workflow_task, start_workflow_task
from app.agents.execution_registry import (
    ControlSignal,
    send_control_signal,
    get_execution,
    ExecutionStatus,
)

router = APIRouter(prefix="/projects/{project_id}", tags=["messages"])
log    = logging.getLogger(__name__)


# ── Serialiser ────────────────────────────────────────────────────

def _serialise(msg, artifact_map: dict) -> dict:
    blocks = []
    for block in (msg.content or []):
        if block.get("type") == "artifact":
            art = artifact_map.get(block.get("artifact_id"))
            blocks.append({
                **block,
                "artifact_data": {
                    "id":            str(art.id),
                    "artifact_type": art.artifact_type,
                    "title":         art.title,
                    "content":       art.content,
                } if art else None,
            })
        else:
            blocks.append(block)
    return {
        "id":           str(msg.id),
        "role":         msg.role,
        "message_type": msg.message_type,
        "content":      blocks,
        "metadata":     msg.metadata_,
        "created_at":   msg.created_at.isoformat(),
    }


# ════════════════════════════════════════════════════════════════════
# GET /messages — paginated chat history
# ════════════════════════════════════════════════════════════════════

@router.get("/messages")
async def get_messages(
    project_id:   UUID,
    offset:       int  = Query(0, ge=0),
    limit:        int  = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    messages, total = await MessageRepo(db).get_paginated(project_id, limit=limit, offset=offset)

    artifact_ids = [
        UUID(b["artifact_id"])
        for m in messages
        for b in (m.content or [])
        if b.get("type") == "artifact" and b.get("artifact_id")
    ]
    artifact_map = await ArtifactRepo(db).get_many_by_ids(artifact_ids)
    active_build = await BuildRepo(db).get_active_build(project_id)

    return {
        "messages":     [_serialise(m, artifact_map) for m in messages],
        "total":        total,
        "offset":       offset,
        "has_more":     (offset + limit) < total,
        "active_build": {
            "id":     str(active_build.id),
            "status": active_build.status,
        } if active_build else None,
    }


# ════════════════════════════════════════════════════════════════════
# POST /messages — unified entry point for ALL user interactions
# ════════════════════════════════════════════════════════════════════

@router.post("/messages", response_model=SendMessageResponse)
async def send_message(
    project_id:   UUID,
    body:         SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # ── provide_env_vars ─────────────────────────────────────────────────────
    if body.action == UserAction.PROVIDE_ENV_VARS:
        if not body.vars:
            raise HTTPException(
                status_code=422,
                detail="vars is required for provide_env_vars action",
            )
        active_build = await BuildRepo(db).get_active_build(project_id)
        if not active_build:
            raise HTTPException(status_code=409, detail="No active build waiting for deployment.")
        if not project.langgraph_thread_id:
            raise HTTPException(status_code=500, detail="No LangGraph thread ID on project.")

        user_msg = await MessageRepo(db).create(
            project_id   = project_id,
            role         = "user",
            message_type = "user_prompt",
            content      = [{"type": "text", "content": "Submitted environment variables for deployment."}],
        )
        await db.commit()

        deploy_confirm_task.delay(
            project_id     = str(project_id),
            thread_id      = project.langgraph_thread_id,
            user_id        = str(current_user.id),
            plaintext_vars = body.vars,
        )

        return {
            "user_message_id": str(user_msg.id),
            "thread_id":       project.langgraph_thread_id,
            "status":          "deploying",
            "stream_url":      f"/projects/{project_id}/messages/stream",
        }

    # ── agent_continue / agent_switch_model / agent_cancel ───────────────────
    if body.action in (UserAction.AGENT_CONTINUE, UserAction.AGENT_SWITCH_MODEL, UserAction.AGENT_CANCEL):
        action_map = {
            UserAction.AGENT_CONTINUE:     "continue",
            UserAction.AGENT_SWITCH_MODEL: "switch_model",
            UserAction.AGENT_CANCEL:       "cancel",
        }
        signal_action = action_map[body.action]

        if body.action == UserAction.AGENT_SWITCH_MODEL and not body.model:
            raise HTTPException(
                status_code=422,
                detail="model is required for agent_switch_model action",
            )

        signal = ControlSignal(
            action=signal_action,
            model=body.model,
            budget=body.budget or 20,
        )

        sent = send_control_signal(str(project_id), signal)

        return {
            "user_message_id": "",
            "thread_id":       project.langgraph_thread_id or "",
            "status":          f"agent_{signal_action}",
            "stream_url":      f"/projects/{project_id}/messages/stream",
        }

    # ── send_message ─────────────────────────────────────────────────────────
    message_type = ACTION_TO_MESSAGE_TYPE.get(body.action)
    if not message_type:
        raise HTTPException(status_code=422, detail=f"Unknown action: {body.action}")

    total_messages   = await MessageRepo(db).count_messages(project_id)
    is_first_message = (total_messages == 0)

    user_msg = await MessageRepo(db).create(
        project_id   = project_id,
        role         = "user",
        message_type = "user_prompt",
        content      = [{"type": "text", "content": body.content or ""}],
    )

    thread_id = project.langgraph_thread_id

    if is_first_message:
        if not thread_id:
            thread_id = str(uuid.uuid4())
            await ProjectRepo(db).update(
                project_id, current_user.id, langgraph_thread_id=thread_id
            )
    else:
        if not thread_id:
            raise HTTPException(
                status_code=500,
                detail="Project has messages but no LangGraph thread ID.",
            )

    await db.commit()

    if is_first_message:
        start_workflow_task.delay(
            project_id          = str(project_id),
            thread_id           = thread_id,
            user_message        = body.content or "",
            message_type        = message_type,
            project_name        = project.name,
            project_description = project.description or "",
        )
    else:
        resume_workflow_task.delay(
            project_id   = str(project_id),
            thread_id    = thread_id,
            user_message = body.content or "",
            message_type = message_type,
        )

    return {
        "user_message_id": str(user_msg.id),
        "thread_id":       thread_id,
        "status":          "processing",
        "stream_url":      f"/projects/{project_id}/messages/stream",
    }


# ════════════════════════════════════════════════════════════════════
# GET /messages/stream — SSE endpoint
#
# Uses EventSourceResponse from sse-starlette (not StreamingResponse).
# EventSourceResponse flushes each event immediately to the network.
# StreamingResponse buffers until the connection closes — DO NOT use it.
#
# Install: pip install sse-starlette
# ════════════════════════════════════════════════════════════════════

@router.get("/messages/stream")
async def stream_messages(
    project_id:   UUID,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_generator():
        """
        Wraps subscribe_and_stream for sse-starlette.

        subscribe_and_stream yields complete SSE strings: "data: {...}\\n\\n"
        sse-starlette expects either:
          - plain strings (it wraps them in "data: ...\\n\\n" itself), OR
          - dicts with {"data": "...", "event": "...", "id": "..."}

        Since our generator already produces fully-formatted SSE strings,
        we strip the "data: " prefix and trailing "\\n\\n" so sse-starlette
        can re-wrap them correctly. OR we use send_bytes mode.

        Simplest approach: yield the raw JSON string — sse-starlette adds
        the "data: " wrapper and flushes immediately.
        """
        async for sse_frame in subscribe_and_stream(str(project_id)):
            # sse_frame is "data: {...}\n\n" — strip wrapper so sse-starlette
            # can re-add it properly with immediate flush
            raw_json = sse_frame.removeprefix("data: ").rstrip("\n")
            yield raw_json

    return EventSourceResponse(
        event_generator(),
        # sse-starlette sends a keep-alive ping every 15s automatically
        ping=15,
    )


# ════════════════════════════════════════════════════════════════════
# GET /messages/code-stream — SSE endpoint for code panel
#
# Separate SSE connection for file events (file_created, file_deleted).
# The code panel subscribes to this instead of the main workflow stream.
# This keeps the two panels decoupled: chat gets workflow events,
# code editor gets file events — each on its own Redis channel.
# ════════════════════════════════════════════════════════════════════

@router.get("/messages/code-stream")
async def stream_code_events(
    project_id:   UUID,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def code_event_generator():
        async for sse_frame in subscribe_code_stream(str(project_id)):
            raw_json = sse_frame.removeprefix("data: ").rstrip("\n")
            yield raw_json

    return EventSourceResponse(
        code_event_generator(),
        ping=15,
    )