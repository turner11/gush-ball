"""add player user_id

Revision ID: e762566c2db2
Revises: 06b7cec9b2c5
Create Date: 2026-10-14 19:16:54.936694

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e762566c2db2"
down_revision: str | Sequence[str] | None = "06b7cec9b2c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("players", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_players_user_id_admin_users",
        "players",
        "admin_users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_players_user_id"), "players", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_players_user_id"), table_name="players")
    op.drop_constraint("fk_players_user_id_admin_users", "players", type_="foreignkey")
    op.drop_column("players", "user_id")
