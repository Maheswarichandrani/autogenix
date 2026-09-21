"""
agents/execution_registry.py

Thread-safe execution registry for in-flight ReAct agents.

Provides two core capabilities:

1. EXECUTION STATE TRACKING
   Keyed by project_id, tracks every active/paused agent execution:
   messages, tool_calls_log, iteration count, model, status.

2. CONTROL SIGNAL DELIVERY
   Uses Redis pub/sub to deliver control signals (continue, switch_model,
   cancel) from the API layer to the blocked ReAct loop in the Celery worker.
   The ReAct loop blocks on wait_for_control_signal() which listens to
   project:{id}:agent_control channel.

ARCHITECTURE:
  - Registry dict lives in the Celery worker process (module-level).
  - Thread-safe via threading.Lock.
  - Control signals delivered via Redis pub/sub (works across API → worker).
  - The ReAct loop stays alive while paused (holds Celery worker slot).
    This is intentional: Docker context, tools, and workflow graph state
    all remain valid. No serialization/deserialization needed.

WHY NOT REDIS-BACKED STATE?
  The execution state includes non-serializable objects (BaseTool instances,
  LLM provider state). Keeping it in-process avoids complex pickling.
  Only the control signals cross the process boundary (API → worker).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# EXECUTION STATUS
# ═══════════════════════════════════════════════════════════════════

class ExecutionStatus(str, Enum):
    RUNNING   = "running"
    PAUSED    = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


# ═══════════════════════════════════════════════════════════════════
# CONTROL SIGNAL
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ControlSignal:
    """Decoded control signal from the user via Redis pub/sub."""
    action: str               # "continue" | "switch_model" | "cancel"
    model:  Optional[str] = None   # new model name for switch_model
    budget: int = 20          # iteration budget for continue/switch_model


# ═══════════════════════════════════════════════════════════════════
# EXECUTION STATE
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ExecutionState:
    """Full state of a running or paused ReAct agent."""
    project_id:     str
    role:           str
    model:          str
    status:         ExecutionStatus = ExecutionStatus.RUNNING
    iteration:      int = 0
    total_iterations: int = 0   # cumulative across all batches
    messages:       list = field(default_factory=list)
    tool_calls_log: list = field(default_factory=list)
    created_at:     float = field(default_factory=time.time)
    paused_at:      Optional[float] = None
    pause_reason:   Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
# REGISTRY
# ═══════════════════════════════════════════════════════════════════

_registry: dict[str, ExecutionState] = {}
_lock = threading.Lock()


def register_execution(
    project_id: str,
    role: str,
    model: str,
) -> ExecutionState:
    """
    Register a new agent execution.
    If one already exists for this project_id, it is replaced.
    """
    state = ExecutionState(
        project_id=project_id,
        role=role,
        model=model,
    )
    with _lock:
        _registry[project_id] = state
    log.info(
        "Registered execution project=%s role=%s model=%s",
        project_id, role, model,
    )
    return state


def get_execution(project_id: str) -> Optional[ExecutionState]:
    """Get the current execution state for a project. Thread-safe read."""
    with _lock:
        return _registry.get(project_id)


def update_execution(
    project_id: str,
    *,
    status: Optional[ExecutionStatus] = None,
    iteration: Optional[int] = None,
    total_iterations: Optional[int] = None,
    model: Optional[str] = None,
    messages: Optional[list] = None,
    tool_calls_log: Optional[list] = None,
    pause_reason: Optional[str] = None,
) -> Optional[ExecutionState]:
    """Update fields on an existing execution. Returns updated state or None."""
    with _lock:
        state = _registry.get(project_id)
        if not state:
            return None
        if status is not None:
            state.status = status
            if status == ExecutionStatus.PAUSED:
                state.paused_at = time.time()
                state.pause_reason = pause_reason
        if iteration is not None:
            state.iteration = iteration
        if total_iterations is not None:
            state.total_iterations = total_iterations
        if model is not None:
            state.model = model
        if messages is not None:
            state.messages = messages
        if tool_calls_log is not None:
            state.tool_calls_log = tool_calls_log
        return state


def is_cancelled(project_id: str) -> bool:
    """Quick check if the execution has been marked as cancelled."""
    with _lock:
        state = _registry.get(project_id)
        return state is not None and state.status == ExecutionStatus.CANCELLED


def mark_cancelled(project_id: str) -> bool:
    """Mark execution as cancelled. Returns True if found and marked."""
    with _lock:
        state = _registry.get(project_id)
        if state and state.status in (ExecutionStatus.RUNNING, ExecutionStatus.PAUSED):
            state.status = ExecutionStatus.CANCELLED
            log.info("Marked execution cancelled project=%s", project_id)
            return True
        return False


def cleanup_execution(project_id: str) -> None:
    """Remove execution from registry (after completion or cancel)."""
    with _lock:
        removed = _registry.pop(project_id, None)
    if removed:
        log.info(
            "Cleaned up execution project=%s role=%s status=%s total_iter=%d",
            project_id, removed.role, removed.status, removed.total_iterations,
        )


def get_all_executions() -> dict[str, dict]:
    """Snapshot of all active executions (for debugging/monitoring)."""
    with _lock:
        return {
            pid: {
                "role": s.role,
                "model": s.model,
                "status": s.status.value,
                "iteration": s.iteration,
                "total_iterations": s.total_iterations,
                "created_at": s.created_at,
                "paused_at": s.paused_at,
                "pause_reason": s.pause_reason,
            }
            for pid, s in _registry.items()
        }


# ═══════════════════════════════════════════════════════════════════
# CONTROL SIGNAL — Redis pub/sub
# ═══════════════════════════════════════════════════════════════════

_CONTROL_CHANNEL_PREFIX = "project:{project_id}:agent_control"


def _control_channel(project_id: str) -> str:
    return _CONTROL_CHANNEL_PREFIX.format(project_id=project_id)


def send_control_signal(project_id: str, signal: ControlSignal) -> bool:
    """
    Publish a control signal to the paused agent via Redis.
    Called from the API layer (FastAPI process).

    Returns True if published, False on error.
    """
    from app.core.redis import _get_sync_client

    channel = _control_channel(project_id)
    payload = json.dumps({
        "action": signal.action,
        "model":  signal.model,
        "budget": signal.budget,
    })

    try:
        client = _get_sync_client()
        receivers = client.publish(channel, payload)
        log.info(
            "Sent control signal project=%s action=%s receivers=%d",
            project_id, signal.action, receivers,
        )
        return receivers > 0
    except Exception as e:
        log.error("Failed to send control signal project=%s: %s", project_id, e)
        return False


def wait_for_control_signal(
    project_id: str,
    timeout: int = 300,
) -> Optional[ControlSignal]:
    """
    Block until a control signal arrives on the project's control channel.
    Called from the Celery worker process (inside the ReAct loop).

    Uses Redis SUBSCRIBE with a blocking get_message() call.
    Returns the decoded ControlSignal, or None on timeout.

    Timeout default: 5 minutes. After timeout, the agent auto-cancels.
    """
    from app.core.redis import _get_sync_client

    channel = _control_channel(project_id)
    client = _get_sync_client()
    pubsub = client.pubsub()

    try:
        pubsub.subscribe(channel)
        log.info(
            "Waiting for control signal on %s (timeout=%ds)",
            channel, timeout,
        )

        deadline = time.time() + timeout

        while time.time() < deadline:
            # Check if execution was cancelled externally while waiting
            if is_cancelled(project_id):
                log.info("Cancel detected while waiting for signal project=%s", project_id)
                return ControlSignal(action="cancel")

            message = pubsub.get_message(timeout=1.0)
            if message is None:
                continue

            # Skip subscribe confirmation messages
            if message["type"] != "message":
                continue

            try:
                data = json.loads(message["data"])
                signal = ControlSignal(
                    action=data.get("action", "cancel"),
                    model=data.get("model"),
                    budget=data.get("budget", 20),
                )
                log.info(
                    "Received control signal project=%s action=%s model=%s budget=%d",
                    project_id, signal.action, signal.model, signal.budget,
                )
                return signal
            except (json.JSONDecodeError, KeyError) as e:
                log.warning(
                    "Invalid control signal data project=%s: %s",
                    project_id, e,
                )
                continue

        log.warning("Control signal timeout project=%s after %ds", project_id, timeout)
        return None  # Caller interprets as auto-cancel

    finally:
        try:
            pubsub.unsubscribe(channel)
            pubsub.close()
        except Exception:
            pass
