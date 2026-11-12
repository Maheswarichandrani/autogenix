"""Add project_files (durable copy of agent-written files) and builds.metadata

Revision ID: c7d2e4f1a9b3
Revises: bf9af9f94147
Create Date: 2026-11-12 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c7d2e4f1a9b3"
down_revision: Union[str, Sequence[str], None] = "bf9af9f94147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "path", name="uq_project_files_project_path"),
    )
    op.create_index("ix_project_files_project_id", "project_files", ["project_id"])
    # Build.metadata_ (run_config). Neon already has this column (ISSUES_SPEC A4);
    # clean databases built from these migrations did not.
    op.add_column("builds", sa.Column("metadata", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("builds", "metadata")
    op.drop_index("ix_project_files_project_id", table_name="project_files")
    op.drop_table("project_files")
