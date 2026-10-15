from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import scrape_league_teams
from app.models import League, Team
from app.models.team_request import TeamRequest


def _sp(title: str, code: int, logo: str | None = None) -> dict:
    item: dict[str, Any] = {
        "title": {"rendered": title},
        "link": f"https://ibasketball.co.il/team/{code}-x/",
    }
    if logo:
        item["_embedded"] = {"wp:featuredmedia": [{"source_url": logo}]}
    return item


@pytest.fixture(autouse=True)
def fake_fetch(monkeypatch: pytest.MonkeyPatch) -> dict:
    scrape_league_teams._cache.clear()
    state: dict[str, Any] = {"calls": 0, "items": [], "fail": False}

    def fake(league_id: int) -> list[dict]:
        state["calls"] += 1
        if state["fail"]:
            state["fail"] = False
            raise httpx.ConnectError("down")
        return state["items"]

    monkeypatch.setattr(scrape_league_teams, "_fetch", fake)
    return state


def _league(db: Session, ibasketball_id: int = 10, name: str = "ליגה") -> None:
    db.add(
        League(
            ibasketball_id=ibasketball_id,
            name=name,
            url=f"https://x/{ibasketball_id}/",
            season=2026,
        )
    )
    db.commit()


def _team(db: Session, name: str, slug: str, url: str | None) -> Team:
    team = Team(name=name, slug=slug, ibasketball_team_url=url)
    db.add(team)
    db.commit()
    return team


def test_list_leagues_is_public_and_sorted_by_name(client: TestClient, db_session: Session) -> None:
    _league(db_session, 1, "ב")
    _league(db_session, 2, "א")
    res = client.get("/leagues")
    assert res.status_code == 200
    assert [lg["name"] for lg in res.json()] == ["א", "ב"]
    assert set(res.json()[0]) == {"ibasketball_id", "name", "url"}


def test_league_teams_marks_our_teams_by_ibasketball_code_never_by_name(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    _league(db_session, 10, "ליגת א")
    ours = _team(db_session, "שלנו", "ours", "https://ibasketball.co.il/team/123-%d7%90/")
    _team(db_session, "אותו שם", "same", "https://ibasketball.co.il/team/999-x/")
    fake_fetch["items"] = [
        _sp("שלנו SP", 123, "https://img/a.png"),
        _sp("אותו שם", 456),
        _sp("א &#8211; ב", 789),
    ]
    body = client.get("/leagues/10/teams").json()
    assert body["league"]["name"] == "ליגת א"
    by_name = {t["name"]: t for t in body["teams"]}
    assert by_name["שלנו SP"]["team_id"] == ours.id
    assert by_name["שלנו SP"]["logo_url"] == "https://img/a.png"
    assert by_name["אותו שם"]["team_id"] is None
    assert by_name["אותו שם"]["logo_url"] is None
    assert "א – ב" in by_name


def test_league_teams_404_for_unknown_league_without_fetching(
    client: TestClient, fake_fetch: dict
) -> None:
    assert client.get("/leagues/999/teams").status_code == 404
    assert fake_fetch["calls"] == 0


def test_league_teams_cached_for_a_day(
    client: TestClient, db_session: Session, fake_fetch: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    _league(db_session)
    fake_fetch["items"] = [_sp("א", 5)]
    assert client.get("/leagues/10/teams").json()["teams"][0]["team_id"] is None
    team = _team(db_session, "א", "a", "https://ibasketball.co.il/team/5-a/")
    assert client.get("/leagues/10/teams").json()["teams"][0]["team_id"] == team.id
    assert fake_fetch["calls"] == 1
    now = scrape_league_teams.time.monotonic()
    monkeypatch.setattr(
        scrape_league_teams.time, "monotonic", lambda: now + scrape_league_teams.TTL + 1
    )
    client.get("/leagues/10/teams")
    assert fake_fetch["calls"] == 2


def test_league_teams_502_when_ibasketball_fails_and_failure_not_cached(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    _league(db_session)
    fake_fetch["fail"] = True
    assert client.get("/leagues/10/teams").status_code == 502
    assert client.get("/leagues/10/teams").status_code == 200


def test_league_teams_flags_pending_requests(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    _league(db_session)
    fake_fetch["items"] = [_sp("א", 1), _sp("ב", 2)]
    for code, status in ((1, "pending"), (2, "rejected")):
        db_session.add(
            TeamRequest(
                user_id=1,
                name="x",
                ibasketball_team_url=f"https://ibasketball.co.il/team/{code}-x/",
                ibasketball_league_url="https://x/10/",
                status=status,
            )
        )
    db_session.commit()
    flags = {t["name"]: t["requested"] for t in client.get("/leagues/10/teams").json()["teams"]}
    assert flags == {"א": True, "ב": False}
