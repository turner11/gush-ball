"""Runs both scrapers, standings then games, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.scrape_games import sync_all_games
from app.scrape_standings import sync_all_standings

log = logging.getLogger(__name__)


def sync_all(db: Session) -> dict[str, Any]:
    # sync_all_standings logs and skips per-team failures, so games always run.
    errors: list[str] = []
    standings = sync_all_standings(db, errors)
    games = sync_all_games(db, errors)
    log.info("Sync finished: %d standings rows, %d games, %d errors", standings, games, len(errors))
    return {"standings": standings, "games": games, "errors": errors}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        print(sync_all(db))
