"""add team wikipedia_url

Revision ID: 9f3c3bb33cde
Revises: d172c8930a23
Create Date: 2026-10-21 11:24:10.102766

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f3c3bb33cde"
down_revision: str | Sequence[str] | None = "d172c8930a23"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("teams", sa.Column("wikipedia_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("teams", "wikipedia_url")
