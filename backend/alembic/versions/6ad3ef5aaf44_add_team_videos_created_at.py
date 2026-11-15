"""add team_videos.created_at

Revision ID: 6ad3ef5aaf44
Revises: fd3b03ceace3
Create Date: 2026-11-15 12:07:13.497195

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6ad3ef5aaf44"
down_revision: str | Sequence[str] | None = "fd3b03ceace3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill(conn: sa.Connection) -> None:
    """Date each video by its audit-log create row; videos with none (pre-audit) stay NULL."""
    conn.execute(
        sa.text(
            "UPDATE team_videos SET created_at = (SELECT MIN(a.created_at) FROM audit_log a "
            "WHERE a.entity_type = 'video' AND a.action = 'create' AND a.entity_id = team_videos.id)"
        )
    )


def upgrade() -> None:
    op.add_column("team_videos", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    _backfill(op.get_bind())


def downgrade() -> None:
    op.drop_column("team_videos", "created_at")
