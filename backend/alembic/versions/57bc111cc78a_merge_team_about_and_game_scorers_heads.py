"""merge team about and game scorers heads

Revision ID: 57bc111cc78a
Revises: 8498ff9fa6c7, cc375f01b537
Create Date: 2026-10-21 15:26:44.822132

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '57bc111cc78a'
down_revision: str | Sequence[str] | None = ('8498ff9fa6c7', 'cc375f01b537')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
