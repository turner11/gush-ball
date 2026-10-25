"""club posts and post sort order

Revision ID: b78b842f9f0c
Revises: 7ea09cc86864
Create Date: 2026-10-25 10:11:52.059426

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b78b842f9f0c'
down_revision: str | Sequence[str] | None = '7ea09cc86864'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("team_posts", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.create_table(
        "club_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("title_en", sa.String(200), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("body_en", sa.Text(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("club_posts")
    op.drop_column("team_posts", "sort_order")
