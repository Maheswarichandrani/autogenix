"""
agents/react.py

ReAct (Reason + Act) loop for all agent nodes — RESUMABLE EXECUTION.

EVENT TAXONOMY (for Copilot-style step-by-step feed in UI):
  "thinking"       → Replaces/pulses a single status bar
  "step"           → APPENDS to timeline feed (tool executions)
  "tool_call"      → APPENDS tool invocation detail
  "tool_result"    → APPENDS tool result preview
  "text_chunk"     → Streaming final response, word-by-word
  "agent_paused"   → Agent hit budget, waiting for user decision
  "agent_resumed"  → Agent continuing after pause
  "agent_cancelled"→ Agent cancelled by user
  "model_switched" → LLM swapped mid-execution

EXECUTION LIFECYCLE:
  1. Agent runs in iteration batches (default: max_iter per batch).
  2. When budget exhausted WITHOUT final text → PAUSE (not terminate).
  3. Paused agents block on Redis control channel waiting for:
     - "continue"     → resume with fresh budget, same model
     - "switch_model" → resume with fresh budget, new LLM
     - "cancel"       → break cleanly, publish cancellation
  4. Execution state lives in the execution_registry (in-process dict).
  5. Cancellation checked before each iteration AND tool execution.

DESIGN CONSTRAINTS:
  - The Celery worker slot stays held during pause (intentional).
    Docker/tool context remains alive — no serialization needed.
  - Control signals arrive via Redis pub/sub (API process → worker).
  - No duplicate tool executions on resume.
  - Thread-safe via registry lock.
  - Future-extensible: budget, model, timeout all configurable per signal.

KEY FIXES vs original:
  1. Anthropic tool result format fixed (provider-aware).
  2. "thinking" only on iteration start; tool-specific statuses use "step".
  3. max_iter is a soft checkpoint, not a hard stop.
  4. Thinking status published with correct agent role on every step.
  5. Execution registry tracks all state for observability.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from langchain_core.tools import BaseTool

from app.core.redis import publish
from app.core.llm import get_llm, LLMProvider
from app.agents.execution_registry import (
    ExecutionStatus,
    register_execution,
    update_execution,
    is_cancelled,
    cleanup_execution,
    wait_for_control_signal,
)

log = logging.getLogger(__name__)

DEFAULT_MAX_ITER = 20
PAUSE_TIMEOUT_SECS = 300   # 5 minutes before auto-cancel on pause


# ── Dynamic step messages ─────────────────────────────────────────

_STEP_MESSAGES: dict[str, dict[str, str]] = {
    "artificer": {
        "write_file":     "Writing {arg}...",
        "read_file":      "Reading {arg}...",
        "exec_command":   "Running: {arg}",
        "check_syntax":   "Checking syntax of {arg}...",
        "list_files":     "Exploring project structure...",
        "get_app_logs":   "Checking application logs...",
        "delete_file":    "Removing {arg}...",
        "_default":       "Building (step {step})...",
    },
    "guardian": {
        "run_sql_injection_scan": "Testing for SQL injection...",
        "run_auth_bypass_scan":   "Testing authentication bypass...",
        "run_rate_limit_scan":    "Testing rate limiting...",
        "check_security_headers": "Checking security headers...",
        "http_request":           "Probing {arg}...",
        "read_source_file":       "Reviewing {arg}...",
        "list_source_files":      "Mapping project files...",
        "_default":               "Running security scan (step {step})...",
    },
    "deployer": {
        "create_github_repo":  "Creating GitHub repository...",
        "push_to_github":      "Pushing code to GitHub...",
        "deploy_to_railway":   "Deploying to Railway...",
        "check_deploy_status": "Checking deployment status...",
        "wait_for_deploy":     "Waiting for deployment to go live...",
        "_default":            "Deploying (step {step})...",
    },
}


def _step_msg(role: str, tool_name: str, tool_input: dict, step: int) -> str:
    role_map = _STEP_MESSAGES.get(role, {})
    template = role_map.get(tool_name, role_map.get("_default", "Processing (step {step})..."))

    arg = ""
    for key in ("file_path", "path", "url", "command", "endpoint"):
        if key in tool_input:
            val = str(tool_input[key])
            arg = val[:50] + ("..." if len(val) > 50 else "")
            break

    try:
        return template.format(arg=arg, step=step)
    except (KeyError, IndexError):
        return template.replace("{arg}", arg).replace("{step}", str(step))


def _safe_preview(tool_input: dict) -> str:
    """Truncate tool inputs for SSE display — mask any credential-looking keys."""
    try:
        preview = json.dumps(tool_input)
        lower   = preview.lower()
        for key in ("token", "key", "password", "secret", "credential", "auth"):
            if key in lower:
                return "{...sensitive input redacted...}"
        return preview[:300]
    except Exception:
        return str(tool_input)[:300]


def _stream_final_text(project_id: str, text: str, role: str) -> None:
    """Stream final text word-by-word for the frontend typewriter effect."""
    words = text.split(" ")
    for i, word in enumerate(words):
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": word + (" " if i < len(words) - 1 else ""),
            "role":  role,
        })
        time.sleep(0.015)


# ═══════════════════════════════════════════════════════════════════
# SINGLE ITERATION
# ═══════════════════════════════════════════════════════════════════

def _run_one_iteration(
    project_id:     str,
    role:           str,
    messages:       list[dict],
    tools:          list[BaseTool],
    tool_map:       dict[str, BaseTool],
    tool_calls_log: list[dict],
    llm,
    provider:       LLMProvider,
    iteration:      int,
) -> tuple[bool, str]:
    """
    Execute one ReAct iteration (one LLM call + tool executions if any).

    Returns (is_final, final_text):
      - (True, text)  → LLM returned final text. Loop should stop.
      - (False, "")   → LLM returned tool calls. Loop should continue.
    """
    publish(project_id, {
        "type":   "thinking",
        "role":   role,
        "status": "Reasoning..." if iteration == 0 else "Thinking about next step...",
    })

    response = llm.chat_with_tools(messages, tools, max_tokens=8192, temperature=0)

    # Detect "fake" tool calls from weak models
    if not response.tool_calls and response.content:
        _text = response.content
        if any(tn in _text for tn in tool_map):
            log.warning(
                "ReAct %s iter=%d: LLM returned tool names in plain text "
                "but no structured tool_calls. First 200 chars: %s",
                role, iteration, _text[:200],
            )

    # ── Tool call(s) ──────────────────────────────────────────
    if response.tool_calls:
        if provider == LLMProvider.ANTHROPIC and response.raw_content:
            # Send the turn back exactly as returned, thinking blocks included.
            # Rebuilding it would drop them and break preserved thinking.
            messages.append({"role": "assistant", "content": response.raw_content})
        elif provider == LLMProvider.ANTHROPIC:
            content_blocks = []
            if response.content:
                content_blocks.append({"type": "text", "text": response.content})
            for tc in response.tool_calls:
                content_blocks.append({
                    "type":  "tool_use",
                    "id":    tc.get("id", f"call_{iteration}_{tc['name']}"),
                    "name":  tc["name"],
                    "input": tc["args"],
                })
            messages.append({"role": "assistant", "content": content_blocks})
        else:
            openai_tool_calls = []
            for tc in response.tool_calls:
                openai_tool_calls.append({
                    "id":       tc.get("id", f"call_{iteration}_{tc['name']}"),
                    "type":     "function",
                    "function": {
                        "name":      tc["name"],
                        "arguments": json.dumps(tc["args"]),
                    },
                })
            messages.append({
                "role":       "assistant",
                "content":    response.content or None,
                "tool_calls": openai_tool_calls,
            })

        anthropic_result_blocks: list[dict] = []

        for tc in response.tool_calls:
            tool_name  = tc["name"]
            tool_input = tc["args"]
            tool_id    = tc.get("id", f"call_{iteration}_{tool_name}")

            # ── Pre-tool cancellation check ───────────────────
            if is_cancelled(project_id):
                log.info("Cancel before tool %s project=%s", tool_name, project_id)
                placeholder = "⚠️ Execution cancelled by user."
                if provider == LLMProvider.ANTHROPIC:
                    anthropic_result_blocks.append({
                        "type":        "tool_result",
                        "tool_use_id": tool_id,
                        "content":     placeholder,
                    })
                else:
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tool_id,
                        "name":         tool_name,
                        "content":      placeholder,
                    })
                break

            step_status = _step_msg(role, tool_name, tool_input, iteration + 1)
            publish(project_id, {
                "type":   "step",
                "role":   role,
                "status": step_status,
                "tool":   tool_name,
            })
            publish(project_id, {
                "type":  "tool_call",
                "role":  role,
                "tool":  tool_name,
                "input": _safe_preview(tool_input),
            })

            # Execute
            tool_fn = tool_map.get(tool_name)
            if tool_fn:
                try:
                    result = tool_fn.invoke(tool_input)
                except Exception as e:
                    result = f"❌ Tool error: {e}"
            else:
                result = f"❌ Unknown tool: {tool_name}"

            result_str = str(result)

            publish(project_id, {
                "type":     "tool_result",
                "role":     role,
                "tool":     tool_name,
                "result":   result_str[:500],
                "is_error": result_str.startswith("❌"),
            })

            tool_calls_log.append({
                "tool":     tool_name,
                "input":    tool_input,
                "output":   result_str,
                # Display copies: exactly what the browser already got live.
                "status":   step_status,
                "preview":  _safe_preview(tool_input),
                "is_error": result_str.startswith("❌"),
            })

            if provider == LLMProvider.ANTHROPIC:
                anthropic_result_blocks.append({
                    "type":        "tool_result",
                    "tool_use_id": tool_id,
                    "content":     result_str,
                })
            else:
                messages.append({
                    "role":         "tool",
                    "tool_call_id": tool_id,
                    "name":         tool_name,
                    "content":      result_str,
                })

        if provider == LLMProvider.ANTHROPIC and anthropic_result_blocks:
            messages.append({"role": "user", "content": anthropic_result_blocks})

        return False, ""

    # ── Final text response ───────────────────────────────────
    else:
        final_text = response.content if isinstance(response.content, str) else ""
        return True, final_text


# ═══════════════════════════════════════════════════════════════════
# MAIN ReAct LOOP — Resumable Execution Controller
# ═══════════════════════════════════════════════════════════════════

def run_react_agent(
    project_id:  str,
    role:        str,
    system:      str,
    user_prompt: str,
    tools:       list[BaseTool],
    history:     Optional[list] = None,
    max_iter:    int = DEFAULT_MAX_ITER,
    model:       str = "claude-haiku-4-5",
) -> tuple[str, list[dict]]:
    """
    Run a resumable ReAct agent loop.

    Returns (final_text, tool_calls_log).
    final_text is the last response that contained no tool calls.
    tool_calls_log is [{tool, input, output}, ...] for all tool invocations.

    EXECUTION LIFECYCLE:
      1. Runs up to max_iter iterations per batch.
      2. If budget exhausted without final text → PAUSE (not terminate).
      3. Publishes agent_paused, blocks on Redis for control signal.
      4. User can: continue (same model), switch_model, or cancel.
      5. On continue/switch → runs another batch with fresh budget.
      6. On cancel, timeout, or final text → returns to caller.

    The loop NEVER terminates permanently on budget exhaustion alone.
    It always gives the user a choice.
    """
    # ── Initialize ────────────────────────────────────────────
    llm      = get_llm(model)
    provider = llm.config.provider

    messages: list[dict] = [{"role": "system", "content": system}]
    if history:
        for msg in history:
            if hasattr(msg, "type"):
                type_map = {"human": "user", "ai": "assistant", "system": "system"}
                if msg.type in type_map:
                    messages.append({"role": type_map[msg.type], "content": msg.content})
            elif isinstance(msg, dict):
                messages.append(msg)
    messages.append({"role": "user", "content": user_prompt})

    tool_map:       dict[str, BaseTool] = {t.name: t for t in tools}
    tool_calls_log: list[dict]          = []
    final_text:     str                 = ""

    # ── Register in execution registry ────────────────────────
    register_execution(project_id, role, model)

    total_iterations = 0
    current_budget   = max_iter
    current_model    = model

    try:
        # ══════════════════════════════════════════════════════
        # OUTER LOOP — handles pause/resume cycles
        # Each pass runs one iteration batch, then either:
        #   a) breaks (final text found or cancel)
        #   b) pauses and waits for control signal
        # ══════════════════════════════════════════════════════
        while True:
            batch_done = False

            # ── INNER LOOP — one iteration batch ─────────────
            for _ in range(current_budget):
                # Pre-iteration cancellation check
                if is_cancelled(project_id):
                    log.info("Cancel at iter start project=%s iter=%d", project_id, total_iterations)
                    publish(project_id, {"type": "agent_cancelled", "role": role})
                    final_text = "⚠️ Agent execution cancelled by user."
                    return final_text, tool_calls_log

                update_execution(
                    project_id,
                    iteration=total_iterations,
                    total_iterations=total_iterations,
                )

                is_final, text = _run_one_iteration(
                    project_id, role, messages, tools, tool_map,
                    tool_calls_log, llm, provider, total_iterations,
                )
                total_iterations += 1

                # Post-iteration cancellation check
                if is_cancelled(project_id):
                    log.info("Cancel after iter project=%s iter=%d", project_id, total_iterations)
                    publish(project_id, {"type": "agent_cancelled", "role": role})
                    final_text = "⚠️ Agent execution cancelled by user."
                    return final_text, tool_calls_log

                if is_final:
                    final_text = text
                    _stream_final_text(project_id, final_text, role)
                    batch_done = True
                    break

            # Final text found — exit outer loop
            if batch_done:
                break

            # ══════════════════════════════════════════════════
            # BUDGET EXHAUSTED — PAUSE
            # ══════════════════════════════════════════════════
            log.info(
                "ReAct %s budget exhausted project=%s total_iter=%d — pausing",
                role, project_id, total_iterations,
            )

            update_execution(
                project_id,
                status=ExecutionStatus.PAUSED,
                pause_reason="max_iterations_reached",
                total_iterations=total_iterations,
            )

            publish(project_id, {
                "type":            "agent_paused",
                "reason":          "max_iterations_reached",
                "role":            role,
                "iterations_used": total_iterations,
                "model":           current_model,
            })

            # ── Block for control signal ─────────────────────
            signal = wait_for_control_signal(project_id, timeout=PAUSE_TIMEOUT_SECS)

            # ── Timeout → auto-cancel ────────────────────────
            if signal is None:
                log.warning("Control signal timeout project=%s — auto-cancel", project_id)
                publish(project_id, {"type": "agent_cancelled", "role": role, "reason": "timeout"})
                final_text = f"⚠️ Agent paused for too long ({PAUSE_TIMEOUT_SECS}s). Automatically cancelled."
                _stream_final_text(project_id, final_text, role)
                return final_text, tool_calls_log

            # ── CANCEL ───────────────────────────────────────
            if signal.action == "cancel":
                log.info("Cancel signal project=%s", project_id)
                update_execution(project_id, status=ExecutionStatus.CANCELLED)
                publish(project_id, {"type": "agent_cancelled", "role": role})
                final_text = "⚠️ Agent execution cancelled by user."
                return final_text, tool_calls_log

            # ── CONTINUE ─────────────────────────────────────
            elif signal.action == "continue":
                log.info("Continue signal project=%s budget=%d", project_id, signal.budget)
                update_execution(project_id, status=ExecutionStatus.RUNNING)
                publish(project_id, {"type": "agent_resumed", "role": role})
                current_budget = signal.budget
                # → next iteration of outer while loop

            # ── SWITCH MODEL ─────────────────────────────────
            elif signal.action == "switch_model":
                new_model = signal.model or current_model
                log.info(
                    "Switch model project=%s %s→%s budget=%d",
                    project_id, current_model, new_model, signal.budget,
                )
                llm = get_llm(new_model)
                provider = llm.config.provider
                current_model = new_model

                update_execution(project_id, status=ExecutionStatus.RUNNING, model=new_model)
                publish(project_id, {"type": "model_switched", "role": role, "new_model": new_model})
                publish(project_id, {"type": "agent_resumed", "role": role})
                current_budget = signal.budget
                # → next iteration of outer while loop

            else:
                log.warning("Unknown signal action=%s project=%s", signal.action, project_id)
                publish(project_id, {"type": "agent_cancelled", "role": role})
                final_text = "⚠️ Unknown control signal. Agent stopped."
                return final_text, tool_calls_log

    finally:
        # Always clean up the registry entry
        final_status = (
            ExecutionStatus.CANCELLED if is_cancelled(project_id)
            else ExecutionStatus.COMPLETED
        )
        update_execution(project_id, status=final_status, total_iterations=total_iterations)
        cleanup_execution(project_id)

    return final_text, tool_calls_log