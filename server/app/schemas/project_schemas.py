from .base import BModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID


class ProjectCreate(BModel):
    """Schema for creating a new project."""
    name: str | None = None
    description: str | None = None
    user_prompt: str  # Make this required since we need it to generate name/description


class ProjectUpdate(BModel):
    """Schema for updating project fields."""
    name: str | None = None
    description: str | None = None
    status: str | None = None
    stack: dict | None = None
    repo_url: str | None = None
    latest_deploy_url: str | None = None


class ProjectFileResponse(BModel):
    """One stored file of the generated app, for the code panel."""
    path: str
    content: str
    size: int
    updated_at: Optional[datetime] = None


class ProjectResponse(BModel):
    """Schema for project response."""
    id: UUID
    name: str
    description: Optional[str] = None
    
    # Status and metadata
    status: str  # active, deleted, etc.
    stack: Optional[dict] = None
    
    # Git & Deployment
    repo_url: Optional[str] = None
    latest_deploy_url: Optional[str] = None
    
    # LangGraph integration
    langgraph_thread_id: Optional[str] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProjectListResponse(BModel):
    """Schema for paginated project list response."""
    projects: List[ProjectResponse]
    total: int
    page: int
    limit: int


class SendMessageResponse(BModel):
    """Schema for send message response."""
    user_message_id: UUID
    thread_id: str
    status: str
    stream_url: str
    
class DeployConfirmRequest(BModel):
    """
    User submits only their app environment variables.
    Platform credentials (GitHub token, Railway key) are fetched
    server-side from encrypted DB columns — never sent from browser.
    """
    plaintext_vars:  dict[str, str]   # user's app env vars (STRIPE_KEY, DATABASE_URL etc.)
    deploy_provider: str = "railway"  # "railway" (only supported provider currently)