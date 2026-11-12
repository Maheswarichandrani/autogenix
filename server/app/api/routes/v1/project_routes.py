from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.core.database import get_db
from app.schemas.project_schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse, ProjectFileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.project_repo import ProjectRepo
from app.repositories.build_repo import BuildRepo
from app.repositories.project_file_repo import ProjectFileRepo
from app.api.deps import get_current_user
from app.models.user import User
import uuid

from app.models.project import Project

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new project for the authenticated user.
    """
    project = await ProjectRepo(db).create(current_user.id, body.name, body.description , body.user_prompt)
    return project

@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> ProjectListResponse:
    """
    Get all projects for the current authenticated user with pagination.
    """
    projects, total = await ProjectRepo(db).list_by_user(current_user.id, page, limit)
    return ProjectListResponse(
        projects=projects,
        total=total,
        page=page,
        limit=limit
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Project:
    """
    Get a single project by ID for the authenticated user.
    """
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/files", response_model=list[ProjectFileResponse])
async def list_project_files(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Every file the agents wrote for this project (latest version of each).
    The code panel loads this on open, then applies live file events.
    """
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await ProjectFileRepo(db).list_for_project(project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update a project's fields for the authenticated user.
    """
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    updated = await ProjectRepo(db).update(project_id, current_user.id, **body.model_dump(exclude_none=True))
    return updated


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> None:
    """
    Soft delete a project (sets status to 'deleted') for the authenticated user.
    """
    deleted = await ProjectRepo(db).soft_delete(project_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")