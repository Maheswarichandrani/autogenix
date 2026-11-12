from sqlalchemy import Integer, String, Text, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime
import uuid

from app.core.database import Base


class Build(Base):
    __tablename__ = "builds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    build_number: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # planning|waiting_approval|approved|building|security_testing|fixing|deploying|completed|failed
    status: Mapped[str] = mapped_column(String, default="planning")
    
    approved_plan: Mapped[dict] = mapped_column(JSONB, nullable=True)
    
    # Outcome
    deploy_url: Mapped[str] = mapped_column(String, nullable=True)
    repo_url: Mapped[str] = mapped_column(String, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    progress: Mapped[dict] = mapped_column(JSONB, nullable=True, default=dict)

    # Holds run_config for cross-node reattach. "metadata" is reserved by
    # SQLAlchemy Declarative, so the attribute is metadata_ (like Message).
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=True)

    # Timing
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (UniqueConstraint("project_id", "build_number"),)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="builds")
    artifacts: Mapped[list["Artifact"]] = relationship("Artifact", back_populates="build")
