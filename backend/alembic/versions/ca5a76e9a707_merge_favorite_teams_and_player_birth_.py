"""merge favorite_teams and player birth date heads

Revision ID: ca5a76e9a707
Revises: c22bc8381ffd, 170a5b0740be
Create Date: 2026-10-16 11:58:29.899033

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'ca5a76e9a707'
down_revision: str | Sequence[str] | None = ('c22bc8381ffd', '170a5b0740be')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
