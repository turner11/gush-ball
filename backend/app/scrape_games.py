"""Pulls schedule/results + opponent logos from ibasketball.co.il's SportsPress JSON API
into the Game table. See GitHub issue #14. #16 stores a diff suggestion (not applied) when
a re-scrape disagrees with an admin-overridden game, for the admin to accept/reject; #17
adds the nightly trigger. This module is a manual, synchronous entry point until then.
"""

import functools
import html
import logging
import time
from datetime import datetime
from typing import Any
from urllib.parse import urljoin, urlsplit

import cv2
import httpx
import numpy as np
from bbstats import http_url_or_none
from bs4 import BeautifulSoup
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import (
    Club,
    Game,
    GameStatus,
    League,
    Opponent,
    Player,
    PlayerImage,
    Team,
    get_or_create_club,
    get_or_create_opponent,
)

BASE = "https://ibasketball.co.il/wp-json"
CRAWL_DELAY = 10
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # same cap as routers/uploads.py
AJAX_URL = "https://ibasketball.co.il/wp-admin/admin-ajax.php"
NO_IMAGE_MARKER = "player-no-image"  # ibasketball's m-/f- silhouette; not a real photo

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
    time.sleep(CRAWL_DELAY)
    data = b""
    with httpx.stream("GET", url, timeout=30) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            data += chunk
            if len(data) > MAX_IMAGE_BYTES:
                log.warning("Player image %s exceeds %d bytes; skipped", url, MAX_IMAGE_BYTES)
                return b""  # face_focus(b"") stores the default focus, so it is not retried nightly
    return data


def _is_trusted_image_url(url: str) -> bool:
    if urlsplit(url).hostname == urlsplit(BASE).hostname:
        return True
    public_url = settings.object_storage_public_url.rstrip("/")
    return bool(public_url) and url.startswith(public_url + "/")


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


def _largest_face(gray) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) of the largest face in a grayscale image, or None."""
    m = min(gray.shape)
    faces = _CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(m // 10, m // 10)
    )
    if len(faces) == 0:
        return None
    return tuple(int(v) for v in max(faces, key=lambda f: f[2] * f[3]))


def face_focus(data: bytes) -> tuple[float, float, float]:
    """Focus for the largest face; (50, 0, 1) (the old top-anchored look) if none or undecodable."""
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE) if data else None
    if img is None:
        return 50.0, 0.0, 1.0
    face = _largest_face(img)
    if face is None:
        return 50.0, 0.0, 1.0
    return _focus(img.shape[1], img.shape[0], face)


def _fetch_team_page(url: str) -> BeautifulSoup | None:
    """The parsed team page; None on fetch error, so a failure never loses the games sync."""
    try:
        return BeautifulSoup(_get_page(url), "html.parser")
    except httpx.HTTPError:
        log.warning("Could not fetch team page %s", url, exc_info=True)
        return None


def _venue(page: BeautifulSoup) -> str:
    """Home court from the venue link ("" if the page has none).

    Never reads div.data-address: that is the club's contact address, not the court.
    """
    node = page.select_one("div.data-venue a")
    return "" if node is None else node.get_text(strip=True)[:300]


def _scrape_address(url: str) -> str | None:
    """Venue of a team page; None on fetch error."""
    page = _fetch_team_page(url)
    return None if page is None else _venue(page)


def _club_needs_scrape(db: Session, team: Team) -> bool:
    club = db.scalar(select(Club).where(Club.name == team.club)) if team.club else None
    return club is None or club.ibasketball_url is None


def _club_link(page: BeautifulSoup) -> tuple[str, str] | None:
    """(name, url) of the club a team page links to; None if absent or not an http(s) url."""
    link = page.select_one("div.data-club a[href]")
    url = http_url_or_none(link["href"]) if link is not None else None
    return None if url is None else (link.get_text(strip=True), url)


def _page_club(db: Session, current: str | None, name: str, url: str) -> str | None:
    """The club name for a team page's club link. Fill-only: keeps the team's `current` club, fills a missing club
    url, and never renames a club or takes a url another club already owns (None, with a warning)."""
    by_url = db.scalar(select(Club).where(Club.ibasketball_url == url))
    club = (
        get_or_create_club(db, current) if current else by_url or get_or_create_club(db, name[:120])
    )
    if club.ibasketball_url is None and by_url is None:
        club.ibasketball_url = url
    if club.ibasketball_url != url:
        log.warning(
            "Club %r has url %s, page says %s (%r); not changing",
            club.name,
            club.ibasketball_url,
            url,
            name,
        )
        return None
    return club.name


def team_page_club(db: Session, team_url: str) -> str | None:
    """Club name from one team page (#351); None if it has no club link or the fetch fails (a request without a
    club goes to a full admin)."""
    try:
        # ponytail: not `_get`, which sleeps CRAWL_DELAY and a user is waiting; the per-user pending cap bounds this
        resp = httpx.get(team_url, timeout=15)
        resp.raise_for_status()
    except httpx.HTTPError:
        log.warning("Could not fetch team page %s", team_url, exc_info=True)
        return None
    link = _club_link(BeautifulSoup(resp.text, "html.parser"))
    return None if link is None else _page_club(db, None, *link)


def _roll_league(db: Session, team: Team, league_ids: list[int]) -> None:
    """Season rollover (#352): moves a stale league URL to the team's one current-season league;
    an admin-overridden URL gets a suggestion instead."""
    leagues = list(db.scalars(select(League)))
    if team.ibasketball_league_url in {league.url for league in leagues}:
        team.league_url_suggestion = None  # already current, even if the admin chose it
        return
    candidates = [league.url for league in leagues if league.ibasketball_id in league_ids]
    if len(candidates) != 1:
        team.league_url_suggestion = None
        log.info(
            "Team %s: %d current-season league candidates, not moving", team.slug, len(candidates)
        )
        return
    if team.league_url_overridden:
        team.league_url_suggestion = candidates[0]
        log.info("Team %s: suggesting league %s (url is admin-set)", team.slug, candidates[0])
        return
    log.info("Team %s: league %s -> %s", team.slug, team.ibasketball_league_url, candidates[0])
    team.ibasketball_league_url = candidates[0]
    team.league_url_suggestion = None


def _resolve_opponent(db: Session, data: dict[str, Any]) -> Opponent:
    name = html.unescape(data["title"]["rendered"])
    opponent = get_or_create_opponent(db, name)
    opponent.source_url = http_url_or_none(
        data["link"]
    )  # the link is the source id: newest published link wins
    if opponent.logo_url is None:
        media = data.get("_embedded", {}).get("wp:featuredmedia") or []
        opponent.logo_url = http_url_or_none(media[0]["source_url"]) if media else None
    # ponytail: "" = page has no address (never refetched); None = fetch failed, retried next sync
    if opponent.address is None and opponent.source_url:
        opponent.address = _scrape_address(opponent.source_url)
    return opponent


# ponytail: per-run cache (sync_all clears it); the league re-publishes posts under new ids, so don't keep it longer
@functools.cache
def _sp_team(team_url: str) -> dict[str, Any]:
    slug = team_url.rstrip("/").rsplit("/", 1)[-1]
    teams = _get_json("/sportspress/v2/teams", slug=slug)
    if not teams:
        raise ValueError(f"No SportsPress team found for slug {slug!r}")
    return teams[0]


def _fetch_opponents(events: list[dict[str, Any]], sp_id: int) -> dict[int, dict[str, Any]]:
    """All opponents of this team's two-team events, in one request (not one per opponent)."""
    ids = {
        o
        for e in events
        if sp_id in e["teams"] and len(e["teams"]) == 2
        for o in e["teams"]
        if o != sp_id
    }
    if not ids:
        return {}
    # ponytail: assumes <= 100 opponents per team feed (one page)
    teams = _get_json(
        "/sportspress/v2/teams",
        include=",".join(map(str, sorted(ids))),
        per_page=100,
        _embed="wp:featuredmedia",
    )
    by_id = {t["id"]: t for t in teams}
    for opp_sp_id in ids:
        if opp_sp_id not in by_id:
            raise ValueError(f"SportsPress team {opp_sp_id} missing from include batch")
    return by_id


def sync_team_games(db: Session, team: Team, auto_accept: bool = False) -> int:
    sp_team = _sp_team(team.ibasketball_team_url)
    sp_id = sp_team["id"]
    _roll_league(db, team, sp_team.get("leagues", []))
    # Fill-only: an admin-entered address, club name or club url is never clobbered. One page fetch serves all.
    if team.home_court_address is None or _club_needs_scrape(db, team):
        page = _fetch_team_page(team.ibasketball_team_url)
        if page is not None:
            if team.home_court_address is None:
                team.home_court_address = _venue(page)
            link = _club_link(page)
            if link is not None:
                team.club = _page_club(db, team.club, *link) or team.club

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

    opponent_details = _fetch_opponents(events, sp_id)
    opponents: dict[int, Opponent] = {}
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

        # Per-team lookup: a derby event is one row per club team, and another team's row is never touched.
        game = db.scalar(
            select(Game).where(Game.team_id == team.id, Game.source_event_id == event["id"])
        )

        if opp_sp_id not in opponents:
            opponents[opp_sp_id] = _resolve_opponent(db, opponent_details[opp_sp_id])
        opponent = opponents[opp_sp_id]

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
    """Fill-only: creates missing players, fills a missing image, and fills face focus for every
    image of the team's live players. Never overwrites admin edits, never deletes.

    Players are matched by the roster card's href (Player.source_url), so renamed or soft-deleted
    players are not re-imported. An unknown href adopts this team's same-name player (preferring a
    live row) and re-keys its source_url, so a re-published player link creates no duplicate.
    A soft-deleted twin's href moves to the live same-name player.
    """
    sp_id = _sp_team(team.ibasketball_team_url)["id"]
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
        if player and player.deleted_at is not None:
            live_twin = db.scalar(
                select(Player)
                .where(Player.team_id == team.id, Player.name == name, Player.deleted_at.is_(None))
                .order_by(Player.id)
            )
            if live_twin is not None:
                player.source_url = None
                live_twin.source_url = href
                player = live_twin
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
        if url and len(url) <= 500 and NO_IMAGE_MARKER not in url and not player.images:
            player.images.append(PlayerImage(url=url))

    # every image of the team's live players, not just roster-card matches (admin-added images too)
    db.flush()  # new players' images must be visible to the query
    unfocused = db.scalars(
        select(PlayerImage)
        .join(Player)
        .where(
            Player.team_id == team.id,
            Player.deleted_at.is_(None),
            PlayerImage.focus_x.is_(None),
        )
    ).all()
    for image in unfocused:
        # ponytail: hotlinked admin images on other hosts stay unfocused (default framing); never fetched (SSRF)
        if not _is_trusted_image_url(image.url):
            continue
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
