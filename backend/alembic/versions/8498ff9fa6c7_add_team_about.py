"""add team about

Revision ID: 8498ff9fa6c7
Revises: 9f3c3bb33cde
Create Date: 2026-10-21 12:56:44.025685

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8498ff9fa6c7'
down_revision: str | Sequence[str] | None = '9f3c3bb33cde'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('teams', sa.Column('about', sa.Text(), nullable=True))
    op.add_column('teams', sa.Column('about_en', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('teams', 'about_en')
    op.drop_column('teams', 'about')
