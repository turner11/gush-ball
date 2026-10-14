"""merge heads

Revision ID: e40ec526b6b0
Revises: 46b98a402a84, 97e0ec7c1837
Create Date: 2026-09-30 19:22:26.460082

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'e40ec526b6b0'
down_revision: str | Sequence[str] | None = ('46b98a402a84', '97e0ec7c1837')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge-only revision: no schema change."""


def downgrade() -> None:
    """Merge-only revision: no schema change."""
