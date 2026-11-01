"""club_posts image_url

Revision ID: 294638307c02
Revises: ac415b0924e4
Create Date: 2026-10-31 21:37:39.150878

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '294638307c02'
down_revision: str | Sequence[str] | None = 'ac415b0924e4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("club_posts", sa.Column("image_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("club_posts", "image_url")
