"""add game stats rows

Revision ID: f219ee7a9235
Revises: ac415b0924e4
Create Date: 2026-10-31 21:28:46.451011

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f219ee7a9235'
down_revision: str | Sequence[str] | None = 'ac415b0924e4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("games", sa.Column("stats_rows", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("games", "stats_rows")
