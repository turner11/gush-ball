"""add player birth date

Revision ID: 170a5b0740be
Revises: 31a6a2099d04
Create Date: 2026-10-16 09:49:09.433276

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "170a5b0740be"
down_revision: str | Sequence[str] | None = "31a6a2099d04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("players", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column(
        "players",
        sa.Column("birth_date_checked", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("players", "birth_date_checked")
    op.drop_column("players", "birth_date")
