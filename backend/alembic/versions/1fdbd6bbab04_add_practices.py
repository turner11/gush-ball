"""add practices

Revision ID: 1fdbd6bbab04
Revises: fb48cee40a53
Create Date: 2026-10-21 11:25:03.731297

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1fdbd6bbab04'
down_revision: str | Sequence[str] | None = 'fb48cee40a53'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "practices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_practices_team_id", "practices", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_practices_team_id", table_name="practices")
    op.drop_table("practices")
