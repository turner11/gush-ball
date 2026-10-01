"""Runs the scrapers, standings then games then players, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
"""

import logging
from collections.abc import Collection
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.scrape_games import sync_all_games, sync_all_players
from app.scrape_standings import sync_all_standings

log = logging.getLogger(__name__)


KINDS = ("standings", "games", "players")


def sync_all(
    db: Session,
    team_ids: list[int] | None = None,
    kinds: Collection[str] = KINDS,
    auto_accept: bool = False,
) -> dict[str, Any]:
    # sync_all_standings logs and skips per-team failures, so games always run.
    errors: list[str] = []
    standings = sync_all_standings(db, errors, team_ids=team_ids) if "standings" in kinds else None
    games = sync_all_games(db, errors, team_ids=team_ids, auto_accept=auto_accept) if "games" in kinds else None
    players = sync_all_players(db, errors, team_ids=team_ids) if "players" in kinds else None
    log.info(
        "Sync finished: %s standings rows, %s games, %s players, %d errors",
        standings, games, players, len(errors),
    )
    return {"standings": standings, "games": games, "players": players, "errors": errors}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        print(sync_all(db))
