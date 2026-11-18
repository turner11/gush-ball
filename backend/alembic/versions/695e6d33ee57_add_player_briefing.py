"""add player briefing

Revision ID: 695e6d33ee57
Revises: 9883ba441e46
Create Date: 2026-11-18 18:22:58.017454

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "695e6d33ee57"
down_revision: str | Sequence[str] | None = "9883ba441e46"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("players", sa.Column("briefing", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("players", "briefing")
