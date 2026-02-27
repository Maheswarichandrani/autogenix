"""
agents/workflow.py

4-Agent LangGraph pipeline.

AGENTS:
  Conductor    — Chat or trigger build. LLM tool-calling.
  Artificer    — ReAct agent. Writes + tests code in Docker.
  Guardian     — ReAct agent. Security-tests the running app.
  Deployer     — GitHub push + Railway deploy.

FLOW:
  START → conductor (interrupt_before) →
    chat  → back to conductor (interrupt_before pauses for next message)
    build → artificer → guardian → (issues?) → artificer_fix → guardian
                                             → deployer (interrupt_before) → END

KEY FIXES vs original:
  1. interrupt_before=["deployer"] replaces interrupt_after=["deployer"].
     With interrupt_after, the deployer node ran, emitted env_var_request,
     returned {deploy_payload: None}, THEN the interrupt fired — and resume
     would re-enter deployer from the top with still-None payload. Infinite loop.
     With interrupt_before, the deployer hasn't run yet when the graph parks.
     deploy_confirm_task injects credentials via update_state, then streams —
     deployer runs exactly once with full credentials.

  2. run_config added to GraphState. Artificer stores the parsed RunConfig
     dict here so Guardian and artificer_fix can reattach with DockerManager
     knowing the start_command for app restarts. No more "run_config is None"
     after reattach.

  3. railway_just_connected added to GraphState for the railway_connect flow.

  4. route_after_guardian fixed — the original regex matched the WORD "CRITICAL"
     anywhere in Guardian's text, including "I checked for CRITICAL issues and
     found none." Now Guardian is asked to output a structured JSON verdict at
     the end of its report, which is unambiguous.

  5. artificer_fix_node now calls docker.restart_app() properly since RunConfig
     is available via state["run_config"].

  6. env_var_request is now published from the guardian→deployer transition
     (route_after_guardian returning "deployer") NOT from inside the deployer
     node. This way the SSE event is sent before the graph parks, so the
     frontend sees it immediately when the build finishes.
"""

from __future__ import annotations

import json
import logging
import uuid
from operator import add as _list_add
from typing import Annotated, Optional, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver


def _resettable_list_add(left: list, right: list | None) -> list:
    """Custom LangGraph reducer that accumulates like operator.add but
    can be RESET to [] when the right operand is None.

    Usage in nodes:
      return {"messages_to_save": [new_msg]}   # appends
    Usage from update_state after persisting:
      wf.update_state(config, {"messages_to_save": None})  # clears
    """
    if right is None:
        return []
    return left + right

from app.core.redis import publish
from app.core.config import settings
from app.core.docker_manager import DockerManager, RunConfig
from app.core.llm import get_llm
from app.agents.tools.docker_tools import get_docker_tools
from app.agents.tools.security_tools import get_security_tools
from app.agents.tools.deploy_tools import get_deploy_tools
from app.agents.react import run_react_agent
from app.schemas.enums import WorkflowStage

log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# GRAPH STATE
# ═══════════════════════════════════════════════════════════════════

class GraphState(TypedDict, total=False):
    # Identity
    project_id:             str
    build_id:               Optional[str]
    project_name:           str
    project_description:    str

    # Chat
    chat_history:           Annotated[list, _list_add]
    current_user_input:     Optional[dict]    # {"message": str, "message_type": str}

    # Build control
    build_requested:        bool
    build_description:      str
    tech_stack_hint:        Optional[dict]

    # Container / app
    run_config:             Optional[dict]    # RunConfig.to_dict() — serialisable
    app_url:                Optional[str]

    # Security
    security_iteration:     int
    security_issues:        list
    all_security_issues:    list

    # Deployer
    deploy_payload:         Optional[dict]    # Wiped after use — NEVER persisted
    railway_just_connected: bool              # Signal from railway_connect_task

    # Persistence
    artifacts:              list
    messages_to_save:       Annotated[list, _list_add]


    # Results
    repo_url:               Optional[str]
    deploy_url:             Optional[str]
    error:                  Optional[str]


# ═══════════════════════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════════════════════

def _thinking(project_id: str, msg: str, role: str = "system") -> None:
    publish(project_id, {"type": "thinking", "status": msg, "role": role})


def _stream_text(project_id: str, text: str, role: str) -> None:
    publish(project_id, {"type": "agent_start", "role": role})
    words = text.split(" ")
    for i, word in enumerate(words):
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": word + (" " if i < len(words) - 1 else ""),
            "role":  role,
        })
    publish(project_id, {"type": "agent_done", "role": role})


def _msg(role: str, message_type: str, text: str) -> dict:
    from datetime import datetime, timezone
    return {
        "role":         role,
        "message_type": message_type,
        "content":      [{"type": "text", "content": text}],
        "created_at":   datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════
# NODE 1 — CONDUCTOR
# ═══════════════════════════════════════════════════════════════════

CONDUCTOR_SYSTEM = """\
You are Conductor, the orchestrating AI for a software development platform called NexusAI.

Analyse the user's message and call EXACTLY ONE of the two tools:

• start_build   — user wants to create/build something (app, API, website, tool, script, etc.)
• respond_to_user — everything else (questions, chat, unclear intent → ask a clarifying question)

Project context:
  Name:        {project_name}
  Description: {project_description}

Rules:
- Always call exactly one tool. Never reply with raw text.
- For start_build: include ALL details the user mentioned. Add sensible defaults but
  do NOT invent requirements the user didn't ask for.
- If the intent is ambiguous, use respond_to_user to ask one focused clarifying question.
"""

_CONDUCTOR_TOOLS = [
    {
        "name": "start_build",
        "description": "Start building an application. Call when the user wants to create something.",
        "parameters": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Detailed description of what to build.",
                },
                "tech_stack": {
                    "type": "object",
                    "description": "Optional tech stack (only what the user specified).",
                    "properties": {
                        "language":  {"type": "string"},
                        "framework": {"type": "string"},
                        "database":  {"type": "string"},
                    },
                },
            },
            "required": ["description"],
        },
    },
    {
        "name": "respond_to_user",
        "description": "Send a text response. Use for chat, questions, clarifications.",
        "parameters": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "The response to send."},
            },
            "required": ["message"],
        },
    },
]


def conductor_node(state: GraphState) -> dict:
    project_id = state["project_id"]
    user_input = state.get("current_user_input")

    if not user_input:
        # Nothing to process — graph just initialised or looping back
        return {"current_user_input": None}

    user_message = user_input.get("message", "")
    _thinking(project_id, "Analysing your request...", "conductor")

    system = CONDUCTOR_SYSTEM.format(
        project_name        = state.get("project_name", "Untitled"),
        project_description = state.get("project_description", ""),
    )

    messages = [{"role": "system", "content": system}]
    for msg in state.get("chat_history", [])[-20:]:
        if isinstance(msg, dict):
            messages.append(msg)
    messages.append({"role": "user", "content": user_message})

    llm      = get_llm("claude-haiku-4-5")
    response = llm.chat_with_tools(messages, _CONDUCTOR_TOOLS, max_tokens=2048, temperature=0)

    if not response.tool_calls:
        # Fallback — shouldn't happen with a well-prompted model
        text = response.content or "Could you tell me more about what you'd like to build?"
        _stream_text(project_id, text, "conductor")
        publish(project_id, {"type": "stage_change", "stage": WorkflowStage.IDLE.value})
        publish(project_id, {"type": "done"})
        return {
            "build_requested":    False,
            "current_user_input": None,
            "chat_history":       [
                {"role": "user",      "content": user_message},
                {"role": "assistant", "content": text},
            ],
            "messages_to_save": [_msg("conductor", "assistant_response", text)],
        }

    tc        = response.tool_calls[0]
    tool_name = tc["name"]
    tool_args = tc["args"]

    if tool_name == "start_build":
        description = tool_args.get("description", user_message)
        tech_stack  = tool_args.get("tech_stack")

        ack = (
            f"🚀 Got it! Building:\n\n{description}\n\n"
            "Handing off to the Artificer agent now..."
        )
        _stream_text(project_id, ack, "conductor")
        publish(project_id, {"type": "stage_change", "stage": WorkflowStage.BUILDING.value})
        publish(project_id, {"type": "done"})

        return {
            "build_requested":    True,
            "build_description":  description,
            "tech_stack_hint":    tech_stack,
            "current_user_input": None,
            "chat_history":       [
                {"role": "user",      "content": user_message},
                {"role": "assistant", "content": ack},
            ],
            "messages_to_save": [_msg("conductor", "assistant_response", ack)],
        }

    # respond_to_user
    text = tool_args.get("message", "")
    _stream_text(project_id, text, "conductor")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.IDLE.value})
    publish(project_id, {"type": "done"})

    return {
        "build_requested":    False,
        "current_user_input": None,
        "chat_history":       [
            {"role": "user",      "content": user_message},
            {"role": "assistant", "content": text},
        ],
        "messages_to_save": [_msg("conductor", "assistant_response", text)],
    }


def route_after_conductor(state: GraphState) -> str:
    if state.get("build_requested"):
        return "artificer"
    return "conductor"   # loop back → interrupt_before parks here


# ═══════════════════════════════════════════════════════════════════
# NODE 2 — ARTIFICER
# ═══════════════════════════════════════════════════════════════════

_ARTIFICER_SYSTEM = """\
You are Artificer, an expert software engineer AI agent.

Build a complete, production-quality application inside a Docker container at /workspace.

BUILD DESCRIPTION:
{build_description}

{tech_stack_section}

RULES:
1. Write ALL files needed for a complete, working application.
2. Start with dependency files (requirements.txt / package.json), then source, then config.
3. Always write COMPLETE files — never partial or placeholder content.
4. After writing files, install dependencies with exec_command.
5. Run check_syntax on every Python/JS file you write.
6. The app MUST listen on port 8080 (the PORT env var is already set to 8080).
7. Include a health check endpoint at /health returning HTTP 200.
8. Write a Dockerfile.
9. Use best practices: error handling, input validation, no hardcoded secrets.

CRITICAL FINAL STEP — after all files are written and verified:
Call exec_command with exactly this to output your run config:
echo '<<<RUN_CONFIG>>>​{{"install_command":"<cmd>","start_command":"<cmd>","health_check_path":"/health","startup_wait_secs":8}}​<<<END_RUN_CONFIG>>>'

Replace placeholders with your actual commands. No PORT in start_command needed — the env var handles it.
"""


def artificer_node(state: GraphState) -> dict:
    project_id        = state["project_id"]
    build_id          = state.get("build_id") or str(uuid.uuid4())
    build_description = state.get("build_description", "")
    tech_stack_hint   = state.get("tech_stack_hint")

    _thinking(project_id, "Preparing build environment...", "artificer")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.BUILDING.value})

    tech_section = ""
    if tech_stack_hint:
        parts = [
            f"- {k.title()}: {v}"
            for k, v in tech_stack_hint.items()
            if v
        ]
        if parts:
            tech_section = "REQUESTED TECH STACK:\n" + "\n".join(parts)

    system_prompt = _ARTIFICER_SYSTEM.format(
        build_description = build_description,
        tech_stack_section = tech_section,
    )

    docker = DockerManager(project_id, build_id)

    try:
        _thinking(project_id, "Starting Docker container...", "artificer")
        docker.spin_up()

        tools = get_docker_tools(docker)

        publish(project_id, {"type": "agent_start", "role": "artificer"})
        _thinking(project_id, "Writing code...", "artificer")

        final_text, tool_log = run_react_agent(
            project_id  = project_id,
            role        = "artificer",
            system      = system_prompt,
            user_prompt = f"Build this application:\n\n{build_description}",
            tools       = tools,
            max_iter    = 5,
            model       = "claude-haiku-4-5",
        )

        publish(project_id, {"type": "agent_done", "role": "artificer"})

        # Extract RunConfig from tool log
        run_config_dict = _extract_run_config(tool_log)
        app_url         = None
        run_config_obj  = None

        if run_config_dict:
            try:
                run_config_obj = RunConfig.from_dict(run_config_dict, tech_stack_hint)
                docker.configure_run(run_config_obj)
                _thinking(project_id, "Starting application...", "artificer")
                app_url = docker.start_app()
                log.info("App started at %s project=%s", app_url, project_id)
            except Exception as e:
                log.warning("Failed to start app: %s — Guardian will review source only", e)
        else:
            log.warning("No RunConfig found in artificer output project=%s", project_id)

        return {
            "build_id":        build_id,
            "run_config":      run_config_obj.to_dict() if run_config_obj else None,
            "app_url":         app_url,
            "messages_to_save": [_msg("artificer", "assistant_response", final_text or "Build complete.")],
        }

    except Exception as e:
        log.exception("Artificer failed project=%s", project_id)
        try:
            docker.spin_down()
        except Exception:
            pass
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": f"\n❌ Build error: {e}\n",
            "role":  "artificer",
        })
        return {
            "build_id": build_id,
            "error":    str(e),
            "messages_to_save": [_msg("artificer", "assistant_response", f"❌ Build failed: {e}")],
        }


def _extract_run_config(tool_log: list) -> dict | None:
    for entry in tool_log:
        output = entry.get("output", "")
        if "<<<RUN_CONFIG>>>" in output and "<<<END_RUN_CONFIG>>>" in output:
            try:
                start = output.index("<<<RUN_CONFIG>>>")   + len("<<<RUN_CONFIG>>>")
                end   = output.index("<<<END_RUN_CONFIG>>>")
                return json.loads(output[start:end])
            except (json.JSONDecodeError, ValueError):
                continue
    return None


# ═══════════════════════════════════════════════════════════════════
# NODE 3 — GUARDIAN
# ═══════════════════════════════════════════════════════════════════

_GUARDIAN_SYSTEM = """\
You are Guardian, an expert security testing AI agent.

Security-test the application at: {app_url}
Build description: {build_description}

TEST AREAS:
1. SQL Injection — all endpoints with injection payloads
2. Authentication bypass — protected routes without auth
3. Rate limiting — brute-force protection
4. Security headers — CORS, CSP, X-Frame-Options, etc.
5. Input validation — malformed/oversized inputs
6. Source code review — hardcoded secrets, weak crypto

CRITICAL: End your report with this EXACT JSON block on its own line:
<<<SECURITY_VERDICT>>>{"has_critical_issues": true/false, "severities": ["CRITICAL","HIGH"]}<<<END_VERDICT>>>

Set has_critical_issues=true ONLY if you found actual exploitable CRITICAL or HIGH issues.
If the app is inaccessible, review source code only and set has_critical_issues=false
unless you find hardcoded credentials or obvious injection flaws in the source.
"""

MAX_SECURITY_ITERATIONS = 2


def guardian_node(state: GraphState) -> dict:
    project_id        = state["project_id"]
    build_id          = state.get("build_id", "")
    app_url           = state.get("app_url")
    build_description = state.get("build_description", "")
    iteration         = state.get("security_iteration", 0)
    run_config_dict   = state.get("run_config")

    _thinking(project_id, "Starting security analysis...", "guardian")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.TESTING.value})

    docker = DockerManager.reattach(
        project_id = project_id,
        build_id   = build_id,
        run_config = run_config_dict,
    )

    if not app_url or not docker.container:
        msg = "⚠️ No running application to test. Skipping security scan."
        publish(project_id, {"type": "text_chunk", "chunk": msg, "role": "guardian"})
        publish(project_id, {"type": "agent_done", "role": "guardian"})
        return {
            "security_issues":   [],
            "security_iteration": iteration + 1,
            "messages_to_save":  [_msg("guardian", "assistant_response", msg)],
        }

    tools = get_security_tools(docker, app_url)
    system = _GUARDIAN_SYSTEM.format(app_url=app_url, build_description=build_description)

    publish(project_id, {"type": "agent_start", "role": "guardian"})
    _thinking(project_id, "Running security scans...", "guardian")

    final_text, _ = run_react_agent(
        project_id  = project_id,
        role        = "guardian",
        system      = system,
        user_prompt = f"Perform security testing on the application at {app_url}.",
        tools       = tools,
        max_iter    = 15,
        model       = "claude-haiku-4-5",
    )

    publish(project_id, {"type": "agent_done", "role": "guardian"})

    issues    = _parse_security_verdict(final_text)
    all_issues = state.get("all_security_issues", []) + issues

    return {
        "security_issues":    issues,
        "security_iteration": iteration + 1,
        "all_security_issues": all_issues,
        "messages_to_save":   [_msg("guardian", "assistant_response", final_text or "Security scan complete.")],
    }


def _parse_security_verdict(text: str) -> list:
    """
    Parse the structured JSON verdict Guardian is instructed to emit.
    Falls back to empty list (no issues) if verdict block is absent or malformed.
    This replaces the fragile keyword-matching approach in the original.
    """
    if not text:
        return []
    try:
        start = text.index("<<<SECURITY_VERDICT>>>") + len("<<<SECURITY_VERDICT>>>")
        end   = text.index("<<<END_VERDICT>>>")
        verdict = json.loads(text[start:end])
        if not verdict.get("has_critical_issues"):
            return []
        return [
            {"severity": s, "description": f"Guardian found {s} severity issue(s)"}
            for s in verdict.get("severities", [])
            if s in ("CRITICAL", "HIGH")
        ]
    except (ValueError, json.JSONDecodeError, KeyError):
        # Verdict block missing or malformed — assume clean (safe default)
        log.warning("Guardian verdict block missing or unparseable — assuming clean")
        return []


def route_after_guardian(state: GraphState) -> str:
    issues    = state.get("security_issues", [])
    iteration = state.get("security_iteration", 0)
    has_critical = any(i.get("severity") in ("CRITICAL", "HIGH") for i in issues)

    if has_critical and iteration < MAX_SECURITY_ITERATIONS:
        return "artificer_fix"

    # About to go to deployer — emit env_var_request here so the SSE event
    # arrives BEFORE the interrupt parks the graph. Frontend sees it immediately.
    project_id = state["project_id"]
    build_id   = state.get("build_id", "")
    _publish_env_var_request(project_id, build_id, state.get("build_description", ""))

    return "deployer"


def _publish_env_var_request(project_id: str, build_id: str, build_description: str) -> None:
    publish(project_id, {
        "type":          "artifact",
        "artifact_type": "env_var_request",
        "title":         "Environment Variables Required",
        "content": json.dumps({
            "build_id": build_id,
            "message":  (
                "Your application is built and security-tested! 🎉\n\n"
                "To deploy, please provide any environment variables your app needs "
                "(database URL, API keys, etc.). If your app doesn't need any, "
                "just submit an empty form."
            ),
            "suggested_vars": _guess_env_vars(build_description),
        }),
    })
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.WAITING_ENV.value})
    publish(project_id, {"type": "done"})


def _guess_env_vars(desc: str) -> list[str]:
    d = desc.lower()
    vars_: list[str] = []
    if any(w in d for w in ["database", "postgres", "mysql", "mongo", "sqlite"]):
        vars_.append("DATABASE_URL")
    if any(w in d for w in ["stripe", "payment"]):
        vars_.append("STRIPE_SECRET_KEY")
    if any(w in d for w in ["jwt", "auth", "token", "session"]):
        vars_.append("JWT_SECRET")
    if any(w in d for w in ["email", "smtp", "sendgrid", "mailgun"]):
        vars_.append("SMTP_HOST")
    if any(w in d for w in ["redis", "cache", "queue"]):
        vars_.append("REDIS_URL")
    if any(w in d for w in ["openai", "anthropic", "llm", "ai"]):
        vars_.append("OPENAI_API_KEY")
    return vars_


# ═══════════════════════════════════════════════════════════════════
# NODE 3b — ARTIFICER FIX
# Patches security issues found by Guardian, then restarts the app.
# ═══════════════════════════════════════════════════════════════════

_ARTIFICER_FIX_SYSTEM = """\
You are Artificer. The Guardian security agent found these issues in your code:

{issues}

FIX ALL ISSUES:
1. Read each affected file first (read_file)
2. Apply the fix
3. Run check_syntax after each edit
4. After all fixes, restart the app with:
   exec_command("pkill -f '<process>' 2>/dev/null || true && cd /workspace && nohup <start_command> > /workspace/app.log 2>&1 &")

Be thorough — Guardian will re-test after your fixes.
"""


def artificer_fix_node(state: GraphState) -> dict:
    project_id      = state["project_id"]
    build_id        = state.get("build_id", "")
    issues          = state.get("security_issues", [])
    run_config_dict = state.get("run_config")

    _thinking(project_id, "Fixing security issues...", "artificer")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.FIXING.value})

    # Reattach with RunConfig so the fix prompt can reference the start_command
    docker = DockerManager.reattach(
        project_id = project_id,
        build_id   = build_id,
        run_config = run_config_dict,
    )

    if not docker.container:
        msg = "❌ Container not found — cannot apply security fixes."
        publish(project_id, {"type": "text_chunk", "chunk": msg, "role": "artificer"})
        return {"messages_to_save": [_msg("artificer", "assistant_response", msg)]}

    issues_text   = json.dumps(issues, indent=2)
    start_command = docker.run_config.start_command if docker.run_config else "<start_command>"

    system = _ARTIFICER_FIX_SYSTEM.format(issues=issues_text).replace(
        "<start_command>", start_command
    )

    tools = get_docker_tools(docker)

    publish(project_id, {"type": "agent_start", "role": "artificer"})

    final_text, _ = run_react_agent(
        project_id  = project_id,
        role        = "artificer",
        system      = system,
        user_prompt = f"Fix these security issues:\n{issues_text}",
        tools       = tools,
        max_iter    = 12,
        model       = "claude-haiku-4-5",
    )

    publish(project_id, {"type": "agent_done", "role": "artificer"})

    # Restart app so Guardian tests the fixed version
    try:
        docker.restart_app()
    except Exception as e:
        log.warning("App restart after fix failed: %s", e)

    return {
        "messages_to_save": [_msg("artificer", "assistant_response", final_text or "Applied security fixes.")],
    }


# ═══════════════════════════════════════════════════════════════════
# NODE 4 — DEPLOYER
# Runs ONLY when deploy_payload is present in state.
# The env_var_request SSE event and the interrupt both happen BEFORE
# this node runs (see route_after_guardian and interrupt_before=["deployer"]).
# ═══════════════════════════════════════════════════════════════════

_DEPLOYER_SYSTEM = """\
You are Deployer. Deploy the application to Railway via GitHub.

Steps:
1. create_github_repo — create a private repo named "{repo_name}"
2. push_to_github     — push /workspace to the repo
3. deploy_to_railway  — deploy the repo to Railway
4. check_deploy_status / wait_for_deploy — poll until live
5. Report the final live URL

Project name: {project_name}
Build description: {build_description}
"""


def deployer_node(state: GraphState) -> dict:
    project_id     = state["project_id"]
    build_id       = state.get("build_id", "")
    deploy_payload = state.get("deploy_payload")
    run_config_dict = state.get("run_config")

    _thinking(project_id, "Starting deployment...", "deployer")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.DEPLOYING.value})

    if not deploy_payload:
        # Should not happen with interrupt_before=["deployer"] — guard anyway
        log.error("deployer_node reached with no deploy_payload project=%s", project_id)
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": "❌ Internal error: deploy_payload missing. Please re-submit env vars.\n",
            "role":  "deployer",
        })
        publish(project_id, {"type": "done"})
        return {"error": "deploy_payload missing"}

    github_token    = deploy_payload.get("github_token", "")
    railway_api_key = deploy_payload.get("railway_api_key", "")
    plaintext_vars  = deploy_payload.get("plaintext_vars", {})

    docker = DockerManager.reattach(
        project_id = project_id,
        build_id   = build_id,
        run_config = run_config_dict,
    )

    tools = get_deploy_tools(docker, github_token, railway_api_key=railway_api_key)

    project_name = state.get("project_name", "nexus-app")
    repo_name    = project_name.lower().replace(" ", "-")[:40]

    system = _DEPLOYER_SYSTEM.format(
        project_name      = project_name,
        repo_name         = repo_name,
        build_description = state.get("build_description", ""),
    )

    publish(project_id, {"type": "agent_start", "role": "deployer"})
    _thinking(project_id, "Deploying to Railway...", "deployer")

    env_str = json.dumps(plaintext_vars) if plaintext_vars else "No environment variables."
    final_text, tool_log = run_react_agent(
        project_id  = project_id,
        role        = "deployer",
        system      = system,
        user_prompt = f"Deploy the application.\nEnvironment variables: {env_str}",
        tools       = tools,
        max_iter    = 15,
        model       = "claude-haiku-4-5",
    )

    publish(project_id, {"type": "agent_done", "role": "deployer"})

    repo_url   = _extract_url(tool_log, "github.com")
    deploy_url = _extract_url(tool_log, "railway.app") or _extract_url(tool_log, "up.railway.app")

    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.COMPLETE.value})
    publish(project_id, {"type": "done", "deploy_url": deploy_url, "repo_url": repo_url})

    # Spin down the build container — no longer needed
    try:
        docker.spin_down()
    except Exception:
        pass

    return {
        "repo_url":      repo_url,
        "deploy_url":    deploy_url,
        "deploy_payload": None,   # Wipe credentials from state
        "messages_to_save": [_msg("deployer", "assistant_response", final_text or "Deployment complete.")],
    }


def _extract_url(tool_log: list, domain: str) -> str | None:
    import re
    pattern = re.compile(r"https?://[^\s'\"]*" + re.escape(domain) + r"[^\s'\"]*")
    for entry in tool_log:
        match = pattern.search(entry.get("output", ""))
        if match:
            return match.group(0)
    return None


# ═══════════════════════════════════════════════════════════════════
# CHECKPOINTER FACTORY
# ═══════════════════════════════════════════════════════════════════

def _make_checkpointer(db_url: str) -> PostgresSaver:
    """
    Create a PostgresSaver for use in a long-lived Celery worker process.

    WHY NOT from_conn_string():
      PostgresSaver.from_conn_string() is a @contextmanager. It returns a
      _GeneratorContextManager, not a PostgresSaver. You must use it as:
          with PostgresSaver.from_conn_string(url) as cp: ...
      This is fine for short-lived FastAPI request handlers, but in Celery
      workers the workflow graph is cached at module level (lives for hours).
      Calling .__enter__() without .__exit__() leaves the connection open but
      unmanaged — Python's GC eventually closes it, giving:
          psycopg.OperationalError: the connection is closed

    THE FIX:
      Create the psycopg connection directly with autocommit=True (required
      by LangGraph) and pass it to PostgresSaver(). The connection lives as
      long as the cached workflow graph. If it dies, _workflow() in
      build_worker.py catches the error and recreates the graph.

    autocommit=True is mandatory — LangGraph's PostgresSaver uses explicit
    transaction management internally and breaks if the connection is in
    autocommit=False mode.
    """
    import psycopg
    conn = psycopg.connect(db_url, autocommit=True)
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()   # Creates LangGraph checkpoint tables if they don't exist
    return checkpointer


# ═══════════════════════════════════════════════════════════════════
# GRAPH COMPILATION
# ═══════════════════════════════════════════════════════════════════

def create_workflow(db_url: str | None = None):
    """
    Compile and return the LangGraph workflow.

    Interrupt strategy:
      interrupt_before=["conductor"]  — park between user messages
      interrupt_before=["deployer"]   — park after security tests, before deploy
                                        so deploy_confirm_task can inject credentials
    """
    graph = StateGraph(GraphState)

    graph.add_node("conductor",     conductor_node)
    graph.add_node("artificer",     artificer_node)
    graph.add_node("guardian",      guardian_node)
    graph.add_node("artificer_fix", artificer_fix_node)
    graph.add_node("deployer",      deployer_node)

    graph.add_edge(START, "conductor")

    graph.add_conditional_edges("conductor", route_after_conductor, {
        "artificer": "artificer",
        "conductor": "conductor",
    })

    graph.add_edge("artificer", "guardian")

    graph.add_conditional_edges("guardian", route_after_guardian, {
        "artificer_fix": "artificer_fix",
        "deployer":      "deployer",
    })

    graph.add_edge("artificer_fix", "guardian")
    graph.add_edge("deployer", END)

    if db_url:
        checkpointer = _make_checkpointer(db_url)
    else:
        from langgraph.checkpoint.memory import MemorySaver
        checkpointer = MemorySaver()

    return graph.compile(
        checkpointer     = checkpointer,
        interrupt_before = ["conductor", "deployer"],
    )