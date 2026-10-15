"""add admin_user display_name

Revision ID: 623321597e65
Revises: e762566c2db2
Create Date: 2026-10-14 21:19:45.059408

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "623321597e65"
down_revision: str | Sequence[str] | None = "e762566c2db2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("display_name", sa.String(80), nullable=True))
    op.execute("UPDATE admin_users SET display_name = username")
    op.alter_column("admin_users", "display_name", nullable=False)


def downgrade() -> None:
    op.drop_column("admin_users", "display_name")
