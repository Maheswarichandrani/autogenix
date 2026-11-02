# app/core/stacks.py
"""
Stacks Autogenix can build, and how each one runs in the sandbox.

Add a stack here only after it passes a real test build. Image and resource
limits are hard values — never let agent or user input influence them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.core.config import settings

PreferredStack = Literal["fastapi", "flask", "django", "express", "springboot", "gin"]

DEFAULT_STACK: PreferredStack = "fastapi"


@dataclass(frozen=True)
class Stack:
    label:     str
    language:  str
    image:     str
    mem_limit: str = "512m"
    cpu_quota: int = 50_000   # 50% of one CPU


STACKS: dict[str, Stack] = {
    "fastapi":    Stack("FastAPI", "python", settings.DOCKER_BASE_IMAGE),
    "flask":      Stack("Flask", "python", settings.DOCKER_BASE_IMAGE),
    "django":     Stack("Django", "python", settings.DOCKER_BASE_IMAGE),
    "express":    Stack("Express", "javascript", "node:22-slim"),
    "gin":        Stack("Go + Gin", "go", "golang:1.24-bookworm"),
    "springboot": Stack(
        "Spring Boot", "java", "maven:3.9-eclipse-temurin-21",
        mem_limit="1536m", cpu_quota=100_000,
    ),
}

SUPPORTED_STACK_NAMES = ", ".join(stack.label for stack in STACKS.values())

_FRAMEWORK_ALIASES = {
    "fastapi":        "fastapi",
    "flask":          "flask",
    "django":         "django",
    "express":        "express",
    "expressjs":      "express",
    "node":           "express",
    "nodejs":         "express",
    "gin":            "gin",
    "gingonic":       "gin",
    "go":             "gin",
    "golang":         "gin",
    "gogin":          "gin",
    "spring":         "springboot",
    "springboot":     "springboot",
}

_LANGUAGE_ALIASES = {
    "javascript": "express",
    "js":         "express",
    "typescript": "express",
    "ts":         "express",
    "node":       "express",
    "nodejs":     "express",
    "go":         "gin",
    "golang":     "gin",
    "java":       "springboot",
}


def _normalise(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def stack_key(value: str | None) -> str:
    """Return a supported stack key, falling back to the default stack."""
    return value if value in STACKS else DEFAULT_STACK


def get_stack(value: str | None) -> Stack:
    return STACKS[stack_key(value)]


def resolve_tech_stack(
    tech_stack: dict | None,
    preferred_stack: str | None,
) -> tuple[dict | None, str | None]:
    """
    Merge what the user asked for in chat with their saved default.
    Returns (resolved stack, unsupported name). One of the two is None.
    """
    resolved  = dict(tech_stack or {})
    framework = _normalise(resolved.get("framework"))
    language  = _normalise(resolved.get("language"))
    saved     = stack_key(preferred_stack)

    if framework:
        key = _FRAMEWORK_ALIASES.get(framework)
        if key is None:
            return None, str(resolved["framework"])
    elif language in ("python", "py"):
        key = saved if STACKS[saved].language == "python" else DEFAULT_STACK
    elif language:
        key = _LANGUAGE_ALIASES.get(language)
        if key is None:
            return None, str(resolved["language"])
    else:
        key = saved

    resolved["framework"] = key
    resolved["language"]  = STACKS[key].language
    return resolved, None
