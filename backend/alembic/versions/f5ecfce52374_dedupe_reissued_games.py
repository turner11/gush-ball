"""dedupe reissued games

Revision ID: f5ecfce52374
Revises: 4853fc3fed75
Create Date: 2026-10-01 22:47:57.421046

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f5ecfce52374'
down_revision: str | Sequence[str] | None = '4853fc3fed75'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Collapse games the league re-issued under a new event id (#193)."""
    bind = op.get_bind()
    games = bind.execute(
        sa.text(
            "SELECT g.id, g.team_id, g.opponent_id, g.is_home, g.scheduled_at, g.source_event_id,"
            " (g.is_manually_overridden OR g.stats_url IS NOT NULL"
            "  OR EXISTS (SELECT 1 FROM lineup_snapshots l WHERE l.game_id = g.id)) AS has_admin_data"
            " FROM games g WHERE g.source_event_id IS NOT NULL"
        )
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
        keep = with_data[0] if with_data else max(rows, key=lambda r: r.source_event_id)
        drop_ids = [r.id for r in rows if r.id != keep.id]
        # Delete first: re-keying before would break the unique source_event_id.
        bind.execute(sa.text("DELETE FROM games WHERE id = ANY(:ids)"), {"ids": drop_ids})
        bind.execute(
            sa.text("UPDATE games SET source_event_id = :event_id WHERE id = :id"),
            {"event_id": live_event_id, "id": keep.id},
        )


def downgrade() -> None:
    """Data cleanup; nothing to undo."""
