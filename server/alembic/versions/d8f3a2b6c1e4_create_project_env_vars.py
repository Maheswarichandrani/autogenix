"""Create project_env_vars and require project_files.updated_at

Revision ID: d8f3a2b6c1e4
Revises: c7d2e4f1a9b3
Create Date: 2026-11-12

Revision 2caeebd5e2df ("Added env table") was generated empty, so the
migrations never created project_env_vars. Existing databases got the table
from the create_all call the API used to run at startup. This creates it only
when it is missing, so it is safe on both a fresh and an existing database.

c7d2e4f1a9b3 also left project_files.updated_at nullable, unlike the model.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d8f3a2b6c1e4"
down_revision: Union[str, Sequence[str], None] = "c7d2e4f1a9b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("project_env_vars"):
        op.create_table(
            "project_env_vars",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "project_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column(
                "build_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("builds.id", ondelete="SET NULL"), nullable=True,
            ),
            sa.Column("encrypted_vars", postgresql.JSONB(), nullable=False),
            sa.Column("kdf_salt", sa.String(), nullable=False),
            sa.Column("deployed", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    op.execute("UPDATE project_files SET updated_at = now() WHERE updated_at IS NULL")
    op.alter_column(
        "project_files", "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_server_default=sa.text("now()"),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "project_files", "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_server_default=sa.text("now()"),
        nullable=True,
    )
    # Not dropped: on databases that predate this revision the table came from
    # create_all and holds real data, so downgrading must not delete it.
