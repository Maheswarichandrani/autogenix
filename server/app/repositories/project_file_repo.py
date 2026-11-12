"""
repositories/project_file_repo.py

Durable copy of the files the agents write (see models/project_file.py).

- Sync functions are for the Celery worker, which uses psycopg sessions.
- ProjectFileRepo (async) is for the API.
"""
import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.models.project_file import ProjectFile

log = logging.getLogger(__name__)

# Larger files (e.g. a generated lockfile or a data dump) are not stored.
MAX_STORED_FILE_BYTES = 1_000_000


def normalise_path(path: str) -> str:
    """Same relative path the code panel shows: no leading ./ or /workspace/."""
    p = path.strip().replace("\\", "/")
    for prefix in ("/workspace/", "./"):
        if p.startswith(prefix):
            p = p[len(prefix):]
    return p.lstrip("/")


# ── Sync (worker) ─────────────────────────────────────────────────

def upsert_file(db: Session, project_id: str, path: str, content: str) -> bool:
    """Insert or replace one file. Returns False when skipped for size."""
    size = len(content.encode("utf-8"))
    if size > MAX_STORED_FILE_BYTES:
        log.warning("Not storing %s for project=%s: %d bytes is over the cap", path, project_id, size)
        return False
    stmt = insert(ProjectFile).values(
        id=uuid.uuid4(), project_id=project_id, path=normalise_path(path), content=content, size=size,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_project_files_project_path",
        set_={"content": stmt.excluded.content, "size": stmt.excluded.size, "updated_at": func.now()},
    )
    db.execute(stmt)
    db.commit()
    return True


def delete_file(db: Session, project_id: str, path: str) -> None:
    db.execute(
        delete(ProjectFile).where(
            ProjectFile.project_id == project_id, ProjectFile.path == normalise_path(path),
        )
    )
    db.commit()


def paths_for_project(db: Session, project_id: str) -> list[str]:
    """Just the saved file paths of a project, sorted."""
    return list(db.execute(
        select(ProjectFile.path).where(ProjectFile.project_id == project_id).order_by(ProjectFile.path)
    ).scalars().all())


def files_for_project(db: Session, project_id: str) -> dict[str, str]:
    """Every saved file of a project as {path: content}, used to restore a sandbox."""
    rows = db.execute(
        select(ProjectFile.path, ProjectFile.content).where(ProjectFile.project_id == project_id)
    ).all()
    return {path: content for path, content in rows}


# ── Async (API) ───────────────────────────────────────────────────

class ProjectFileRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_project(self, project_id: uuid.UUID) -> list[ProjectFile]:
        """Caller must have checked project ownership already."""
        result = await self.db.execute(
            select(ProjectFile).where(ProjectFile.project_id == project_id).order_by(ProjectFile.path)
        )
        return list(result.scalars().all())
