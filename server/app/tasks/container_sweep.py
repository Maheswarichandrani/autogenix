"""
Housekeeping for build sandboxes. Containers are disposable (the database holds
the code, see agents/sandbox.py), so idle ones are stopped and dead ones removed.

Only containers named build-<uuid> are ever touched; nothing else on the
machine (other projects' containers, Redis) is.
"""

from __future__ import annotations

import logging
import re
import uuid

import docker
import docker.errors
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.docker_manager import CONTAINER_PREFIX, _docker
from app.models.build import Build

log = logging.getLogger(__name__)

_NAME = re.compile(rf"^{CONTAINER_PREFIX}([0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}})$")


def _build_containers() -> list[tuple[str, "docker.models.containers.Container"]]:
    """(build_id, container) for every Autogenix build sandbox, running or not."""
    found = []
    for c in _docker().containers.list(all=True, filters={"name": CONTAINER_PREFIX}):
        m = _NAME.match(c.name)
        if m:
            found.append((m.group(1), c))
    return found


def stop_sandbox(build_id: str) -> None:
    """Stop (not remove) a build's sandbox, e.g. while it waits at the deploy card."""
    try:
        c = _docker().containers.get(f"{CONTAINER_PREFIX}{build_id}")
        if c.status == "running":
            c.stop(timeout=10)
            log.info("Stopped idle sandbox %s", c.name)
    except docker.errors.NotFound:
        pass
    except Exception:
        log.exception("Could not stop sandbox for build=%s", build_id)


def remove_superseded_sandboxes(db: Session, project_id: str, keep_build_id: str) -> int:
    """A new build replaces the project's older ones: remove their sandboxes."""
    older = db.execute(
        select(Build.id).where(Build.project_id == project_id, Build.id != uuid.UUID(keep_build_id))
    ).scalars().all()
    removed = 0
    for build_id in older:
        try:
            _docker().containers.get(f"{CONTAINER_PREFIX}{build_id}").remove(force=True)
            removed += 1
            log.info("Removed superseded sandbox build=%s project=%s", build_id, project_id)
        except docker.errors.NotFound:
            pass
        except Exception:
            log.exception("Could not remove superseded sandbox build=%s", build_id)
    return removed


def sweep_sandboxes(db: Session) -> dict[str, int]:
    """
    Run once when the worker starts (no build is mid-run then with --pool=solo):
    remove sandboxes with no Build row, stop the rest. A resumed build starts
    its sandbox again through ensure_sandbox().
    """
    stats = {"removed": 0, "stopped": 0}
    containers = _build_containers()
    if not containers:
        return stats

    ids = [uuid.UUID(b) for b, _ in containers]
    known = {str(i) for i in db.execute(select(Build.id).where(Build.id.in_(ids))).scalars().all()}

    for build_id, c in containers:
        try:
            if build_id not in known:
                c.remove(force=True)
                stats["removed"] += 1
                log.info("Sweep: removed orphan sandbox %s", c.name)
            elif c.status == "running":
                c.stop(timeout=10)
                stats["stopped"] += 1
                log.info("Sweep: stopped idle sandbox %s", c.name)
        except Exception:
            log.exception("Sweep: could not tidy %s", c.name)
    return stats
