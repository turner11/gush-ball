"""Pulls schedule/results + opponent logos from ibasketball.co.il's SportsPress JSON API
into the Game table. See GitHub issue #14. #16 adds diff suggestions for overridden games;
#17 adds the nightly trigger. This module is a manual, synchronous entry point until then.
"""

import html
import time
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Game, GameStatus, Opponent, Team
from app.routers.games import _get_or_create_opponent

BASE = "https://ibasketball.co.il/wp-json"
CRAWL_DELAY = 10


def _get_json(path: str, **params: Any) -> Any:
    time.sleep(CRAWL_DELAY)
    response = httpx.get(BASE + path, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def _resolve_opponent(db: Session, opp_sp_id: int, cache: dict[int, Opponent]) -> Opponent:
    if opp_sp_id in cache:
        return cache[opp_sp_id]
    data = _get_json(f"/sportspress/v2/teams/{opp_sp_id}", _embed="wp:featuredmedia")
    name = html.unescape(data["title"]["rendered"])
    opponent = _get_or_create_opponent(db, name)
    if opponent.source_url is None:
        opponent.source_url = data["link"]
    if opponent.logo_url is None:
        media = data.get("_embedded", {}).get("wp:featuredmedia") or []
        opponent.logo_url = media[0]["source_url"] if media else None
    cache[opp_sp_id] = opponent
    return opponent


def sync_team_games(db: Session, team: Team) -> int:
    slug = team.ibasketball_team_url.rstrip("/").rsplit("/", 1)[-1]
    teams = _get_json("/sportspress/v2/teams", slug=slug)
    if not teams:
        raise ValueError(f"No SportsPress team found for slug {slug!r}")
    sp_id = teams[0]["id"]

    # ponytail: single page (100); follow X-WP-TotalPages if a team ever exceeds it
    events = _get_json("/sportspress/v2/events", teams=sp_id, per_page=100)

    opponent_cache: dict[int, Opponent] = {}
    count = 0
    for event in events:
        event_teams = event["teams"]
        if sp_id not in event_teams or len(event_teams) != 2:
            continue

        is_home = event_teams[0] == sp_id
        opp_sp_id = event_teams[1] if is_home else event_teams[0]

        main_results = event.get("main_results") or []
        is_final = event["status"] == "publish" and len(main_results) == 2
        if is_final:
            game_status = GameStatus.FINAL
            team_score = main_results[0] if is_home else main_results[1]
            opponent_score = main_results[1] if is_home else main_results[0]
        else:
            game_status = GameStatus.SCHEDULED
            team_score = None
            opponent_score = None

        game = db.scalar(select(Game).where(Game.source_event_id == event["id"]))
        if game is not None and game.is_manually_overridden:
            # #16 turns this into a diff suggestion
            continue

        # ponytail: refetches known opponents each run; skip when opp already
        # has logo+source_url if runtime matters
        opponent = _resolve_opponent(db, opp_sp_id, opponent_cache)

        if game is None:
            game = Game(
                team_id=team.id,
                source_event_id=event["id"],
                is_scraped=True,
                needs_review=True,
            )
            db.add(game)

        game.opponent = opponent
        game.is_home = is_home
        # naive local wall time, matching the admin's datetime-local input
        game.scheduled_at = datetime.fromisoformat(event["date"])
        game.status = game_status
        game.team_score = team_score
        game.opponent_score = opponent_score
        count += 1

    db.commit()
    return count


def sync_all_games(db: Session) -> int:
    teams = db.scalars(select(Team).where(Team.ibasketball_team_url.is_not(None)))
    return sum(sync_team_games(db, team) for team in teams)


if __name__ == "__main__":
    with SessionLocal() as db:
        print(sync_all_games(db))
