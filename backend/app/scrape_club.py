"""Preview of the teams on an ibasketball club (אגודה) page, for bulk team creation."""

import re
from collections import defaultdict
from urllib.parse import unquote

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Team
from app.scrape_games import _get_json, _get_page

LOGO_MAX = 500  # Team.logo_url / Url500 width
ADDRESS_MAX = 300  # Team.home_court_address / Address width


def _team_code(url: str) -> str | None:
    """The IBBA code in a /team/<code>-<slug>/ URL; stable across percent-encoding and case."""
    match = re.search(r"/team/(\d+)", unquote(url))
    return match.group(1) if match else None


def parse_club_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    gallery = soup.select_one("div.team-gallery")
    if gallery is None:
        raise ValueError("No team gallery on club page")
    league_urls: dict[str, set[str]] = defaultdict(set)
    for a in soup.select("a.league.data-item:not(.tournament)[href]"):  # cups reuse league names
        league_urls[a.get_text(strip=True)].add(a["href"])
    rows = []
    for card in gallery.select("a.team[href]"):
        lines = list(card.stripped_strings)
        league_name = lines[1] if len(lines) > 1 else None
        hrefs = league_urls.get(league_name, set())
        rows.append(
            {
                "name": lines[0],
                "league_name": league_name,
                "ibasketball_team_url": card["href"],
                "ibasketball_league_url": next(iter(hrefs)) if len(hrefs) == 1 else None,
            }
        )
    return rows


def _fetch_logos_and_addresses(rows: list[dict]) -> None:
    """Fill logo_url / home_court_address from two REST calls (teams batch, venues batch)."""
    slugs = [r["ibasketball_team_url"].rstrip("/").rsplit("/", 1)[-1] for r in rows]
    # ponytail: one page (per_page=100); a club with more than 100 new teams would need paging
    teams = _get_json(
        "/sportspress/v2/teams", slug=",".join(slugs), per_page=100, _embed="wp:featuredmedia"
    )
    by_code = {_team_code(t["link"]): t for t in teams}
    venue_ids = sorted({v for t in teams for v in t.get("venues", [])})
    venues = (
        {
            v["id"]: v["name"]
            for v in _get_json(
                "/sportspress/v2/venues", include=",".join(map(str, venue_ids)), per_page=100
            )
        }
        if venue_ids
        else {}
    )
    for row in rows:
        team = by_code.get(_team_code(row["ibasketball_team_url"]))
        media = team.get("_embedded", {}).get("wp:featuredmedia") if team else None
        logo = media[0]["source_url"] if media else None
        row["logo_url"] = logo if logo and len(logo) <= LOGO_MAX else None
        venue = next((venues[v] for v in team.get("venues", []) if v in venues), None) if team else None
        row["home_court_address"] = venue[:ADDRESS_MAX] if venue else None


def _suggest_names(rows: list[dict], taken: set[str]) -> None:
    for row in rows:
        name, n = row["name"], 1
        while name in taken:
            n += 1
            name = f"{row['name']} {n}"
        taken.add(name)
        row["name"] = name


def preview_club_teams(db: Session, club_url: str) -> list[dict]:
    rows = parse_club_page(_get_page(club_url))
    existing = db.execute(select(Team.name, Team.ibasketball_team_url)).all()
    known_codes = {_team_code(url) for _, url in existing if url}
    rows = [r for r in rows if _team_code(r["ibasketball_team_url"]) not in known_codes]
    if not rows:
        return []
    _fetch_logos_and_addresses(rows)
    _suggest_names(rows, {name for name, _ in existing})
    return rows
