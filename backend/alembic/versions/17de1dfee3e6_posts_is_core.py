"""posts is_core

Revision ID: 17de1dfee3e6
Revises: 294638307c02
Create Date: 2026-10-31 22:12:00.280504

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '17de1dfee3e6'
down_revision: str | Sequence[str] | None = '294638307c02'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ('team_posts', 'club_posts'):
        op.add_column(table, sa.Column('is_core', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('team_posts', 'club_posts'):
        op.drop_column(table, 'is_core')
