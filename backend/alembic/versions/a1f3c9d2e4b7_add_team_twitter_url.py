"""add team twitter_url

Revision ID: a1f3c9d2e4b7
Revises: 72934e3e707e
Create Date: 2026-09-28 23:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d2e4b7'
down_revision: str | Sequence[str] | None = '72934e3e707e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('teams', sa.Column('twitter_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('teams', 'twitter_url')
