"""Pulls schedule/results + opponent logos from ibasketball.co.il's SportsPress JSON API
into the Game table. See GitHub issue #14. #16 stores a diff suggestion (not applied) when
a re-scrape disagrees with an admin-overridden game, for the admin to accept/reject; #17
adds the nightly trigger. This module is a manual, synchronous entry point until then.
"""

import html
import logging
import time
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Game, GameStatus, Opponent, Player, PlayerImage, Team, get_or_create_opponent

BASE = "https://ibasketball.co.il/wp-json"
CRAWL_DELAY = 10
AJAX_URL = "https://ibasketball.co.il/wp-admin/admin-ajax.php"

log = logging.getLogger(__name__)


def _get(url: str, **params: Any) -> httpx.Response:
    time.sleep(CRAWL_DELAY)
    response = httpx.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response


def _get_json(path: str, **params: Any) -> Any:
    return _get(BASE + path, **params).json()


def _get_html(**params: Any) -> str:
    # The "סגל הקבוצה" tab is filled client-side from this theme action, not the REST API.
    return _get(AJAX_URL, **params).text


def _get_page(url: str) -> str:
    return _get(url).text


def _scrape_address(url: str) -> str | None:
    """Club address from the static team page ("" if the page has none); None on fetch error.

    Never lets a failure lose the games sync.
    """
    try:
        node = BeautifulSoup(_get_page(url), "html.parser").select_one("div.data-address")
    except httpx.HTTPError:
        log.warning("Could not fetch address from %s", url, exc_info=True)
        return None
    if node is None:
        return ""
    if label := node.find("span"):
        label.extract()
    address = node.get_text(strip=True)
    return address[:300]


def _resolve_opponent(db: Session, opp_sp_id: int, cache: dict[int, Opponent]) -> Opponent:
    if opp_sp_id in cache:
        return cache[opp_sp_id]
    data = _get_json(f"/sportspress/v2/teams/{opp_sp_id}", _embed="wp:featuredmedia")
    name = html.unescape(data["title"]["rendered"])
    opponent = get_or_create_opponent(db, name)
    if opponent.source_url is None:
        opponent.source_url = data["link"]
    if opponent.logo_url is None:
        media = data.get("_embedded", {}).get("wp:featuredmedia") or []
        opponent.logo_url = media[0]["source_url"] if media else None
    # ponytail: "" = page has no address (never refetched); None = fetch failed, retried next sync
    if opponent.address is None and opponent.source_url:
        opponent.address = _scrape_address(opponent.source_url)
    cache[opp_sp_id] = opponent
    return opponent


def _find_sp_team(team: Team) -> dict[str, Any]:
    slug = team.ibasketball_team_url.rstrip("/").rsplit("/", 1)[-1]
    teams = _get_json("/sportspress/v2/teams", slug=slug)
    if not teams:
        raise ValueError(f"No SportsPress team found for slug {slug!r}")
    return teams[0]


def sync_team_games(db: Session, team: Team) -> int:
    sp_id = _find_sp_team(team)["id"]
    # Fill-only: an admin-entered address is never clobbered.
    if team.home_court_address is None:
        team.home_court_address = _scrape_address(team.ibasketball_team_url)

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

        # ponytail: refetches known opponents each run; skip when opp already
        # has logo+source_url if runtime matters
        opponent = _resolve_opponent(db, opp_sp_id, opponent_cache)

        if game is not None and game.is_manually_overridden:
            # #16: never clobber an admin override — store what differs as a
            # suggestion for the pending-review queue instead of applying it.
            incoming = {
                "opponent_name": opponent.name,
                "is_home": is_home,
                "scheduled_at": datetime.fromisoformat(event["date"]),
                "status": game_status,
                "team_score": team_score,
                "opponent_score": opponent_score,
            }
            current = {
                "opponent_name": game.opponent.name,
                "is_home": game.is_home,
                "scheduled_at": game.scheduled_at,
                "status": game.status,
                "team_score": game.team_score,
                "opponent_score": game.opponent_score,
            }
            diff = {k: v for k, v in incoming.items() if current[k] != v}
            new = jsonable_encoder(diff) or None
            if new is None:
                if game.scrape_suggestion is not None or game.scrape_suggestion_dismissed:
                    game.scrape_suggestion = None
                    game.scrape_suggestion_dismissed = False
            elif new != game.scrape_suggestion:
                game.scrape_suggestion = new
                game.scrape_suggestion_dismissed = False
            continue

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


def sync_all_games(db: Session, errors: list[str] | None = None) -> int:
    """Runs unattended (nightly cron), so one team's failure must not abort every team
    after it -- log and move on instead.
    """
    teams = db.scalars(select(Team).where(Team.ibasketball_team_url.is_not(None))).all()
    if not teams:
        log.warning("Games sync: no team has an ibasketball_team_url set -- nothing to do")
        if errors is not None:
            errors.append("games: no team has an ibasketball_team_url set")
    total = 0
    for team in teams:
        # Captured before the try: after a DB-level failure the session's objects are
        # expired and the failed transaction can't query until rolled back.
        slug = team.slug
        try:
            log.info("Games sync: fetching %r", slug)
            count = sync_team_games(db, team)
            log.info("Games sync: %r created/updated %d games", slug, count)
            total += count
        except Exception as exc:
            log.exception("Games sync failed for team %r", slug)
            if errors is not None:
                errors.append(f"games {slug}: {exc}")
            # Without this, every later team's db.commit() raises PendingRollbackError.
            db.rollback()
    return total


def sync_team_players(db: Session, team: Team) -> int:
    """Fill-only: creates missing players and fills a missing image. Never overwrites admin edits,
    never deletes.

    Players are matched by the roster card's href (Player.source_url), so renamed or soft-deleted
    players are not re-imported. Legacy rows without source_url are adopted by name.
    """
    sp_id = _find_sp_team(team)["id"]
    page = BeautifulSoup(
        _get_html(action="ibba", template="players", id=sp_id, type="sp_team"), "html.parser"
    )

    count = 0
    for card in page.select("a.player"):
        name = (card.find(string=True, recursive=False) or "").strip()
        if not name:
            continue
        href = card.get("href")
        # not filtering deleted_at: a soft-deleted player must still block re-import
        # ponytail: keyed on href; if the source changes a URL the player is re-imported once
        # (upgrade path: numeric SportsPress player id)
        player = href and db.scalar(
            select(Player).where(Player.team_id == team.id, Player.source_url == href)
        )
        if not player:
            player = db.scalar(
                select(Player).where(
                    Player.team_id == team.id, Player.source_url.is_(None), Player.name == name
                )
            )
            if player is not None:
                player.source_url = href
            else:
                player = Player(team_id=team.id, name=name, source_url=href)
                db.add(player)
                count += 1
        img = card.select_one("img[src]")
        # ponytail: hotlinks the source URL; copy to object storage if it ever breaks
        url = urljoin(BASE, img["src"]) if img else ""
        if url and len(url) <= 500 and not player.images:
            player.images.append(PlayerImage(url=url))

    db.commit()
    return count


def sync_all_players(db: Session, errors: list[str] | None = None) -> int:
    # ponytail: 3rd copy of the per-team loop; extract a helper if a 4th scraper appears
    teams = db.scalars(select(Team).where(Team.ibasketball_team_url.is_not(None))).all()
    total = 0
    for team in teams:
        slug = team.slug
        try:
            log.info("Players sync: fetching %r", slug)
            count = sync_team_players(db, team)
            log.info("Players sync: %r created/updated %d players", slug, count)
            total += count
        except Exception as exc:
            log.exception("Players sync failed for team %r", slug)
            if errors is not None:
                errors.append(f"players {slug}: {exc}")
            db.rollback()
    return total


if __name__ == "__main__":
    with SessionLocal() as db:
        print(sync_all_games(db))
