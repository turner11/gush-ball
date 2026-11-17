"""fold game videos into highlights

Revision ID: 9883ba441e46
Revises: 2ed7a4c8c991
Create Date: 2026-11-17 13:00:43.637669

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9883ba441e46"
down_revision: str | Sequence[str] | None = "2ed7a4c8c991"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

games = sa.table("games", sa.column("id", sa.Integer), sa.column("videos", sa.JSON), sa.column("highlights", sa.JSON))


def _fold_videos(conn) -> None:
    """Append each game's media videos to its highlights, one item per video (title_en is dropped, #667)."""
    rows = conn.execute(sa.select(games.c.id, games.c.videos, games.c.highlights)).all()  # all() before any update
    for game_id, videos, highlights in rows:
        if not videos:
            continue
        folded = [{"title": v["title"], "text": None, "urls": [v["url"]]} for v in videos]
        conn.execute(sa.update(games).where(games.c.id == game_id).values(highlights=[*(highlights or []), *folded]))


def upgrade() -> None:
    _fold_videos(op.get_bind())
    op.drop_column("games", "videos")


def downgrade() -> None:
    # Folded items are indistinguishable from real highlights, so they stay in highlights; only title_en is lost.
    op.add_column("games", sa.Column("videos", sa.JSON(), nullable=False, server_default="[]"))
