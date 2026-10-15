"""add player tags to team videos and images

Revision ID: e4f6a8b0c2d3
Revises: b7e2d4a6c8f1
Create Date: 2026-09-30 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e4f6a8b0c2d3'
down_revision: str | Sequence[str] | None = 'b7e2d4a6c8f1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ('team_videos', 'team_images'):
        op.add_column(table, sa.Column('player_ids', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('team_videos', 'team_images'):
        op.drop_column(table, 'player_ids')
