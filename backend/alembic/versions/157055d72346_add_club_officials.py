"""add club officials

Revision ID: 157055d72346
Revises: b009ae129016
Create Date: 2026-10-22

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '157055d72346'
down_revision: str | Sequence[str] | None = 'b009ae129016'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("officials", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("clubs", "officials")
