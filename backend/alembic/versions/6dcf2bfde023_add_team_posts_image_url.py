"""add team_posts image_url

Revision ID: 6dcf2bfde023
Revises: 27e64f2e4053
Create Date: 2026-10-27 13:11:36.359789

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6dcf2bfde023'
down_revision: str | Sequence[str] | None = '27e64f2e4053'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("team_posts", sa.Column("image_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("team_posts", "image_url")
