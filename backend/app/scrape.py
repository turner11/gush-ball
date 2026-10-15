"""Runs the scrapers, leagues then games then players then standings, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
"""

import logging
from collections.abc import Collection
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.monitoring import init_sentry, trace_scrape
from app.scrape_games import _sp_team, sync_all_games, sync_all_players
from app.scrape_leagues import sync_leagues
from app.scrape_standings import sync_all_standings

log = logging.getLogger(__name__)


KINDS = ("leagues", "games", "players", "standings")


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
    games = _run_kind(
        "games", kinds, sync_all_games, db, errors, team_ids=team_ids, auto_accept=auto_accept
    )
    players = _run_kind("players", kinds, sync_all_players, db, errors, team_ids=team_ids)
    standings = _run_kind("standings", kinds, sync_all_standings, db, errors, team_ids=team_ids)
    log.info(
        "Sync finished: %s standings rows, %s games, %s players, %s leagues, %d errors",
        standings,
        games,
        players,
        leagues,
        len(errors),
    )
    return {
        "standings": standings,
        "games": games,
        "players": players,
        "leagues": leagues,
        "errors": errors,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_sentry()
    with SessionLocal() as db:
        print(sync_all(db))
