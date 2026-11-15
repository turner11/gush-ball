"""add game briefing

Revision ID: 494ef249551d
Revises: 6ad3ef5aaf44
Create Date: 2026-11-15 15:12:56.788326

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '494ef249551d'
down_revision: str | Sequence[str] | None = '6ad3ef5aaf44'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("games", sa.Column("briefing", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("games", "briefing")
