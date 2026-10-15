"""Refills the League table with the current season's non-empty leagues from ibasketball.co.il's
SportsPress `leagues` endpoint (#349)."""

import html
import logging
import re
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import League
from app.scrape_games import BASE, _get

log = logging.getLogger(__name__)

FIELDS = "id,name,slug,parent,count,link"


def _get_all(path: str, **params: Any) -> list[dict]:
    """Every page of a WP collection; the X-WP-TotalPages header avoids requesting a page past the end (400)."""
    items: list[dict] = []
    page, total_pages = 1, 1
    while page <= total_pages:
        resp = _get(BASE + path, per_page=100, page=page, **params)
        items += resp.json()
        total_pages = int(resp.headers["X-WP-TotalPages"])
        page += 1
    return items


def _current_season_root(roots: list[dict]) -> tuple[int, int]:
    """(root id, start year) of the newest `YYYY-YYYY` root; other roots are junk."""
    # ponytail: switches to next season once it has a non-empty league; the empty guard keeps old rows until then (#352 owns rollover)
    seasons = [(int(r["name"][:4]), r["id"]) for r in roots if re.fullmatch(r"\d{4}-\d{4}", r["name"])]
    if not seasons:
        raise ValueError("no YYYY-YYYY season root among leagues")
    year, root_id = max(seasons)
    return root_id, year


def sync_leagues(db: Session, errors: list[str] | None = None) -> int:
    try:
        roots = _get_all("/sportspress/v2/leagues", parent=0, _fields=FIELDS)
        root_id, year = _current_season_root(roots)
        children = _get_all("/sportspress/v2/leagues", parent=root_id, _fields=FIELDS)
        leagues = [c for c in children if c["count"] > 0]
        if not leagues:
            raise ValueError(f"season {year} (root {root_id}) has no non-empty leagues")
        existing = {lg.ibasketball_id: lg for lg in db.scalars(select(League))}
        for item in leagues:
            row = existing.get(item["id"]) or League(ibasketball_id=item["id"])
            row.name, row.url, row.season = html.unescape(item["name"]), item["link"], year
            db.add(row)
        db.execute(delete(League).where(League.ibasketball_id.not_in([lg["id"] for lg in leagues])))
        db.commit()
        return len(leagues)
    except Exception as exc:
        log.exception("Leagues sync failed")
        if errors is not None:
            errors.append(f"leagues: {exc}")
        db.rollback()
        return 0
