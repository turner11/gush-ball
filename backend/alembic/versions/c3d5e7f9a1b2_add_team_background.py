"""add team background

Revision ID: c3d5e7f9a1b2
Revises: b2c4d6e8f0a1
Create Date: 2026-09-29 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d5e7f9a1b2'
down_revision: str | Sequence[str] | None = 'b2c4d6e8f0a1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'teams',
        sa.Column('background', sa.String(length=20), nullable=False, server_default='hoop-1'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('teams', 'background')
