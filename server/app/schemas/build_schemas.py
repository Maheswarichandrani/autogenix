from .base import BModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID


class BuildSummaryResponse(BModel):
    """Schema for build list items (lightweight)."""
    id: UUID
    build_number: int
    status: str
    deploy_url: Optional[str] = None
    repo_url: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BuildDetailResponse(BModel):
    """Schema for full build detail."""
    id: UUID
    build_number: int
    status: str

    # Plans
    approved_plan: Optional[dict] = None

    # Outcome
    deploy_url: Optional[str] = None
    repo_url: Optional[str] = None
    error_message: Optional[str] = None
    progress: Optional[dict] = None

    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BuildListResponse(BModel):
    """Schema for build list response."""
    builds: List[BuildSummaryResponse]
