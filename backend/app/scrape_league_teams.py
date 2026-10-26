"""On-demand, cached league data from ibasketball's SportsPress API: a league's teams (#350) and an opponent's
played results in it (#537)."""

import html
import logging
import time
from collections.abc import Callable
from typing import Any

import httpx
from bbstats import http_url_or_none
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Team, TeamRequest
from app.scrape_club import _team_code
from app.scrape_games import BASE, home_away_scores, ibasketball_url_or_none

log = logging.getLogger(__name__)
TTL = 24 * 60 * 60
FAIL_TTL = 60  # a failed fetch is remembered briefly so an ibasketball outage can't tie up every worker thread (#366)
_cache: dict[Any, tuple[float, Any]] = {}  # value None = recent failure


def _fetch(league_ibasketball_id: int) -> list[dict]:
    # ponytail: no crawl delay (user-facing latency), relying on the 1-day cache; bursts of uncached leagues hit
    # ibasketball back-to-back. Route through scrape_games._get_json if that becomes a problem.
    # ponytail: per-process dict, lost on restart, <=1 fetch/league/day; add a lock/shared cache if multiple workers
    # ponytail: no per-league lock; concurrent hits in the first <=15s of an outage all fetch, then the 60s failure
    # cache serves them
    # ponytail: one page (per_page=100); a league has far fewer teams
    resp = httpx.get(
        BASE + "/sportspress/v2/teams",
        params={"leagues": league_ibasketball_id, "per_page": 100, "_embed": "wp:featuredmedia"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _cached(key: Any, load: Callable[[], Any]) -> Any:
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < (TTL if cached[1] is not None else FAIL_TTL):
        if cached[1] is None:
            raise httpx.HTTPError(f"{key}: ibasketball failed under {FAIL_TTL}s ago, not retrying yet")
        return cached[1]
    try:
        value = load()
    except httpx.HTTPError:
        _cache[key] = (time.monotonic(), None)
        raise
    _cache[key] = (time.monotonic(), value)
    return value


def _raw_teams(league_ibasketball_id: int) -> list[dict]:
    return _cached(league_ibasketball_id, lambda: _parse_teams(_fetch(league_ibasketball_id)))


def _parse_teams(fetched: list[dict]) -> list[dict]:
    rows = []
    for t in fetched:
        url = ibasketball_url_or_none(t["link"])
        if url is None:
            log.warning("Skipping team %r with non-ibasketball link %r", t["title"]["rendered"], t["link"])
            continue
        media = t.get("_embedded", {}).get("wp:featuredmedia") or []
        rows.append(
            {
                "name": html.unescape(t["title"]["rendered"]),
                "logo_url": http_url_or_none(media[0]["source_url"]) if media else None,
                "ibasketball_team_url": url,
            }
        )
    rows.sort(key=lambda r: r["name"])
    return rows


def _fetch_opponent_events(team_url: str, league_ibasketball_id: int) -> tuple[int, list[dict]]:
    """(SportsPress team id, that team's events in the league). No crawl delay, as in `_fetch`."""
    slug = team_url.rstrip("/").rsplit("/", 1)[-1]
    found = httpx.get(BASE + "/sportspress/v2/teams", params={"slug": slug, "_fields": "id"}, timeout=15)
    found.raise_for_status()
    if not found.json():
        log.warning("No SportsPress team for %s", team_url)
        return 0, []
    sp_id = found.json()[0]["id"]
    # ponytail: one page (per_page=100); a team plays far fewer league games
    events = httpx.get(
        BASE + "/sportspress/v2/events",
        params={
            "teams": sp_id,
            "leagues": league_ibasketball_id,
            "per_page": 100,
            "_fields": "id,teams,main_results,date",
        },
        timeout=15,
    )
    events.raise_for_status()
    return sp_id, events.json()


def opponent_results(team_url: str, league_ibasketball_id: int) -> list[dict]:
    """The opponent's played two-team league games, each as {scheduled_at, team_score, opponent_score} from the
    opponent's side (`team_score` = the opponent's points), the shape `GameRead` has."""

    def load() -> list[dict]:
        sp_id, events = _fetch_opponent_events(team_url, league_ibasketball_id)
        results = []
        for event in events:
            try:
                scores = home_away_scores(event)
            except ValueError:
                log.warning("Skipping opponent event with bad main_results: %r", event)
                continue
            if scores is None or len(event["teams"]) != 2 or sp_id not in event["teams"]:
                continue
            mine, theirs = scores if event["teams"][0] == sp_id else scores[::-1]
            results.append({"scheduled_at": event["date"], "team_score": mine, "opponent_score": theirs})
        return results

    return _cached((league_ibasketball_id, team_url), load)


def league_teams(db: Session, league_ibasketball_id: int) -> list[dict]:
    """The league's teams, each with `team_id` of our matching team (by IBBA code, never name) or None, and
    `requested` when a team request for it is pending (#351)."""
    ours = {
        _team_code(url): team_id
        for team_id, url in db.execute(select(Team.id, Team.ibasketball_team_url))
        if url and _team_code(url)
    }
    pending = {
        _team_code(url)
        for url in db.scalars(select(TeamRequest.ibasketball_team_url).where(TeamRequest.status == "pending"))
    }
    return [
        {
            **row,
            "team_id": ours.get(_team_code(row["ibasketball_team_url"])),
            "requested": _team_code(row["ibasketball_team_url"]) in pending,
        }
        for row in _raw_teams(league_ibasketball_id)
    ]
