"""add leagues

Revision ID: 9891935e3a17
Revises: 1e5d21076350
Create Date: 2026-10-15 08:56:33.380145

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9891935e3a17"
down_revision: str | Sequence[str] | None = "1e5d21076350"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "leagues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ibasketball_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ibasketball_id", name="uq_leagues_ibasketball_id"),
    )


def downgrade() -> None:
    op.drop_table("leagues")
