"""add team_posts pinned

Revision ID: d172c8930a23
Revises: fb48cee40a53
Create Date: 2026-10-21 11:24:24.288982

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd172c8930a23'
down_revision: str | Sequence[str] | None = 'fb48cee40a53'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('team_posts', sa.Column('pinned', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('team_posts', 'pinned')
