"""merge heads

Revision ID: 1e5d21076350
Revises: d9d2894f84f0, 623321597e65
Create Date: 2026-10-15 06:45:00.117145

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "1e5d21076350"
down_revision: str | Sequence[str] | None = ("d9d2894f84f0", "623321597e65")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge-only revision: no schema change."""


def downgrade() -> None:
    """Merge-only revision: no schema change."""
