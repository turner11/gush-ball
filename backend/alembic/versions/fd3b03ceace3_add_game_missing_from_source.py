"""add game missing_from_source

Revision ID: fd3b03ceace3
Revises: 6faadebc9730
Create Date: 2026-11-03 18:45:39.509977

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fd3b03ceace3'
down_revision: str | Sequence[str] | None = '6faadebc9730'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "games", sa.Column("missing_from_source", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("games", "missing_from_source")
