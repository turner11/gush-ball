"""add team_posts expires_on

Revision ID: b10ab3d448d0
Revises: 6dcf2bfde023
Create Date: 2026-10-27 14:54:35.014118

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b10ab3d448d0"
down_revision: str | Sequence[str] | None = "6dcf2bfde023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("team_posts", sa.Column("expires_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("team_posts", "expires_on")
