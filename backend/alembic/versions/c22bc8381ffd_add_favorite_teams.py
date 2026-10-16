"""add favorite teams

Revision ID: c22bc8381ffd
Revises: caa544af2d0f
Create Date: 2026-10-16 09:42:15.325098

"""

import sqlalchemy as sa

from alembic import op

revision: str = "c22bc8381ffd"
down_revision: str | None = "caa544af2d0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "favorite_teams",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "team_id"),
    )


def downgrade() -> None:
    op.drop_table("favorite_teams")
