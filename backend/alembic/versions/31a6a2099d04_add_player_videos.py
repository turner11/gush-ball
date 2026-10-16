"""add player videos

Revision ID: 31a6a2099d04
Revises: caa544af2d0f
Create Date: 2026-10-16 09:08:54.073196

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '31a6a2099d04'
down_revision: str | Sequence[str] | None = 'caa544af2d0f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'player_videos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('player_id', sa.Integer(), sa.ForeignKey('players.id'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('title_en', sa.String(length=200), nullable=True),
        sa.Column('url', sa.String(length=500), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('player_videos')
