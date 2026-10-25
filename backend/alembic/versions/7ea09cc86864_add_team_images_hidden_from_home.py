"""add team_images hidden_from_home

Revision ID: 7ea09cc86864
Revises: c54b463a01e6
Create Date: 2026-10-25 08:59:02.985319

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7ea09cc86864'
down_revision: str | Sequence[str] | None = 'c54b463a01e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('team_images', sa.Column('hidden_from_home', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('team_images', 'hidden_from_home')
