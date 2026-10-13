"""add club to teams and admin_users

Revision ID: 1d8046c06869
Revises: 2df3a16da449
Create Date: 2026-10-13 12:19:20.269874

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1d8046c06869'
down_revision: str | Sequence[str] | None = '2df3a16da449'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("club", sa.String(length=120), nullable=True))
    op.add_column("admin_users", sa.Column("club", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("admin_users", "club")
    op.drop_column("teams", "club")
