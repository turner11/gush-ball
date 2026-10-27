"""add team_posts game_id and created_at

Revision ID: 27e64f2e4053
Revises: 3aa13064905d
Create Date: 2026-10-27 09:32:15.090597

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '27e64f2e4053'
down_revision: str | Sequence[str] | None = '3aa13064905d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill(conn: sa.Connection) -> None:
    """Date each post by its audit-log create row; posts with none (pre-audit) stay NULL."""
    conn.execute(
        sa.text(
            "UPDATE team_posts SET created_at = (SELECT MIN(a.created_at) FROM audit_log a "
            "WHERE a.entity_type = 'post' AND a.action = 'create' AND a.entity_id = team_posts.id)"
        )
    )


def upgrade() -> None:
    op.add_column("team_posts", sa.Column("game_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_team_posts_game_id_games", "team_posts", "games", ["game_id"], ["id"], ondelete="SET NULL")
    op.add_column("team_posts", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    _backfill(op.get_bind())


def downgrade() -> None:
    op.drop_column("team_posts", "created_at")
    op.drop_constraint("fk_team_posts_game_id_games", "team_posts", type_="foreignkey")
    op.drop_column("team_posts", "game_id")
