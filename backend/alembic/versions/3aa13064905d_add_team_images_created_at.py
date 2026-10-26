"""add team_images.created_at

Revision ID: 3aa13064905d
Revises: 28cefaa36a65
Create Date: 2026-10-26 18:22:43.068953

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "3aa13064905d"
down_revision: str | Sequence[str] | None = "28cefaa36a65"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill(conn: sa.Connection) -> None:
    """Date each image by its audit-log create row; images with none (pre-audit) stay NULL."""
    conn.execute(
        sa.text(
            "UPDATE team_images SET created_at = (SELECT MIN(a.created_at) FROM audit_log a "
            "WHERE a.entity_type = 'image' AND a.action = 'create' AND a.entity_id = team_images.id)"
        )
    )


def upgrade() -> None:
    op.add_column("team_images", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    _backfill(op.get_bind())


def downgrade() -> None:
    op.drop_column("team_images", "created_at")
