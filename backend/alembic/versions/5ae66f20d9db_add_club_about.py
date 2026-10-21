"""add club about

Revision ID: 5ae66f20d9db
Revises: 57bc111cc78a
Create Date: 2026-10-21 15:40:36.257730

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5ae66f20d9db'
down_revision: str | Sequence[str] | None = '57bc111cc78a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("about_title", sa.String(200), nullable=True))
    op.add_column("clubs", sa.Column("about_title_en", sa.String(200), nullable=True))
    op.add_column("clubs", sa.Column("about", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("about_en", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("about_images", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("clubs", sa.Column("about_links", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    for column in ("about_links", "about_images", "about_en", "about", "about_title_en", "about_title"):
        op.drop_column("clubs", column)
