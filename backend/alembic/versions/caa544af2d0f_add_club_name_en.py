"""add club name_en

Revision ID: caa544af2d0f
Revises: 1a68b61dc9e0
Create Date: 2026-10-16 06:25:48.552305

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'caa544af2d0f'
down_revision: str | Sequence[str] | None = '1a68b61dc9e0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("name_en", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("clubs", "name_en")
