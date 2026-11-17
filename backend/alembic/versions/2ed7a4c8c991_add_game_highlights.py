"""add game highlights

Revision ID: 2ed7a4c8c991
Revises: 494ef249551d
Create Date: 2026-11-17 09:50:44.328732

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '2ed7a4c8c991'
down_revision: str | Sequence[str] | None = '494ef249551d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("games", sa.Column("highlights", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("games", "highlights")
