"""add player source_url and deleted_at

Revision ID: b7e2d4a6c8f1
Revises: f8c7d59e9e2c
Create Date: 2026-09-29 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7e2d4a6c8f1'
down_revision: str | Sequence[str] | None = 'f8c7d59e9e2c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('players', sa.Column('source_url', sa.String(length=500), nullable=True))
    op.add_column('players', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('players', 'deleted_at')
    op.drop_column('players', 'source_url')
