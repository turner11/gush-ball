"""Pulls league standings from ibasketball.co.il's static standings table into the
StandingRow table. See GitHub issue #13. Standings have no override-protection concept
(that's a Games-only mechanic, #16) -- this scraper always upserts.
"""

import logging
import time

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import StandingRow, Team

CRAWL_DELAY = 10
log = logging.getLogger(__name__)

# Maps a StandingRow field name to the table's `data-*` td class. Two source columns
# (data-lt technical fouls, data-bd point differential) have no matching StandingRow
# column and are skipped.
_COLUMN_MAP = {
    "rank": "data-rank",
    "played": "data-gp",
    "won": "data-w",
    "lost": "data-l",
    "points_for": "data-bf",
    "points_against": "data-ba",
    "points": "data-pts",
}


def _get_html(url: str) -> str:
    time.sleep(CRAWL_DELAY)
    response = httpx.get(url, timeout=30)
    response.raise_for_status()
    return response.text


def parse_league_table(html_text: str) -> tuple[str, list[dict[str, str | int]]]:
    soup = BeautifulSoup(html_text, "html.parser")

    # ponytail: league name comes from "{league name} - IBBA" in <title>, not a
    # documented API contract -- breaks silently if the site's title format changes
    # or a league name legitimately contains " - ".
    league_name = soup.title.string.rsplit(" - ", 1)[0].strip()

    table = soup.find("table", class_="sp-league-table")
    if table is None:
        raise ValueError("No sp-league-table found on page")

    rows: list[dict[str, str | int]] = []
    for tr in table.find("tbody").find_all("tr"):
        name_cell = tr.find("td", class_="data-name")
        row: dict[str, str | int] = {"team_name": name_cell.get_text(strip=True)}
        for field, css_class in _COLUMN_MAP.items():
            row[field] = int(tr.find("td", class_=css_class).get_text(strip=True))
        rows.append(row)

    return league_name, rows


def sync_team_standings(db: Session, team: Team) -> int:
    html_text = _get_html(team.ibasketball_league_url)
    league_name, rows = parse_league_table(html_text)

    count = 0
    for row in rows:
        standing = db.scalar(
            select(StandingRow).where(
                StandingRow.league_name == league_name,
                StandingRow.team_name == row["team_name"],
            )
        )
        if standing is None:
            standing = StandingRow(league_name=league_name, team_name=row["team_name"])
            db.add(standing)

        standing.rank = row["rank"]
        standing.played = row["played"]
        standing.won = row["won"]
        standing.lost = row["lost"]
        standing.points_for = row["points_for"]
        standing.points_against = row["points_against"]
        standing.points = row["points"]
        count += 1

    db.commit()
    return count


def sync_all_standings(db: Session) -> int:
    """Runs unattended (nightly cron, #17), so one team's fragile parse failing must not
    abort every team after it in iteration order -- log and move on instead.
    """
    teams = db.scalars(select(Team).where(Team.ibasketball_league_url.is_not(None)))
    total = 0
    for team in teams:
        # Captured before the try: a DB-level failure below expires every object in the
        # session, so reading team.slug afterwards (e.g. in the except block) would itself
        # need a fresh query -- one the still-failed transaction can't run yet.
        slug = team.slug
        try:
            total += sync_team_standings(db, team)
        except Exception:
            log.exception("Standings sync failed for team %r", slug)
            # A DB-level failure mid-flush leaves the session's transaction rolled back but
            # still "dirty" -- without this, every later team's db.commit() would raise
            # PendingRollbackError instead of syncing.
            db.rollback()
    return total


if __name__ == "__main__":
    with SessionLocal() as db:
        print(sync_all_standings(db))
