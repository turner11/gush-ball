"""clear scraped opponent addresses so the next sync re-fetches the venue (#151)

Revision ID: 97e0ec7c1837
Revises: e4a9115138c6
Create Date: 2026-09-30 14:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '97e0ec7c1837'
down_revision: str | Sequence[str] | None = 'e4a9115138c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Opponent.address is scrape-only (no admin edit path); NULL = fill-only sync re-fetches it.
    op.execute("UPDATE opponents SET address = NULL")


def downgrade() -> None:
    """Downgrade schema."""
