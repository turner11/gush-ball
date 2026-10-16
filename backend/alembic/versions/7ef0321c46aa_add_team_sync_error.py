"""add team sync error

Revision ID: 7ef0321c46aa
Revises: ca5a76e9a707
Create Date: 2026-10-16 12:40:57.866108

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7ef0321c46aa'
down_revision: str | Sequence[str] | None = 'ca5a76e9a707'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("sync_error", sa.Text(), nullable=True))
    op.add_column("teams", sa.Column("sync_error_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "sync_error_at")
    op.drop_column("teams", "sync_error")
