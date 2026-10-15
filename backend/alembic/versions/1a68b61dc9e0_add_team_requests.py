"""add team requests

Revision ID: 1a68b61dc9e0
Revises: 450081d7a254
Create Date: 2026-10-15 10:38:30.948921

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1a68b61dc9e0'
down_revision: str | Sequence[str] | None = '450081d7a254'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "team_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("logo_url", sa.String(500)),
        sa.Column("ibasketball_team_url", sa.String(500), nullable=False),
        sa.Column("ibasketball_league_url", sa.String(500), nullable=False),
        sa.Column("club", sa.String(120), sa.ForeignKey("clubs.name", onupdate="CASCADE")),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('pending','approved','rejected')", name="ck_team_requests_status"),
    )
    op.create_index("ix_team_requests_user_id", "team_requests", ["user_id"])
    op.create_index(
        "uq_team_requests_pending_url",
        "team_requests",
        ["ibasketball_team_url"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("team_requests")
