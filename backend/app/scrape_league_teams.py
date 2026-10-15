"""On-demand, cached list of a league's teams from ibasketball's SportsPress API (#350)."""

import html
import logging
import time

import httpx
from bbstats import http_url_or_none
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Team, TeamRequest
from app.scrape_club import _team_code
from app.scrape_games import BASE, ibasketball_url_or_none

log = logging.getLogger(__name__)
TTL = 24 * 60 * 60
FAIL_TTL = 60  # a failed fetch is remembered briefly so an ibasketball outage can't tie up every worker thread (#366)
_cache: dict[int, tuple[float, list[dict] | None]] = {}  # None = recent failure


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


def _raw_teams(league_ibasketball_id: int) -> list[dict]:
    cached = _cache.get(league_ibasketball_id)
    if cached and time.monotonic() - cached[0] < (TTL if cached[1] is not None else FAIL_TTL):
        if cached[1] is None:
            raise httpx.HTTPError(f"League {league_ibasketball_id}: ibasketball failed under {FAIL_TTL}s ago, not retrying yet")
        return cached[1]
    try:
        fetched = _fetch(league_ibasketball_id)
    except httpx.HTTPError:
        _cache[league_ibasketball_id] = (time.monotonic(), None)
        raise
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
    _cache[league_ibasketball_id] = (time.monotonic(), rows)
    return rows


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
