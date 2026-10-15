"""add lineup snapshots and game stats_url

Revision ID: d3e5f7a9b1c2
Revises: b2c4d6e8f0a1
Create Date: 2026-09-29 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd3e5f7a9b1c2'
down_revision: str | Sequence[str] | None = 'b2c4d6e8f0a1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('games', sa.Column('stats_url', sa.String(length=500), nullable=True))
    op.create_table(
        'lineup_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('game_id', sa.Integer(), nullable=False),
        sa.Column('players', sa.JSON(), nullable=False),
        sa.Column('elapsed', sa.Float(), nullable=False),
        sa.Column('offense_diff', sa.Integer(), nullable=False),
        sa.Column('defence_diff', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('lineup_snapshots')
    op.drop_column('games', 'stats_url')
