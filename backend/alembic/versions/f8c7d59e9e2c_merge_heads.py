"""merge heads

Revision ID: f8c7d59e9e2c
Revises: c3d5e7f9a1b2, d3e5f7a9b1c2
Create Date: 2026-09-29 14:13:29.200535

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'f8c7d59e9e2c'
down_revision: str | Sequence[str] | None = ('c3d5e7f9a1b2', 'd3e5f7a9b1c2')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge-only revision: no schema change."""


def downgrade() -> None:
    """Merge-only revision: no schema change."""
