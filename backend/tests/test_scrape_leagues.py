from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import scrape_leagues
from app.models import League

ROOTS = [
    {"id": 1, "name": "2025-2026", "link": "https://ibasketball.co.il/league/2025-2026/", "count": 0},
    {"id": 2, "name": "2026-2027", "link": "https://ibasketball.co.il/league/2026-2027/", "count": 0},
    {"id": 3, "name": "19015", "link": "https://ibasketball.co.il/league/19015/", "count": 0},
    {"id": 4, "name": "ליגה", "link": "https://ibasketball.co.il/league/x/", "count": 0},
]
PAGE1 = [
    {"id": 10, "name": "ליגת על", "link": "https://ibasketball.co.il/league/2026-7/", "count": 12},
    {"id": 11, "name": "ריק", "link": "https://ibasketball.co.il/league/2026-8/", "count": 0},
]
PAGE2 = [{"id": 12, "name": "א &#8211; ב", "link": "https://ibasketball.co.il/league/2026-9/", "count": 8}]


def _fake_get(children: dict[int, list[list[dict]]], calls: list[dict]):
    def fake(url: str, **params: Any) -> httpx.Response:
        calls.append(params)
        pages = [ROOTS] if params["parent"] == 0 else children.get(params["parent"], [[]])
        page = params.get("page", 1)
        return httpx.Response(200, json=pages[page - 1], headers={"X-WP-TotalPages": str(len(pages))})

    return fake


def test_sync_leagues_stores_current_season_non_empty_leagues(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(scrape_leagues, "_get", _fake_get({2: [PAGE1, PAGE2]}, calls))

    assert scrape_leagues.sync_leagues(db_session) == 2

    assert {c["parent"] for c in calls} == {0, 2}
    assert [c["page"] for c in calls if c["parent"] == 2] == [1, 2]
    rows = {r.ibasketball_id: r for r in db_session.scalars(select(League))}
    assert set(rows) == {10, 12}
    assert rows[12].name == "א – ב"
    assert rows[10].url == "https://ibasketball.co.il/league/2026-7/"
    assert rows[10].season == 2026


def test_sync_leagues_updates_by_ibasketball_id_and_drops_stale(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    old = League(ibasketball_id=10, name="old", url="u", season=2025)
    stale = League(ibasketball_id=99, name="stale", url="s", season=2025)
    db_session.add_all([old, stale])
    db_session.commit()
    old_id = old.id
    monkeypatch.setattr(scrape_leagues, "_get", _fake_get({2: [PAGE1, PAGE2]}, []))

    assert scrape_leagues.sync_leagues(db_session) == 2

    assert db_session.get(League, old_id).name == "ליגת על"
    assert db_session.scalar(select(League).where(League.ibasketball_id == 99)) is None


@pytest.mark.parametrize("failure", ["http", "empty"])
def test_sync_leagues_keeps_rows_and_reports_error_on_failure(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    db_session.add(League(ibasketball_id=99, name="keep", url="k", season=2025))
    db_session.commit()
    if failure == "http":

        def boom(url: str, **params: Any) -> httpx.Response:
            raise httpx.HTTPError("down")

        monkeypatch.setattr(scrape_leagues, "_get", boom)
    else:
        monkeypatch.setattr(scrape_leagues, "_get", _fake_get({2: [[PAGE1[1]]]}, []))
    errors: list[str] = []

    assert scrape_leagues.sync_leagues(db_session, errors) == 0

    assert len(errors) == 1 and errors[0].startswith("leagues:")
    assert [r.ibasketball_id for r in db_session.scalars(select(League))] == [99]


BAD_URLS = [
    "javascript:alert(1)",
    "http://169.254.169.254/latest/meta-data/",
    "https://evil.com/team/1-x/",
    "https://evil.com\\@ibasketball.co.il/team/1-x/",
]


@pytest.mark.parametrize("bad", BAD_URLS)
def test_sync_leagues_skips_league_with_non_ibasketball_link(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, bad: str
) -> None:
    db_session.add(League(ibasketball_id=11, name="poisoned", url="https://ibasketball.co.il/league/old/", season=2025))
    db_session.commit()
    page = [PAGE1[0], {"id": 11, "name": "רעיל", "link": bad, "count": 5}]
    monkeypatch.setattr(scrape_leagues, "_get", _fake_get({2: [page]}, []))

    assert scrape_leagues.sync_leagues(db_session) == 1

    rows = list(db_session.scalars(select(League)))
    assert [(r.ibasketball_id, r.url) for r in rows] == [(10, "https://ibasketball.co.il/league/2026-7/")]
