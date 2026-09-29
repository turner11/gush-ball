"""Runs both scrapers, standings then games, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
"""

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.scrape_games import sync_all_games
from app.scrape_standings import sync_all_standings


def sync_all(db: Session) -> None:
    # sync_all_standings logs and skips per-team failures, so games always run.
    sync_all_standings(db)
    sync_all_games(db)


if __name__ == "__main__":
    with SessionLocal() as db:
        sync_all(db)
