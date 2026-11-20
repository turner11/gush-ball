"""add video clips

Revision ID: 325a6f41011d
Revises: b93343e6a7be
Create Date: 2026-11-20 12:25:02.710991

Folds games.highlights, games.briefing and players.briefing (whole-list JSON, #658/#665/#670) into one
`video_clips` row per video, then drops the three columns (#682).
"""
import json
import re
from collections.abc import Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import sqlalchemy as sa

from alembic import op

revision: str = "325a6f41011d"
down_revision: str | Sequence[str] | None = "b93343e6a7be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DURATION = re.compile(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?")

_clips = sa.table(
    "video_clips",
    sa.column("team_id", sa.Integer),
    sa.column("game_id", sa.Integer),
    sa.column("source_url", sa.String),
    sa.column("start", sa.Integer),
    sa.column("end", sa.Integer),
    sa.column("section", sa.String),
    sa.column("note", sa.Text),
    sa.column("is_highlight", sa.Boolean),
    sa.column("in_game_briefing", sa.Boolean),
    sa.column("in_player_briefing", sa.Boolean),
    sa.column("player_ids", sa.JSON),
)


def _seconds(value: str) -> int | None:
    """`90`, `90s`, `1m30s`, `1h2m3s` -> seconds; None when it isn't one of those."""
    m = _DURATION.fullmatch(value.strip())
    if not m or not any(m.groups()):
        return None
    h, mi, s = (int(g or 0) for g in m.groups())
    return h * 3600 + mi * 60 + s


def _split_segment(url: str) -> tuple[str, int | None, int | None]:
    """A YouTube URL's t/start and end params moved out of the URL; any other URL comes back verbatim.

    A param that isn't a duration (`t=1:30`) stays in the URL rather than being lost. The host test matches
    the frontend `youtubeId`: youtu.be or any *youtube.com.
    """
    parts = urlsplit(url)
    host = parts.hostname or ""
    if host != "youtu.be" and not host.endswith("youtube.com"):
        return url, None, None
    query = parse_qsl(parts.query, keep_blank_values=True)
    values = {k: _seconds(v) for k, v in query if k in ("t", "start", "end")}
    start = values.get("t") if values.get("t") is not None else values.get("start")
    end = values.get("end")
    if end is not None and end <= (start or 0):
        end = None
    kept = [(k, v) for k, v in query if values.get(k) is None]
    return urlunsplit(parts._replace(query=urlencode(kept))), start, end


def _item_clips(item: dict) -> list[dict]:
    """One old `{title, text, url | urls}` item -> clip fields: one clip per url, the note on the first only."""
    urls = item.get("urls") or ([item["url"]] if item.get("url") else [])
    section = (item.get("title") or "").strip() or None
    note = item.get("text") or None
    if not urls:
        return [{"source_url": None, "start": None, "end": None, "section": section, "note": note}]
    clips = []
    for i, url in enumerate(urls):
        source_url, start, end = _split_segment(url)
        clips.append(
            {"source_url": source_url, "start": start, "end": end, "section": section, "note": note if i == 0 else None}
        )
    return clips


def _items(value) -> list[dict]:
    # raw text() reads give Postgres JSON parsed but SQLite's as a string
    return json.loads(value) if isinstance(value, str) else value or []


def _migrate(conn) -> None:
    flags = {"is_highlight": False, "in_game_briefing": False, "in_player_briefing": False}
    rows = []
    for game_id, team_id, highlights, briefing in conn.execute(
        sa.text("SELECT id, team_id, highlights, briefing FROM games")
    ).all():
        for flag, items in (("is_highlight", highlights), ("in_game_briefing", briefing)):
            for item in _items(items):
                for clip in _item_clips(item):
                    rows.append({**flags, flag: True, **clip, "team_id": team_id, "game_id": game_id, "player_ids": []})
    for player_id, team_id, briefing in conn.execute(sa.text("SELECT id, team_id, briefing FROM players")).all():
        for item in _items(briefing):
            for clip in _item_clips(item):
                rows.append(
                    {**flags, "in_player_briefing": True, **clip, "team_id": team_id, "game_id": None, "player_ids": [player_id]}
                )
    if rows:
        conn.execute(sa.insert(_clips), rows)


def upgrade() -> None:
    op.create_table(
        "video_clips",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("game_id", sa.Integer(), sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("start", sa.Integer(), nullable=True),
        sa.Column("end", sa.Integer(), nullable=True),
        sa.Column("section", sa.String(200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_highlight", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("in_game_briefing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("in_player_briefing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("player_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.CheckConstraint(
            "game_id IS NOT NULL OR NOT (is_highlight OR in_game_briefing)", name="ck_video_clips_game_destinations"
        ),
    )
    op.create_index("ix_video_clips_team_id", "video_clips", ["team_id"])
    op.create_index("ix_video_clips_game_id", "video_clips", ["game_id"])
    _migrate(op.get_bind())
    op.drop_column("games", "highlights")
    op.drop_column("games", "briefing")
    op.drop_column("players", "briefing")


def downgrade() -> None:
    """Re-adds the three empty JSON columns and drops the table: every clip is lost."""
    for table, column in (("games", "highlights"), ("games", "briefing"), ("players", "briefing")):
        op.add_column(table, sa.Column(column, sa.JSON(), nullable=False, server_default="[]"))
    op.drop_table("video_clips")
