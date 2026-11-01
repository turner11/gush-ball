"""merge heads 17de1dfee3e6 and f219ee7a9235

Revision ID: 6faadebc9730
Revises: 17de1dfee3e6, f219ee7a9235
Create Date: 2026-11-01 05:58:40.919785

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '6faadebc9730'
down_revision: str | Sequence[str] | None = ('17de1dfee3e6', 'f219ee7a9235')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
