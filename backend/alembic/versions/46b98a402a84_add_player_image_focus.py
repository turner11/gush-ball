"""add face focus to player images

Revision ID: 46b98a402a84
Revises: e4a9115138c6
Create Date: 2026-09-30 13:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '46b98a402a84'
down_revision: str | Sequence[str] | None = 'e4a9115138c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ('focus_x', 'focus_y', 'zoom')


def upgrade() -> None:
    """Upgrade schema."""
    for name in COLUMNS:
        op.add_column('player_images', sa.Column(name, sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for name in COLUMNS:
        op.drop_column('player_images', name)
