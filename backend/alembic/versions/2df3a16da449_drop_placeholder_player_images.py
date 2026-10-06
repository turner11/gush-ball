"""drop placeholder player images

Revision ID: 2df3a16da449
Revises: f5ecfce52374
Create Date: 2026-10-06 08:51:20.499057

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '2df3a16da449'
down_revision: str | Sequence[str] | None = 'f5ecfce52374'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Placeholder silhouettes were stored as real images; the fill-only sync now refills these rows with real photos.
    op.execute("DELETE FROM player_images WHERE url LIKE '%player-no-image%'")


def downgrade() -> None:
    """Downgrade schema."""
