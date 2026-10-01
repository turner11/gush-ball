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

import cv2
import httpx
import numpy as np
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

# ponytail: calibration knobs for the avatar framing; NULL player_images.focus_x to re-detect after tuning
FACE_SHARE = 0.5  # face width as a fraction of the circle
MAX_ZOOM = 3.0
HAIR_SHIFT = 0.1  # centre moves up by this fraction of face height so hair is framed
_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


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


def _get_image(url: str) -> bytes:
    return _get(url).content


def _focus(img_w: int, img_h: int, face: tuple[int, int, int, int]) -> tuple[float, float, float]:
    """(object-position x %, y %, zoom) that frames the face in a square circle."""
    x, y, w, h = face
    m = min(img_w, img_h)
    side = min(m, max(w / FACE_SHARE, m / MAX_ZOOM))

    def pos(length: int, centre: float) -> float:
        win = side / length
        if win >= 1:
            return 50.0
        start = min(max(centre / length - win / 2, 0), 1 - win)
        return 100 * start / (1 - win)

    return pos(img_w, x + w / 2), pos(img_h, y + h / 2 - HAIR_SHIFT * h), m / side


def face_focus(data: bytes) -> tuple[float, float, float]:
    """Focus for the largest face; (50, 0, 1) (the old top-anchored look) if none or undecodable."""
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE) if data else None
    if img is None:
        return 50.0, 0.0, 1.0
    m = min(img.shape)
    faces = _CASCADE.detectMultiScale(img, scaleFactor=1.1, minNeighbors=5, minSize=(m // 10, m // 10))
    if len(faces) == 0:
        return 50.0, 0.0, 1.0
    return _focus(img.shape[1], img.shape[0], tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3])))


def _scrape_address(url: str) -> str | None:
    """Home court from the team page's venue link ("" if the page has none); None on fetch error.

    Never reads div.data-address: that is the club's contact address, not the court.
    Never lets a failure lose the games sync.
    """
    try:
        node = BeautifulSoup(_get_page(url), "html.parser").select_one("div.data-venue a")
    except httpx.HTTPError:
        log.warning("Could not fetch address from %s", url, exc_info=True)
        return None
    if node is None:
        return ""
    return node.get_text(strip=True)[:300]


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


def sync_team_games(db: Session, team: Team, auto_accept: bool = False) -> int:
    sp_id = _find_sp_team(team)["id"]
    # Fill-only: an admin-entered address is never clobbered.
    if team.home_court_address is None:
        team.home_court_address = _scrape_address(team.ibasketball_team_url)

    # ponytail: single page (100); follow X-WP-TotalPages if a team ever exceeds it
    events = _get_json("/sportspress/v2/events", teams=sp_id, per_page=100)

    # Games whose event left the feed: the league re-publishes a schedule under new event ids.
    feed_ids = {e["id"] for e in events}
    orphans = list(
        db.scalars(
            select(Game).where(
                Game.team_id == team.id,
                Game.source_event_id.is_not(None),
                Game.source_event_id.not_in(feed_ids),
            )
        )
    )

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
        # source_event_id is globally unique: another club team's game must not be overwritten.
        if game is not None and game.team_id != team.id:
            continue

        # ponytail: refetches known opponents each run; skip when opp already
        # has logo+source_url if runtime matters
        opponent = _resolve_opponent(db, opp_sp_id, opponent_cache)

        if game is None:
            # ponytail: matches by same day + opponent + side; an admin-edited date/opponent gets a
            # twin (delete it in the admin UI). Unmatched orphans are left alone: deleting vanished
            # events is a separate decision.
            day = datetime.fromisoformat(event["date"]).date()
            game = next(
                (
                    o
                    for o in orphans
                    if o.opponent_id == opponent.id
                    and o.is_home == is_home
                    and o.scheduled_at.date() == day
                ),
                None,
            )
            if game is not None:
                orphans.remove(game)
                log.info(
                    "Games sync: game %d re-keyed from event %s to %s",
                    game.id,
                    game.source_event_id,
                    event["id"],
                )
                game.source_event_id = event["id"]

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
        if auto_accept:
            game.needs_review = False

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


def sync_all_games(
    db: Session,
    errors: list[str] | None = None,
    team_ids: list[int] | None = None,
    auto_accept: bool = False,
) -> int:
    """Runs unattended (nightly cron), so one team's failure must not abort every team
    after it -- log and move on instead.
    """
    query = select(Team).where(Team.ibasketball_team_url.is_not(None))
    if team_ids is not None:
        query = query.where(Team.id.in_(team_ids))
    teams = db.scalars(query).all()
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
            count = sync_team_games(db, team, auto_accept)
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
    """Fill-only: creates missing players, fills a missing image and each image's face focus. Never overwrites admin edits,
    never deletes.

    Players are matched by the roster card's href (Player.source_url), so renamed or soft-deleted
    players are not re-imported. An unknown href adopts this team's same-name player (preferring a
    live row) and re-keys its source_url, so a re-published player link creates no duplicate.
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
        # ponytail: unknown href falls back to name; two distinct same-name players on one team
        # would be merged (upgrade path: numeric SportsPress player id)
        player = href and db.scalar(
            select(Player).where(Player.team_id == team.id, Player.source_url == href)
        )
        if not player:
            player = db.scalar(
                select(Player)
                .where(Player.team_id == team.id, Player.name == name)
                .order_by(Player.deleted_at.is_not(None), Player.id)
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
        for image in player.images:
            if image.focus_x is None:
                try:
                    data = _get_image(image.url)
                except httpx.HTTPError:
                    log.warning("Could not fetch player image %s", image.url, exc_info=True)
                    continue
                image.focus_x, image.focus_y, image.zoom = face_focus(data)

    db.commit()
    return count


def sync_all_players(
    db: Session, errors: list[str] | None = None, team_ids: list[int] | None = None
) -> int:
    # ponytail: 3rd copy of the per-team loop; extract a helper if a 4th scraper appears
    query = select(Team).where(Team.ibasketball_team_url.is_not(None))
    if team_ids is not None:
        query = query.where(Team.id.in_(team_ids))
    teams = db.scalars(query).all()
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
