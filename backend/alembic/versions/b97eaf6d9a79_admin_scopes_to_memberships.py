"""admin scopes to memberships

Revision ID: b97eaf6d9a79
Revises: 1d8046c06869
Create Date: 2026-10-13 16:55:23.986818

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b97eaf6d9a79"
down_revision: str | Sequence[str] | None = "1d8046c06869"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _migrate_scopes(conn) -> None:
    """Old scope columns -> explicit rights. Preserves every existing right and adds none."""
    conn.execute(sa.text("UPDATE admin_users SET is_full_admin = (team_id IS NULL AND club IS NULL)"))
    conn.execute(
        sa.text("INSERT INTO memberships (user_id, team_id, role) SELECT id, team_id, 'admin' FROM admin_users WHERE team_id IS NOT NULL")
    )
    # team_id wins over club, as in the old admin_team_ids
    conn.execute(
        sa.text(
            "INSERT INTO memberships (user_id, club, role) SELECT id, club, 'admin' FROM admin_users "
            "WHERE club IS NOT NULL AND team_id IS NULL"
        )
    )


def upgrade() -> None:
    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("club", sa.String(length=120), nullable=True),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.CheckConstraint("(team_id IS NULL) <> (club IS NULL)", name="ck_memberships_one_scope"),
        sa.CheckConstraint("role IN ('pending','member','admin')", name="ck_memberships_role"),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "team_id", name="uq_memberships_user_team"),
        sa.UniqueConstraint("user_id", "club", name="uq_memberships_user_club"),
    )
    op.create_index(op.f("ix_memberships_user_id"), "memberships", ["user_id"])
    op.add_column(
        "admin_users", sa.Column("is_full_admin", sa.Boolean(), server_default=sa.false(), nullable=False)
    )
    _migrate_scopes(op.get_bind())
    op.drop_constraint("fk_admin_users_team_id_teams", "admin_users", type_="foreignkey")
    op.drop_column("admin_users", "team_id")
    op.drop_column("admin_users", "club")


def downgrade() -> None:
    # The old schema holds one scope per user and reads NULL as full admin: a naive downgrade would promote members.
    raise NotImplementedError("one-way migration: memberships cannot be folded back into admin_users.team_id/club")
