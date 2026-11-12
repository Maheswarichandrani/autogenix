from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime
import uuid

from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    stack: Mapped[dict] = mapped_column(JSONB, nullable=True)
    repo_url: Mapped[str] = mapped_column(String, nullable=True)
    latest_deploy_url: Mapped[str] = mapped_column(String, nullable=True)
    
    # LangGraph thread_id — one persistent thread per project
    langgraph_thread_id: Mapped[str] = mapped_column(String, nullable=True, unique=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="projects")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="project", order_by="Message.created_at")
    builds: Mapped[list["Build"]] = relationship("Build", back_populates="project")
    artifacts: Mapped[list["Artifact"]] = relationship("Artifact", back_populates="project")
    env_vars: Mapped[list["ProjectEnvVar"]] = relationship("ProjectEnvVar", back_populates="project")
    files: Mapped[list["ProjectFile"]] = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan", passive_deletes=True)