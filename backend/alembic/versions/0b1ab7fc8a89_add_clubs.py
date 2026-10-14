"""add clubs

Revision ID: 0b1ab7fc8a89
Revises: b97eaf6d9a79
Create Date: 2026-10-13 22:23:16.390944

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0b1ab7fc8a89"
down_revision: str | Sequence[str] | None = "b97eaf6d9a79"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _seed_clubs(conn) -> None:
    """One club row per distinct existing club string, so the foreign keys below can be added."""
    conn.execute(
        sa.text(
            "INSERT INTO clubs (name) SELECT club FROM teams WHERE club IS NOT NULL "
            "UNION SELECT club FROM memberships WHERE club IS NOT NULL"
        )
    )


def upgrade() -> None:
    op.create_table(
        "clubs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("ibasketball_url", sa.String(500), nullable=True),
        sa.UniqueConstraint("name", name="uq_clubs_name"),
        sa.UniqueConstraint("ibasketball_url", name="uq_clubs_ibasketball_url"),
    )
    _seed_clubs(op.get_bind())
    for table in ("teams", "memberships"):
        op.create_foreign_key(f"fk_{table}_club_clubs", table, "clubs", ["club"], ["name"], onupdate="CASCADE")


def downgrade() -> None:
    for table in ("teams", "memberships"):
        op.drop_constraint(f"fk_{table}_club_clubs", table, type_="foreignkey")
    op.drop_table("clubs")
