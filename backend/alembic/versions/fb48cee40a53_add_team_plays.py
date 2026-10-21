"""add team_plays

Revision ID: fb48cee40a53
Revises: 7ef0321c46aa
Create Date: 2026-10-21 10:15:40.361853

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fb48cee40a53'
down_revision: str | Sequence[str] | None = '7ef0321c46aa'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_plays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("title_en", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.CheckConstraint("(file_url IS NULL) <> (url IS NULL)", name="ck_team_plays_one_source"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("team_plays")
