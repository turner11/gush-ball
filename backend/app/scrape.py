"""Runs the scrapers, standings then games then players, one after the other so they never overlap and both
respect ibasketball.co.il's crawl delay. Shared by the admin "sync now" button (#17) and the
nightly cron:  python -m app.scrape
"""

import logging
from collections.abc import Collection
from typing import Any

import sentry_sdk
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.monitoring import init_sentry, trace_scrape
from app.scrape_games import _sp_team_id, sync_all_games, sync_all_players
from app.scrape_standings import sync_all_standings

log = logging.getLogger(__name__)


KINDS = ("standings", "games", "players")


def _run_kind(kind: str, kinds: Collection[str], sync: Any, *args: Any, **kwargs: Any) -> Any:
    if kind not in kinds:
        return None
    with sentry_sdk.start_span(op=f"scrape.{kind}", name=kind):
        return sync(*args, **kwargs)


def sync_all(
    db: Session,
    team_ids: list[int] | None = None,
    kinds: Collection[str] = KINDS,
    auto_accept: bool = False,
) -> dict[str, Any]:
    # sync_all_standings logs and skips per-team failures, so games always run.
    _sp_team_id.cache_clear()
    errors: list[str] = []
    with trace_scrape("sync_all"):
        standings = _run_kind("standings", kinds, sync_all_standings, db, errors, team_ids=team_ids)
        games = _run_kind("games", kinds, sync_all_games, db, errors, team_ids=team_ids, auto_accept=auto_accept)
        players = _run_kind("players", kinds, sync_all_players, db, errors, team_ids=team_ids)
    log.info(
        "Sync finished: %s standings rows, %s games, %s players, %d errors",
        standings, games, players, len(errors),
    )
    return {"standings": standings, "games": games, "players": players, "errors": errors}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_sentry()
    with SessionLocal() as db:
        print(sync_all(db))
