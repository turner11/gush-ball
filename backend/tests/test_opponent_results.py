from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import scrape_league_teams
from app.models import Game, GameStatus, League, Opponent, Team

LEAGUE_URL = "https://ibasketball.co.il/league/x/"
OPP_URL = "https://ibasketball.co.il/team/opp/"


@pytest.fixture(autouse=True)
def fake_fetch(monkeypatch: pytest.MonkeyPatch) -> dict:
    scrape_league_teams._cache.clear()
    state: dict[str, Any] = {"calls": 0, "events": [], "error": None}

    def fake(team_url: str, league_id: int) -> tuple[int, list[dict]]:
        state["calls"] += 1
        if state["error"]:
            raise state["error"]
        return 7, state["events"]

    monkeypatch.setattr(scrape_league_teams, "_fetch_opponent_events", fake)
    return state


def _setup(
    db: Session,
    *,
    league: bool = True,
    source_url: str | None = OPP_URL,
    needs_review: bool = False,
) -> Game:
    team = Team(name="T", slug="t", ibasketball_league_url=LEAGUE_URL)
    opponent = Opponent(name="O", source_url=source_url)
    db.add_all([team, opponent])
    if league:
        db.add(League(ibasketball_id=10, name="L", url=LEAGUE_URL, season=2026))
    db.flush()
    game = Game(
        team=team,
        opponent=opponent,
        scheduled_at=datetime(2026, 1, 1, tzinfo=UTC),
        status=GameStatus.SCHEDULED,
        needs_review=needs_review,
    )
    db.add(game)
    db.commit()
    return game


def _url(game: Game) -> str:
    return f"/teams/{game.team_id}/games/{game.id}/opponent-results"


def _event(date: str, teams: list[int], results: list | None) -> dict:
    return {"id": 1, "date": date, "teams": teams, "main_results": results}


def test_opponent_results_are_from_the_opponents_side(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    game = _setup(db_session)
    fake_fetch["events"] = [
        _event("2026-01-02T18:00:00", [7, 8], ["80", "70"]),  # opponent (7) is home
        _event("2026-01-09T18:00:00", [8, 7], ["60", "90"]),  # opponent is away
        _event("2026-01-16T18:00:00", [7, 8], None),  # unplayed
        _event("2026-01-23T18:00:00", [7, 8, 9], ["1", "2"]),  # three teams
    ]
    body = client.get(_url(game)).json()
    assert [(r["team_score"], r["opponent_score"]) for r in body] == [(80, 70), (90, 60)]


def test_opponent_results_empty_without_league_or_source_url_and_no_fetch(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    no_league = _setup(db_session, league=False)
    assert client.get(_url(no_league)).json() == []
    assert fake_fetch["calls"] == 0


def test_opponent_results_empty_without_source_url_and_no_fetch(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    game = _setup(db_session, source_url=None)
    assert client.get(_url(game)).json() == []
    assert fake_fetch["calls"] == 0


def test_opponent_results_cached_per_league_and_opponent(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    game = _setup(db_session)
    fake_fetch["events"] = [_event("2026-01-02T18:00:00", [7, 8], ["80", "70"])]
    assert client.get(_url(game)).status_code == 200
    assert client.get(_url(game)).status_code == 200
    assert fake_fetch["calls"] == 1


def test_opponent_results_502_on_ibasketball_failure_then_failure_cached(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    game = _setup(db_session)
    fake_fetch["error"] = httpx.ConnectError("down")
    assert client.get(_url(game)).status_code == 502
    assert client.get(_url(game)).status_code == 502
    assert fake_fetch["calls"] == 1


def test_opponent_results_404_for_unapproved_scraped_game_when_anonymous(
    client: TestClient, db_session: Session, fake_fetch: dict
) -> None:
    game = _setup(db_session, needs_review=True)
    assert client.get(_url(game)).status_code == 404
    assert fake_fetch["calls"] == 0
