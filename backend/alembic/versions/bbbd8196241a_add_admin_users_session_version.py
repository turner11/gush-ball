"""add admin_users session_version

Revision ID: bbbd8196241a
Revises: 0b1ab7fc8a89
Create Date: 2026-10-14 05:54:08.516855

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bbbd8196241a"
down_revision: str | Sequence[str] | None = "0b1ab7fc8a89"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "admin_users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "session_version")
