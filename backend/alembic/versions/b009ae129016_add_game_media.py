"""add game media

Revision ID: b009ae129016
Revises: 5ae66f20d9db
Create Date: 2026-10-21 17:27:11.253994

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b009ae129016'
down_revision: str | Sequence[str] | None = '5ae66f20d9db'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    for column in ("videos", "images"):
        op.add_column("games", sa.Column(column, sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    for column in ("images", "videos"):
        op.drop_column("games", column)
