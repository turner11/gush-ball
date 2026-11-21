"""add video_clips is_player_highlight

Revision ID: c7da18596389
Revises: 325a6f41011d
Create Date: 2026-11-21 21:18:01.610417

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7da18596389'
down_revision: str | Sequence[str] | None = '325a6f41011d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('video_clips', sa.Column('is_player_highlight', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('video_clips', 'is_player_highlight')
