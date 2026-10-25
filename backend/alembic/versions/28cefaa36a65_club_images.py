"""club images

Revision ID: 28cefaa36a65
Revises: b78b842f9f0c
Create Date: 2026-10-25 20:15:59.244313

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '28cefaa36a65'
down_revision: str | Sequence[str] | None = 'b78b842f9f0c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "club_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("title_en", sa.String(200), nullable=True),
        sa.Column("url", sa.String(500), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("club_images")
