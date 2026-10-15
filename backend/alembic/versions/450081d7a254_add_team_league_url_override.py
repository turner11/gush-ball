"""add team league url override

Revision ID: 450081d7a254
Revises: 9891935e3a17
Create Date: 2026-10-15 09:16:55.182756

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "450081d7a254"
down_revision: str | Sequence[str] | None = "9891935e3a17"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "teams",
        sa.Column("league_url_overridden", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("teams", sa.Column("league_url_suggestion", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("teams", "league_url_suggestion")
    op.drop_column("teams", "league_url_overridden")
