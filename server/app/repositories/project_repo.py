from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, update, func
import uuid
from typing import List, Optional
from app.models.project import Project

# A project still called this (or an older auto name) gets renamed by the Conductor
PLACEHOLDER_PROJECT_NAME = "New project"


def is_placeholder_name(name: str | None) -> bool:
    n = (name or "").strip()
    return not n or n in (PLACEHOLDER_PROJECT_NAME, "Untitled Project") or n.startswith("Project for:")


class ProjectRepo:
    """
    Repository pattern for Project entity.
    Handles all database operations for projects.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
        user_prompt: str | None = None
    ) -> Project:
        """
        Create a new project.
        """
        
        # No model call here: FastAPI never runs agents (AGENTS.md §5). The
        # Conductor gives the project a short title in the worker on its first
        # turn, replacing this placeholder.
        if not name:
            name = PLACEHOLDER_PROJECT_NAME
        if not description and user_prompt:
            description = user_prompt

        # Ensure we always have a description
        if not description:
            description = user_prompt or "No description provided"

        project = Project(
            user_id=user_id,
            name=name,
            description=description,
            status="active"
        )
        
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def get_by_id(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> Optional[Project]:
        """
        Get a project by ID for a specific user.
        Excludes deleted projects.
        """
        result = await self.db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.status != "deleted"
            )
        )
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: uuid.UUID,
        page: int = 1,
        limit: int = 10
    ) -> tuple[List[Project], int]:
        """
        Get all projects for a user with pagination.
        Returns (projects, total_count).
        Excludes deleted projects.
        """
        from sqlalchemy import func
        
        # Get total count
        count_query = select(func.count()).select_from(Project).filter(
            Project.user_id == user_id,
            Project.status != "deleted"
        )
        count_result = await self.db.execute(count_query)
        total_count = count_result.scalar()
        
        # Get projects with pagination
        offset = (page - 1) * limit
        query = (
            select(Project)
            .filter(
                Project.user_id == user_id,
                Project.status != "deleted"
            )
            .order_by(desc(Project.created_at))
            .offset(offset)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        projects = list(result.scalars().all())

        activity = await self._activity_for([p.id for p in projects])
        for p in projects:
            # Transient attribute read by ProjectResponse (from_attributes)
            p.activity = "deployed" if p.latest_deploy_url else activity.get(p.id)

        return projects, total_count

    async def _activity_for(self, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
        """
        What each project is doing now, for the sidebar dot:
          awaiting_deploy — a deploy card is waiting for the user
          building        — the latest build is running (started < 2 h ago;
                            older "building" rows are crashed workers, not work)
        Deployed is decided by the caller from latest_deploy_url.
        """
        if not project_ids:
            return {}
        from datetime import datetime, timedelta, timezone
        from app.models.artifact import Artifact
        from app.models.build import Build

        pending = await self.db.execute(
            select(Artifact.project_id).distinct().where(
                Artifact.project_id.in_(project_ids),
                Artifact.artifact_type.in_(("env_var_request", "connect_railway")),
                Artifact.content["status"].astext == "pending",
            )
        )
        out: dict[uuid.UUID, str] = {pid: "awaiting_deploy" for pid in pending.scalars().all()}

        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        latest = await self.db.execute(
            select(Build.project_id, Build.status, Build.started_at)
            .where(Build.project_id.in_(project_ids))
            .order_by(Build.project_id, desc(Build.created_at))
            .distinct(Build.project_id)
        )
        for pid, status, started_at in latest.all():
            if pid not in out and status == "building" and started_at and started_at > cutoff:
                out[pid] = "building"
        return out

    async def update(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        **fields
    ) -> Optional[Project]:
        """
        Update project fields.
        Returns updated project or None if not found.
        """
        await self.db.execute(
            update(Project)
            .where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.status != "deleted"
            )
            .values(**fields)
        )
        await self.db.flush()
        return await self.get_by_id(project_id, user_id)

    async def soft_delete(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> bool:
        """
        Soft delete a project by setting status to 'deleted'.
        Returns True if successful, False otherwise.
        """
        result = await self.db.execute(
            update(Project)
            .where(
                Project.id == project_id,
                Project.user_id == user_id
            )
            .values(status="deleted")
        )
        await self.db.flush()
        return result.rowcount > 0