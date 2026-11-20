"""add game video urls

Revision ID: b93343e6a7be
Revises: 695e6d33ee57
Create Date: 2026-11-20 11:50:16.576592

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b93343e6a7be"
down_revision: str | Sequence[str] | None = "695e6d33ee57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("games", sa.Column("video_urls", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("games", "video_urls")
