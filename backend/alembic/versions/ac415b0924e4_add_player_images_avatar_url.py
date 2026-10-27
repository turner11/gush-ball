"""add player_images.avatar_url

Revision ID: ac415b0924e4
Revises: b10ab3d448d0
Create Date: 2026-10-27 15:07:05.817878

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ac415b0924e4"
down_revision: str | Sequence[str] | None = "b10ab3d448d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("player_images", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("player_images", "avatar_url")
