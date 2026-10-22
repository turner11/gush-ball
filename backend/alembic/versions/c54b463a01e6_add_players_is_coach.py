"""add players is_coach

Revision ID: c54b463a01e6
Revises: 157055d72346
Create Date: 2026-10-22 16:12:44.917703

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c54b463a01e6'
down_revision: str | Sequence[str] | None = '157055d72346'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("players", sa.Column("is_coach", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("players", "is_coach")
