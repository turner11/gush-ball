"""add audit_log

Revision ID: d9d2894f84f0
Revises: e762566c2db2
Create Date: 2026-10-14 21:57:39.179153

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9d2894f84f0"
down_revision: str | Sequence[str] | None = "e762566c2db2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=80), nullable=True),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["admin_users.id"],
            name="fk_audit_log_user_id_admin_users",
            ondelete="SET NULL",
        ),
    )
    op.create_index(op.f("ix_audit_log_team_id"), "audit_log", ["team_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_audit_log_team_id"), table_name="audit_log")
    op.drop_table("audit_log")
