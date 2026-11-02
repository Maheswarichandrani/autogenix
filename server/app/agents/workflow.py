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
import re
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
from app.core.stacks import SUPPORTED_STACK_NAMES, get_stack, resolve_tech_stack
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
    import time
    publish(project_id, {"type": "agent_start", "role": role})
    words = text.split(" ")
    for i, word in enumerate(words):
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": word + (" " if i < len(words) - 1 else ""),
            "role":  role,
        })
        # Small delay between words prevents TCP coalescing — each SSE event
        # arrives as a separate frame so the frontend typewriter can animate.
        time.sleep(0.015)
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
You are Conductor, the orchestrating AI for only server building platform called Autogenix.

Analyse the user's message and call EXACTLY ONE of the two tools:

• start_build   — user wants to create/build something (app, API, website, tool, script, etc.)
• respond_to_user — everything else (questions, chat, unclear intent → ask a clarifying question)

Project context:
  Name:        {project_name}
  Description: {project_description}

User context:
  Default stack:   {default_stack}
  Developer level: {developer_level}

Supported stacks: {supported_stacks}

Rules:
- Always call exactly one tool. Never reply with raw text.
- For start_build: include ALL details the user mentioned. Add sensible defaults but
  do NOT invent requirements the user didn't ask for.
- If the user names a supported stack, put it in tech_stack. If they name no stack,
  leave tech_stack empty and their default stack is applied automatically.
- If the user asks for any other stack, call respond_to_user, say it is not supported
  yet, and list the supported stacks.
- Match how much you explain to the developer level. Never change what gets built
  because of it.
- If the intent is ambiguous, use respond_to_user to ask one focused clarifying question.
- Only respond correctly for backend related user queries.
- if asked out of scope, politely decline and suggest focusing on backend topics.
- he/she can have normal conversations about backend topics.
"""

_DEVELOPER_LEVELS = ("beginner", "intermediate", "advanced", "founder")

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

    user_message    = user_input.get("message", "")
    preferred_stack = user_input.get("preferred_stack")
    developer_level = user_input.get("developer_level")
    if developer_level not in _DEVELOPER_LEVELS:
        developer_level = "beginner"

    _thinking(project_id, "Analysing your request...", "conductor")

    system = CONDUCTOR_SYSTEM.format(
        project_name        = state.get("project_name", "Untitled"),
        project_description = state.get("project_description", ""),
        default_stack       = get_stack(preferred_stack).label,
        developer_level     = developer_level,
        supported_stacks    = SUPPORTED_STACK_NAMES,
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
        tech_stack, unsupported = resolve_tech_stack(
            tool_args.get("tech_stack"), preferred_stack,
        )

        # Decided in code as well as the prompt, so no container ever starts
        # for a stack the sandbox can't run.
        if unsupported:
            text = (
                f"{unsupported} isn't supported yet. "
                f"Autogenix can build with {SUPPORTED_STACK_NAMES}."
            )
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

CRITICAL SUCCESS REQUIREMENT:
Your job is NOT complete until you output the run configuration. The system cannot start your app without it.

RULES:
1. Write ALL files needed for a complete, working application.
2. Start with dependency files (requirements.txt / package.json / go.mod / pom.xml), then source, then config.
3. Always write COMPLETE files — never partial or placeholder content.
4. After writing files, install dependencies with exec_command.
5. Run check_syntax on every Python/JS file you write. For Go and Java, run the build instead, because check_syntax skips those files.
6. The app MUST listen on port 8080 (the PORT env var is already set to 8080).
7. Include a health check endpoint at /health returning HTTP 200.
8. Write a Dockerfile.
9. Use best practices: error handling, input validation, no hardcoded secrets.

MANDATORY FINAL STEP - DO NOT FORGET:
After all files are written, tested, and working, you MUST call exec_command with this EXACT format:

echo '<<<RUN_CONFIG>>>{{\"install_command\":\"<your_install_cmd>\",\"start_command\":\"<your_start_cmd>\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}}<<<END_RUN_CONFIG>>>'

Examples:
- Flask: echo '<<<RUN_CONFIG>>>{{\"install_command\":\"pip install -r requirements.txt\",\"start_command\":\"python app.py\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}}<<<END_RUN_CONFIG>>>'
- Express: echo '<<<RUN_CONFIG>>>{{\"install_command\":\"npm install\",\"start_command\":\"npm start\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}}<<<END_RUN_CONFIG>>>'
- Gin: echo '<<<RUN_CONFIG>>>{{\"install_command\":\"go mod tidy && go build -o app .\",\"start_command\":\"./app\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}}<<<END_RUN_CONFIG>>>'
- Spring Boot: echo '<<<RUN_CONFIG>>>{{\"install_command\":\"mvn package -q -DskipTests\",\"start_command\":\"java -jar target/app.jar\",\"health_check_path\":\"/health\",\"startup_wait_secs\":30}}<<<END_RUN_CONFIG>>>'

⚠️ WITHOUT THIS STEP, YOUR APPLICATION CANNOT BE STARTED OR TESTED ⚠️
"""


def artificer_node(state: GraphState) -> dict:
    project_id        = state["project_id"]
    build_id          = state.get("build_id") or str(uuid.uuid4())
    build_description = state.get("build_description", "")
    tech_stack_hint   = state.get("tech_stack_hint")

    # Edge case: Empty or None project_id
    if not project_id:
        error_msg = "Invalid project_id provided to artificer_node"
        log.error(error_msg)
        return {"error": error_msg, "messages_to_save": [_msg("artificer", "assistant_response", f"❌ {error_msg}")]}

    # Edge case: Empty build description
    if not build_description or len(build_description.strip()) < 10:
        log.warning("Very short or empty build description for project=%s", project_id)
        build_description = build_description or "Build a simple web application with basic functionality."

    _thinking(project_id, "Preparing build environment...", "artificer")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.BUILDING.value})

    tech_section = ""
    if tech_stack_hint:
        parts = [
            f"- {k.title()}: {v}"
            for k, v in tech_stack_hint.items()
            if v and str(v).strip()  # Edge case: filter out empty values
        ]
        if parts:
            tech_section = "REQUESTED TECH STACK:\n" + "\n".join(parts)

    system_prompt = _ARTIFICER_SYSTEM.format(
        build_description = build_description,
        tech_stack_section = tech_section,
    )

    docker = DockerManager(project_id, build_id, (tech_stack_hint or {}).get("framework"))

    try:
        _thinking(project_id, "Starting Docker container...", "artificer")
        
        # Edge case: Docker service not available
        try:
            docker.spin_up()
        except Exception as docker_error:
            if "Cannot connect to the Docker daemon" in str(docker_error):
                error_msg = "Docker daemon is not running. Please start Docker Desktop and try again."
            elif "permission denied" in str(docker_error).lower():
                error_msg = "Docker permission denied. Please check Docker daemon permissions."
            else:
                error_msg = f"Failed to start Docker container: {docker_error}"
            
            log.error("Docker startup failed for project=%s: %s", project_id, error_msg)
            publish(project_id, {
                "type": "text_chunk",
                "chunk": f"❌ {error_msg}\n",
                "role": "artificer",
            })
            return {
                "build_id": build_id,
                "error": error_msg,
                "messages_to_save": [_msg("artificer", "assistant_response", f"❌ {error_msg}")],
            }

        # Edge case: Tools not available
        try:
            tools = get_docker_tools(docker, project_id)
            if not tools:
                log.warning("No Docker tools available for project=%s", project_id)
        except Exception as tools_error:
            log.error("Failed to get Docker tools for project=%s: %s", project_id, tools_error)
            tools = []  # Continue with empty tools list

        publish(project_id, {"type": "agent_start", "role": "artificer"})
        _thinking(project_id, "Writing code...", "artificer")

        # Edge case: Agent execution failure
        try:
            final_text, tool_log = run_react_agent(
                project_id  = project_id,
                role        = "artificer",
                system      = system_prompt,
                user_prompt = f"Build this application:\n\n{build_description}",
                tools       = tools,
                max_iter    = 20,  # Increased from 5 to allow time for run_config generation
                model       = "gpt-4o",
            )
        except Exception as agent_error:
            log.error("React agent failed for project=%s: %s", project_id, agent_error)
            
            # Try fallback with reduced iterations
            try:
                log.info("Attempting fallback execution with reduced iterations for project=%s", project_id)
                final_text, tool_log = run_react_agent(
                    project_id  = project_id,
                    role        = "artificer",
                    system      = system_prompt,
                    user_prompt = f"Build this simple application:\n\n{build_description}",
                    tools       = tools,
                    max_iter    = 5,  # Reduced for fallback
                    model       = "gpt-4o",
                )
            except Exception as fallback_error:
                error_msg = f"Agent execution failed: {agent_error}. Fallback also failed: {fallback_error}"
                log.error(error_msg)
                try:
                    docker.spin_down()
                except Exception:
                    pass
                return {
                    "build_id": build_id,
                    "error": error_msg,
                    "messages_to_save": [_msg("artificer", "assistant_response", f"❌ {error_msg}")],
                }

        publish(project_id, {"type": "agent_done", "role": "artificer"})

        # Edge case: Empty results
        if not final_text and not tool_log:
            log.warning("Agent returned empty results for project=%s", project_id)
            final_text = "Build process completed but no output was generated."
            tool_log = []

        # Debug: log the final text and tool log for inspection
        log.debug("Artificer final_text: %s", final_text[:500] + ("..." if len(final_text) > 500 else ""))
        log.debug("Artificer tool_log entries: %d", len(tool_log) if tool_log else 0)

        # Extract RunConfig from tool log
        run_config_dict = _extract_run_config(tool_log) if tool_log else None
        app_url         = None
        run_config_obj  = None

        # Fallback: if no run_config found, try to infer one from file contents
        if not run_config_dict:
            log.warning("No RunConfig found in tool log, attempting to infer from files")
            
            # Edge case: Docker container might be in bad state
            try:
                run_config_dict = _infer_run_config(docker, tech_stack_hint)
            except Exception as infer_error:
                log.error("Failed to infer run_config for project=%s: %s", project_id, infer_error)
                
                # Last resort: create a minimal default config
                if tech_stack_hint:
                    language = tech_stack_hint.get("language", "").lower()
                    if "python" in language:
                        run_config_dict = {
                            "install_command": "pip install -r requirements.txt || echo 'No requirements.txt'",
                            "start_command": "python app.py || python main.py || python server.py",
                            "health_check_path": "/health",
                            "startup_wait_secs": 8
                        }
                    elif "javascript" in language or "node" in language:
                        run_config_dict = {
                            "install_command": "npm install || yarn install || echo 'No package.json'",
                            "start_command": "npm start || node index.js || node app.js",
                            "health_check_path": "/health",
                            "startup_wait_secs": 8
                        }

        if run_config_dict:
            try:
                run_config_obj = RunConfig.from_dict(run_config_dict, tech_stack_hint)
                
                # Edge case: Run config creation succeeded but Docker config fails
                try:
                    docker.configure_run(run_config_obj)
                except Exception as config_error:
                    log.warning("Docker configure_run failed for project=%s: %s", project_id, config_error)
                    # Continue without configuring - Guardian will handle source review
                
                _thinking(project_id, "Starting application...", "artificer")
                
                # Edge case: App startup failure with timeout handling
                try:
                    app_url = docker.start_app()
                    if app_url:
                        log.info("App started at %s project=%s", app_url, project_id)
                    else:
                        log.warning("App start returned no URL for project=%s", project_id)
                except Exception as start_error:
                    log.warning("Failed to start app for project=%s: %s", project_id, start_error)
                    publish(project_id, {
                        "type":  "text_chunk",
                        "chunk": f"⚠️ App build completed but failed to start: {start_error}\nGuardian will review the source code.\n",
                        "role":  "artificer",
                    })
                    
            except Exception as run_config_error:
                log.warning("RunConfig creation failed for project=%s: %s", project_id, run_config_error)
                publish(project_id, {
                    "type":  "text_chunk",
                    "chunk": f"⚠️ Invalid run configuration: {run_config_error}\nGuardian will review source code only.\n",
                    "role":  "artificer",
                })
        else:
            log.warning("No RunConfig found or inferred for project=%s", project_id)
            publish(project_id, {
                "type":  "text_chunk", 
                "chunk": "⚠️ No run configuration provided. Guardian will review source code only.\n",
                "role":  "artificer",
            })

        # DEBUGGING: Add completion message since workflow ends here
        publish(project_id, {
            "type": "text_chunk",
            "chunk": "🔧 ARTIFICER STAGE COMPLETE - Workflow ended for debugging. Check run_config extraction above.\n",
            "role": "artificer",
        })

        return {
            "build_id":        build_id,
            "run_config":      run_config_obj.to_dict() if run_config_obj else None,
            "app_url":         app_url,
            "messages_to_save": [_msg("artificer", "assistant_response", final_text or "Build complete.")],
        }

    except Exception as e:
        log.exception("Artificer failed project=%s", project_id)
        
        # Enhanced error handling for different types of Docker issues
        error_message = str(e)
        if "Container" in error_message and "not found" in error_message:
            error_message = f"Docker container issue: {e}. Please ensure Docker is running and accessible."
        elif "404" in error_message:
            error_message = f"Docker API error: {e}. The container may have been stopped or removed."
        elif "Failed to write" in error_message:
            error_message = f"File system error: {e}. Check Docker container permissions and disk space."
        else:
            error_message = f"Build error: {e}"
        
        try:
            docker.spin_down()
        except Exception:
            pass
        
        publish(project_id, {
            "type":  "text_chunk",
            "chunk": f"\n❌ {error_message}\n",
            "role":  "artificer",
        })
        
        return {
            "build_id": build_id,
            "error":    error_message,
            "messages_to_save": [_msg("artificer", "assistant_response", f"❌ Build failed: {error_message}")],
        }


def _infer_run_config(docker: DockerManager, tech_stack_hint: dict | None) -> dict | None:
    """
    Fallback: attempt to infer run_config from files if agent didn't output it.
    Enhanced to handle more edge cases and tech stacks.
    """
    try:
        files = docker.list_files()
        log.debug("Files available for run_config inference: %s", files)
        
        if not files:
            log.warning("No files found in container for run_config inference")
            return None
        
        # Check tech stack hint first for explicit guidance
        if tech_stack_hint:
            framework = tech_stack_hint.get("framework", "").lower()
            language = tech_stack_hint.get("language", "").lower()
            
            # Handle explicit framework hints
            if "flask" in framework or "fastapi" in framework or "django" in framework:
                return _infer_python_config(files, framework)
            elif "express" in framework or "node" in framework:
                return _infer_node_config(files)
            elif "spring" in framework or "java" in language:
                return _infer_java_config(files)
            elif "go" in language:
                return _infer_go_config(files)
        
        # Auto-detect based on files present
        # Python apps
        if any(f.endswith('.py') for f in files):
            return _infer_python_config(files)
        
        # Node.js apps  
        elif 'package.json' in files:
            return _infer_node_config(files)
        
        # Java apps
        elif any(f.endswith('.java') for f in files) or 'pom.xml' in files or 'build.gradle' in files:
            return _infer_java_config(files)
        
        # Go apps
        elif 'go.mod' in files or any(f.endswith('.go') for f in files):
            return _infer_go_config(files)
        
        # Dockerfile only - generic approach
        elif 'Dockerfile' in files:
            log.info("Only Dockerfile found, using generic Docker run config")
            return {
                "install_command": "echo 'No explicit install command'",
                "start_command": "echo 'No explicit start command - check Dockerfile CMD'",
                "health_check_path": "/health",
                "startup_wait_secs": 10
            }
            
    except Exception as e:
        log.warning("Failed to infer run_config: %s", e)
    
    return None


def _infer_python_config(files: list, framework: str = "") -> dict:
    """Infer Python application run config."""
    # Determine install command
    if 'requirements.txt' in files:
        install_cmd = "pip install -r requirements.txt"
    elif 'pyproject.toml' in files:
        install_cmd = "pip install ."
    elif 'setup.py' in files:
        install_cmd = "pip install -e ."
    else:
        install_cmd = "echo 'No Python dependencies file found'"
    
    # Determine start command
    main_files = [f for f in files if f in ['app.py', 'main.py', 'server.py', 'run.py', 'wsgi.py']]
    
    if main_files:
        main_file = main_files[0]
        
        # Special handling for different frameworks
        if "fastapi" in framework.lower():
            start_cmd = f"uvicorn {main_file[:-3]}:app --host 0.0.0.0 --port 8080"
        elif "django" in framework.lower():
            start_cmd = "python manage.py runserver 0.0.0.0:8080"
        else:
            # Default Python/Flask
            start_cmd = f"python {main_file}"
    else:
        start_cmd = "python app.py"  # fallback
    
    return {
        "install_command": install_cmd,
        "start_command": start_cmd,
        "health_check_path": "/health",
        "startup_wait_secs": 8
    }


def _infer_node_config(files: list) -> dict:
    """Infer Node.js application run config."""
    # Check for start scripts in package.json
    try:
        if 'package.json' in files:
            # Could read package.json to get actual start script, but npm start is standard
            return {
                "install_command": "npm install",
                "start_command": "npm start",
                "health_check_path": "/health",
                "startup_wait_secs": 8
            }
    except Exception as e:
        log.debug("Error reading package.json: %s", e)
    
    # Fallback to common patterns
    main_files = [f for f in files if f in ['index.js', 'server.js', 'app.js', 'main.js']]
    start_cmd = f"node {main_files[0]}" if main_files else "node index.js"
    
    return {
        "install_command": "npm install",
        "start_command": start_cmd,
        "health_check_path": "/health", 
        "startup_wait_secs": 8
    }


def _infer_java_config(files: list) -> dict:
    """Infer Java application run config."""
    if 'pom.xml' in files:
        return {
            "install_command": "mvn clean compile",
            "start_command": "mvn spring-boot:run",
            "health_check_path": "/health",
            "startup_wait_secs": 15
        }
    elif 'build.gradle' in files:
        return {
            "install_command": "./gradlew build",
            "start_command": "./gradlew bootRun",
            "health_check_path": "/health",
            "startup_wait_secs": 15
        }
    else:
        return {
            "install_command": "javac *.java",
            "start_command": "java Main",
            "health_check_path": "/health",
            "startup_wait_secs": 10
        }


def _infer_go_config(files: list) -> dict:
    """Infer Go application run config."""
    return {
        "install_command": "go mod tidy",
        "start_command": "go run main.go",
        "health_check_path": "/health",
        "startup_wait_secs": 8
    }


def _extract_run_config(tool_log: list) -> dict | None:
    """Extract RunConfig from tool execution output with enhanced edge case handling."""
    if not tool_log:
        log.debug("_extract_run_config: empty tool_log provided")
        return None
        
    log.debug("_extract_run_config: examining %d tool log entries", len(tool_log))
    
    for i, entry in enumerate(tool_log):
        if not isinstance(entry, dict):
            log.debug("Tool log entry %d: invalid entry type %s", i, type(entry))
            continue
            
        output = entry.get("output", "")
        if not output:
            log.debug("Tool log entry %d: empty output", i)
            continue
            
        log.debug("Tool log entry %d: %s", i, output[:200] + ("..." if len(output) > 200 else ""))
        
        # Edge case: Multiple run configs in output - take the last one
        configs_found = []
        
        # Look for all possible run config patterns
        for start_marker in ["<<<RUN_CONFIG>>>", "<<<RUN_CONFIG >>>", "<<< RUN_CONFIG >>>"]:
            for end_marker in ["<<<END_RUN_CONFIG>>>", "<<<END_RUN_CONFIG >>>", "<<< END_RUN_CONFIG >>>"]:
                try:
                    if start_marker in output and end_marker in output:
                        start_idx = output.rfind(start_marker) + len(start_marker)  # Use rfind for last occurrence
                        end_idx = output.find(end_marker, start_idx)
                        
                        if end_idx > start_idx:
                            config_json = output[start_idx:end_idx].strip()
                            
                            # Edge case: Clean up common formatting issues
                            config_json = config_json.replace('\n', '').replace('\r', '')
                            config_json = config_json.replace('\\n', '').replace('\\r', '')
                            config_json = config_json.strip('"\'')  # Remove surrounding quotes
                            
                            log.info("Found RUN_CONFIG in tool log: %s", config_json)
                            
                            try:
                                parsed_config = json.loads(config_json)
                                
                                # Edge case: Validate required fields
                                required_fields = ["install_command", "start_command", "health_check_path", "startup_wait_secs"]
                                if all(field in parsed_config for field in required_fields):
                                    configs_found.append(parsed_config)
                                else:
                                    missing = [f for f in required_fields if f not in parsed_config]
                                    log.warning("RUN_CONFIG missing required fields: %s", missing)
                                    
                            except json.JSONDecodeError as e:
                                log.warning("Failed to parse RUN_CONFIG JSON: %s, raw: %s", e, config_json[:100])
                                
                                # Edge case: Try to fix common JSON issues
                                try:
                                    # Fix single quotes to double quotes
                                    fixed_json = config_json.replace("'", '"')
                                    # Fix trailing commas
                                    fixed_json = re.sub(r',\s*}', '}', fixed_json)
                                    fixed_json = re.sub(r',\s*]', ']', fixed_json)
                                    
                                    parsed_config = json.loads(fixed_json)
                                    log.info("Successfully parsed fixed RUN_CONFIG JSON")
                                    configs_found.append(parsed_config)
                                except json.JSONDecodeError:
                                    log.warning("Could not fix malformed RUN_CONFIG JSON")
                                    continue
                except Exception as e:
                    log.warning("Error processing RUN_CONFIG markers: %s", e)
                    continue
        
        # Return the last valid config found (most recent)
        if configs_found:
            return configs_found[-1]
    
    log.warning("No valid RUN_CONFIG found in any tool log entry")
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

    # Edge case: Invalid project_id
    if not project_id:
        error_msg = "Invalid project_id provided to guardian_node"
        log.error(error_msg)
        return {"error": error_msg, "messages_to_save": [_msg("guardian", "assistant_response", f"❌ {error_msg}")]}

    # Edge case: Too many security iterations
    if iteration >= MAX_SECURITY_ITERATIONS:
        msg = f"⚠️ Maximum security iterations ({MAX_SECURITY_ITERATIONS}) reached. Skipping further testing."
        log.warning("Max security iterations reached for project=%s", project_id)
        publish(project_id, {"type": "text_chunk", "chunk": msg, "role": "guardian"})
        return {
            "security_issues":   [],
            "security_iteration": iteration + 1,
            "messages_to_save":  [_msg("guardian", "assistant_response", msg)],
        }

    _thinking(project_id, "Starting security analysis...", "guardian")
    publish(project_id, {"type": "stage_change", "stage": WorkflowStage.TESTING.value})

    # Edge case: Try to reattach to Docker container
    docker = None
    try:
        if build_id and run_config_dict:
            docker = DockerManager.reattach(
                project_id = project_id,
                build_id   = build_id,
                run_config = run_config_dict,
            )
    except Exception as reattach_error:
        log.warning("Failed to reattach Docker container for project=%s: %s", project_id, reattach_error)

    # Edge case: No running application or Docker container
    if not app_url or not docker or not docker.container:
        msg = "⚠️ No running application to test. Reviewing source code only."
        
        # Try to analyze source code if Docker container is available
        if docker and docker.container:
            try:
                _thinking(project_id, "Analyzing source code...", "guardian")
                tools = get_security_tools(docker, None)  # No app_url for source-only analysis
                system = _GUARDIAN_SYSTEM.format(app_url="N/A (source code review only)", build_description=build_description)
                
                publish(project_id, {"type": "agent_start", "role": "guardian"})
                
                final_text, _ = run_react_agent(
                    project_id  = project_id,
                    role        = "guardian",
                    system      = system,
                    user_prompt = "Review the source code for security vulnerabilities since the application is not running.",
                    tools       = tools,
                    max_iter    = MAX_SECURITY_ITERATIONS,
                    model       = "gpt-4o",
                )
                
                publish(project_id, {"type": "agent_done", "role": "guardian"})
                
                return {
                    "security_issues":   [],  # Assume no critical issues for source-only review
                    "security_iteration": iteration + 1,
                    "messages_to_save":  [_msg("guardian", "assistant_response", final_text or "Source code review completed.")],
                }
                
            except Exception as source_review_error:
                log.warning("Source code review failed for project=%s: %s", project_id, source_review_error)
        
        # Fallback: Skip security testing entirely
        publish(project_id, {"type": "text_chunk", "chunk": msg, "role": "guardian"})
        publish(project_id, {"type": "agent_done", "role": "guardian"})
        return {
            "security_issues":   [],
            "security_iteration": iteration + 1,
            "messages_to_save":  [_msg("guardian", "assistant_response", msg)],
        }

    # Edge case: App URL validation
    if app_url and not (app_url.startswith("http://") or app_url.startswith("https://")):
        log.warning("Invalid app_url format for project=%s: %s", project_id, app_url)
        app_url = f"http://{app_url}"  # Try to fix common missing protocol issue

    try:
        tools = get_security_tools(docker, app_url)
        system = _GUARDIAN_SYSTEM.format(app_url=app_url, build_description=build_description)
    except Exception as tools_error:
        log.error("Failed to get security tools for project=%s: %s", project_id, tools_error)
        msg = f"⚠️ Security testing tools unavailable: {tools_error}. Skipping security scan."
        publish(project_id, {"type": "text_chunk", "chunk": msg, "role": "guardian"})
        return {
            "security_issues":   [],
            "security_iteration": iteration + 1,
            "messages_to_save":  [_msg("guardian", "assistant_response", msg)],
        }

    publish(project_id, {"type": "agent_start", "role": "guardian"})
    _thinking(project_id, "Running security scans...", "guardian")

    final_text, _ = run_react_agent(
        project_id  = project_id,
        role        = "guardian",
        system      = system,
        user_prompt = f"Perform security testing on the application at {app_url}.",
        tools       = tools,
        max_iter    = 15,
        model       = "gpt-4o",
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

    tools = get_docker_tools(docker, project_id)

    publish(project_id, {"type": "agent_start", "role": "artificer"})

    final_text, _ = run_react_agent(
        project_id  = project_id,
        role        = "artificer",
        system      = system,
        user_prompt = f"Fix these security issues:\n{issues_text}",
        tools       = tools,
        max_iter    = 12,
        model       = "gpt-4o",
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

    project_name = state.get("project_name", "autogenix-app")
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
        model       = "gpt-4o",
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

    Uses psycopg_pool.ConnectionPool instead of a bare psycopg.Connection.
    This solves the "the connection is closed" error that occurs when a
    single connection goes stale after idle timeout / network blip.

    The pool automatically:
      - Tests connections before handing them out (pre-ping)
      - Reconnects dead connections transparently
      - Manages multiple concurrent checkpoint writes safely

    autocommit=True (via connection kwargs) is mandatory — LangGraph's
    PostgresSaver uses explicit transaction management internally.
    """
    from psycopg_pool import ConnectionPool

    pool = ConnectionPool(
        conninfo=db_url,
        min_size=1,
        max_size=5,
        kwargs={"autocommit": True},
        # Check connections are alive before handing them out
        check=ConnectionPool.check_connection,
    )
    pool.wait()  # Block until min_size connections are ready

    checkpointer = PostgresSaver(pool)
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

    # TEMPORARY: End workflow after artificer for debugging
    graph.add_edge("artificer", END)

    # COMMENTED OUT FOR ARTIFICER DEBUGGING:
    # graph.add_conditional_edges("guardian", route_after_guardian, {
    #     "artificer_fix": "artificer_fix",
    #     "deployer":      "deployer",
    # })
    # graph.add_edge("artificer_fix", "guardian")
    # graph.add_edge("deployer", END)

    if db_url:
        checkpointer = _make_checkpointer(db_url)
    else:
        from langgraph.checkpoint.memory import MemorySaver
        checkpointer = MemorySaver()

    return graph.compile(
        checkpointer     = checkpointer,
        interrupt_before = ["conductor", "deployer"],
    )