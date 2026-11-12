"""
agents/deploy_context.py

Hands deploy secrets to deployer_node WITHOUT putting them in LangGraph state.

Why not state: every update_state() and node step writes a new checkpoint row
to Postgres, and a later "wipe" only adds another row. Why not
config["configurable"]: LangGraph copies configurable values into checkpoint
metadata.

How it works: deploy_confirm_task decrypts the credentials, put()s them here,
runs the graph synchronously in the same process, and discard()s them in a
finally block. deployer_node take()s them by thread_id.

Limits: process-local memory. This relies on the deploy graph run happening
inside the same Celery task and process (true today: --pool=solo and
_stream_until_interrupt_or_end). Never use it across tasks or processes.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field


@dataclass
class DeployContext:
    github_token:    str
    railway_api_key: str
    app_env_vars:    dict[str, str] = field(default_factory=dict)

    def __repr__(self) -> str:  # never print secrets by accident
        return f"DeployContext(app_env_vars={sorted(self.app_env_vars)})"


_lock = threading.Lock()
_contexts: dict[str, DeployContext] = {}


def put(thread_id: str, ctx: DeployContext) -> None:
    with _lock:
        _contexts[thread_id] = ctx


def take(thread_id: str) -> DeployContext | None:
    """Remove and return the context for this thread, or None."""
    with _lock:
        return _contexts.pop(thread_id, None)


def discard(thread_id: str) -> None:
    with _lock:
        _contexts.pop(thread_id, None)
