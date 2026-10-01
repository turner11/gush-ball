"""dedupe reissued games

Revision ID: f5ecfce52374
Revises: 4853fc3fed75
Create Date: 2026-10-01 22:47:57.421046

"""
import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f5ecfce52374'
down_revision: str | Sequence[str] | None = '4853fc3fed75'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Collapse games the league re-issued under a new event id, and duplicate same-name players (#193)."""
    bind = op.get_bind()
    _dedupe_games(bind)
    _dedupe_players(bind)


def _dedupe_games(bind) -> None:
    games = bind.execute(
        sa.text(
            "SELECT g.id, g.team_id, g.opponent_id, g.is_home, g.scheduled_at, g.source_event_id,"
            " g.needs_review,"
            " (g.is_manually_overridden OR g.stats_url IS NOT NULL"
            "  OR EXISTS (SELECT 1 FROM lineup_snapshots l WHERE l.game_id = g.id)) AS has_admin_data"
            " FROM games g WHERE g.source_event_id IS NOT NULL"
        ).columns(scheduled_at=sa.DateTime)  # typed so SQLite (tests) returns datetimes like Postgres
    ).all()
    groups: dict[tuple, list] = {}
    for g in games:
        groups.setdefault((g.team_id, g.opponent_id, g.is_home, g.scheduled_at.date()), []).append(g)

    for rows in groups.values():
        if len(rows) < 2:
            continue
        with_data = [r for r in rows if r.has_admin_data]
        if len(with_data) > 1:
            print(f"dedupe reissued games: skipped, delete one in the admin UI: game ids {[r.id for r in with_data]}")
            continue
        # WordPress ids only grow, so the highest event id is the live one.
        live_event_id = max(r.source_event_id for r in rows)
        # Without admin data keep a published row (not one awaiting review), then the newest.
        keep = with_data[0] if with_data else max(rows, key=lambda r: (not r.needs_review, r.source_event_id))
        drop_ids = [r.id for r in rows if r.id != keep.id]
        # Delete first: re-keying before would break the unique source_event_id.
        bind.execute(_ids_stmt("DELETE FROM games WHERE id IN :ids"), {"ids": drop_ids})
        bind.execute(
            sa.text("UPDATE games SET source_event_id = :event_id WHERE id = :id"),
            {"event_id": live_event_id, "id": keep.id},
        )


def _ids_stmt(sql: str):
    return sa.text(sql).bindparams(sa.bindparam("ids", expanding=True))


def _dedupe_players(bind) -> None:
    """Soft-delete (never DELETE) same-name live players the league re-published under a new link.

    Admin data = a jersey number, an uploaded photo (sync's scraped card photo is hosted on
    ibasketball.co.il and every player gets one), or a tag on a team video/image.
    """
    tagged: set[int] = set()
    for table in ("team_videos", "team_images"):
        for (ids,) in bind.execute(sa.text(f"SELECT player_ids FROM {table}")):
            tagged.update(json.loads(ids) if isinstance(ids, str) else ids or [])
    players = bind.execute(
        sa.text(
            "SELECT p.id, p.team_id, p.name,"
            " (p.jersey_number IS NOT NULL"
            "  OR EXISTS (SELECT 1 FROM player_images i WHERE i.player_id = p.id"
            "             AND i.url NOT LIKE 'https://ibasketball.co.il/%')) AS has_admin_data"
            " FROM players p WHERE p.deleted_at IS NULL ORDER BY p.id"
        )
    ).all()
    groups: dict[tuple, list] = {}
    for p in players:
        groups.setdefault((p.team_id, p.name), []).append(p)

    for rows in groups.values():
        if len(rows) < 2:
            continue
        with_data = [r for r in rows if r.has_admin_data or r.id in tagged]
        if len(with_data) > 1:
            print(f"dedupe players: skipped, delete one in the admin UI: player ids {[r.id for r in with_data]}")
            continue
        keep = with_data[0] if with_data else rows[0]
        drop_ids = [r.id for r in rows if r.id != keep.id]
        bind.execute(_ids_stmt("UPDATE players SET deleted_at = CURRENT_TIMESTAMP WHERE id IN :ids"), {"ids": drop_ids})


def downgrade() -> None:
    """Data cleanup; nothing to undo."""
