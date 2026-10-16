"""Runs the scrapers, leagues then games then players then standings, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
Evening thin run (games + standings, only teams with an unscored game today):  python -m app.scrape --thin
"""

import logging
import sys
from collections.abc import Collection
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Game, GameStatus, Team
from app.monitoring import init_sentry, trace_scrape
from app.scrape_games import _sp_team, sync_all_games, sync_all_players
from app.scrape_leagues import sync_leagues
from app.scrape_standings import sync_all_standings

log = logging.getLogger(__name__)


KINDS = ("leagues", "games", "players", "standings")
THIN_KINDS = ("games", "standings")
ISRAEL = ZoneInfo("Asia/Jerusalem")


def _run_kind(kind: str, kinds: Collection[str], sync: Any, *args: Any, **kwargs: Any) -> Any:
    if kind not in kinds:
        return None
    with trace_scrape(kind):  # own transaction per kind: each gets its own 1000-span budget
        return sync(*args, **kwargs)


def sync_all(
    db: Session,
    team_ids: list[int] | None = None,
    kinds: Collection[str] = KINDS,
    auto_accept: bool = False,
) -> dict[str, Any]:
    # Leagues first so the games step's season rollover (#352) sees them; standings last, scraping the moved url.
    _sp_team.cache_clear()
    errors: list[str] = []
    # Leagues are global, so a team- or club-scoped sync must not refresh them.
    leagues = _run_kind("leagues", kinds, sync_leagues, db, errors) if team_ids is None else None
    games = _run_kind("games", kinds, sync_all_games, db, errors, team_ids=team_ids, auto_accept=auto_accept)
    players = _run_kind("players", kinds, sync_all_players, db, errors, team_ids=team_ids)
    standings = _run_kind("standings", kinds, sync_all_standings, db, errors, team_ids=team_ids)
    log.info(
        "Sync finished: %s standings rows, %s games, %s players, %s leagues, %d errors",
        standings, games, players, leagues, len(errors),
    )
    return {"standings": standings, "games": games, "players": players, "leagues": leagues, "errors": errors}


def tonight_day(now: datetime | None = None) -> date:
    """The Israel day the thin run covers; -1h so the 00:00 run covers the day that just ended."""
    return ((now or datetime.now(ISRAEL)) - timedelta(hours=1)).date()


def tonight_team_ids(db: Session, day: date) -> list[int]:
    """Scrapable teams with an unscored scheduled game on `day` (Israel time)."""
    start = datetime.combine(day, time.min)  # scheduled_at is a naive Israel wall time
    stmt = (
        select(Game.team_id)
        .join(Team, Team.id == Game.team_id)
        .where(
            Game.status == GameStatus.SCHEDULED,
            Game.team_score.is_(None),
            Game.scheduled_at >= start,
            Game.scheduled_at < start + timedelta(days=1),
            Team.ibasketball_team_url.is_not(None),
        )
        .distinct()
    )
    return list(db.scalars(stmt))


def league_team_ids(db: Session, league_url: str) -> list[int]:
    return list(
        db.scalars(
            select(Team.id).where(Team.ibasketball_league_url == league_url, Team.ibasketball_team_url.is_not(None))
        )
    )


def sync_tonight(db: Session, now: datetime | None = None) -> dict[str, Any] | None:
    """Thin evening run: scores and tables for teams whose game today has no score yet."""
    day = tonight_day(now)
    team_ids = tonight_team_ids(db, day)
    if not team_ids:
        log.info("Thin sync: no unscored games on %s, nothing to do", day)
        return None
    log.info("Thin sync: %d team(s) with unscored games on %s", len(team_ids), day)
    return sync_all(db, team_ids, THIN_KINDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_sentry()
    with SessionLocal() as db:
        print(sync_tonight(db) if "--thin" in sys.argv[1:] else sync_all(db))
