"""add standing_rows source_url

Revision ID: b2c4d6e8f0a1
Revises: a1f3c9d2e4b7
Create Date: 2026-09-29 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2c4d6e8f0a1'
down_revision: str | Sequence[str] | None = 'a1f3c9d2e4b7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('standing_rows', sa.Column('source_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('standing_rows', 'source_url')
