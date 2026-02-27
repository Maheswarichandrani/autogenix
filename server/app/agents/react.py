"""
agents/react.py

ReAct (Reason + Act) loop for all agent nodes.

EVENT TAXONOMY (for Copilot-style step-by-step feed in UI):
  "thinking"    → Replaces/pulses a single status bar. "Agent is reasoning..."
                  Only used for the initial reasoning step indicator.
  "step"        → APPENDS to a timeline feed. Each tool-specific status message
                  (e.g. "Writing app.py...", "Running security scan...") creates
                  a new entry in the UI — never replaces. This is the key change
                  from the original where everything was "thinking" and the UI
                  just replaced the single status text.
  "tool_call"   → APPENDS tool invocation detail (tool name + input preview).
  "tool_result" → APPENDS tool result preview.
  "text_chunk"  → Streaming final response, word-by-word.

KEY FIXES vs original:
  1. Anthropic tool result format fixed (provider-aware).
  2. "thinking" only on iteration start; tool-specific statuses use "step".
  3. max_iter enforced properly.
  4. thinking status published with correct agent role on every step.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from langchain_core.tools import BaseTool

from app.core.redis import publish
from app.core.llm import get_llm, LLMProvider

log = logging.getLogger(__name__)

DEFAULT_MAX_ITER = 20


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


# ═══════════════════════════════════════════════════════════════════
# MAIN ReAct LOOP
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
    Run a ReAct agent loop.

    Returns (final_text, tool_calls_log).
    final_text is the last response that contained no tool calls.
    tool_calls_log is [{tool, input, output}, ...] for all tool invocations.
    """
    llm      = get_llm(model)
    provider = llm.config.provider   # LLMProvider enum

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

    for iteration in range(max_iter):
        # "thinking" type → replaces the single pulsing status bar in UI.
        # Only used here at reasoning time, NOT for individual tool steps.
        publish(project_id, {
            "type":   "thinking",
            "role":   role,
            "status": "Reasoning..." if iteration == 0 else f"Thinking about next step...",
        })

        response = llm.chat_with_tools(messages, tools, max_tokens=8192, temperature=0)

        # Detect "fake" tool calls from weak models
        if not response.tool_calls and response.content:
            _text = response.content
            if any(tn in _text for tn in tool_map):
                log.warning(
                    "ReAct %s iter=%d: LLM returned tool names in plain text "
                    "but no structured tool_calls — model may not support "
                    "tool calling reliably. First 200 chars: %s",
                    role, iteration, _text[:200],
                )

        # ── Tool call(s) ──────────────────────────────────────────
        if response.tool_calls:
            if provider == LLMProvider.ANTHROPIC:
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
                messages.append({
                    "role":    "assistant",
                    "content": content_blocks,
                })
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

                # "step" type → APPENDS a new entry to the timeline feed in UI.
                # This is the KEY difference from "thinking" — each tool gets its
                # own row in the Copilot-style step list, never replacing previous.
                publish(project_id, {
                    "type":   "step",
                    "role":   role,
                    "status": _step_msg(role, tool_name, tool_input, iteration + 1),
                    "tool":   tool_name,
                })

                # Tool call detail — shown as expandable card in the feed
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

                # Tool result — shown below the tool_call card in the feed
                publish(project_id, {
                    "type":   "tool_result",
                    "role":   role,
                    "tool":   tool_name,
                    "result": result_str[:500],
                    # Indicate success/failure for UI coloring
                    "is_error": result_str.startswith("❌"),
                })

                tool_calls_log.append({
                    "tool":   tool_name,
                    "input":  tool_input,
                    "output": result_str,
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
                messages.append({
                    "role":    "user",
                    "content": anthropic_result_blocks,
                })

        # ── Final text response ───────────────────────────────────
        else:
            final_text = response.content if isinstance(response.content, str) else ""

            # Stream word by word so the frontend renders incrementally.
            # Each publish is one word — the frontend appends chunk by chunk
            # to inProgressMessage.text, giving the typewriter effect.
            words = final_text.split(" ")
            for i, word in enumerate(words):
                publish(project_id, {
                    "type":  "text_chunk",
                    "chunk": word + (" " if i < len(words) - 1 else ""),
                    "role":  role,
                })
            break

    else:
        final_text = f"⚠️ Agent reached max iterations ({max_iter}). Stopping."
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": f"\n{final_text}\n",
            "role":  role,
        })

    return final_text, tool_calls_log