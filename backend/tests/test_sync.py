from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import scrape
from app.models import Game, GameStatus, League, Opponent, Team
from app.routers import sync as sync_router
from app.scrape import ISRAEL
from tests import test_scrape_games as tsg


@pytest.fixture()
def stub_scrapers(monkeypatch: pytest.MonkeyPatch) -> Generator[dict[str, Any], None, None]:
    """Monkeypatch the scraper entry points the router delegates to; records calls."""
    calls: dict[str, Any] = {"standings": 0, "games": 0, "players": 0, "leagues": 0}

    def _fake_sync_all_standings(db: Any, errors: Any = None, **kw: Any) -> int:
        calls["standings"] += 1
        calls["standings_kw"] = kw
        return 0

    def _fake_sync_all_games(db: Any, errors: Any = None, **kw: Any) -> int:
        calls["games"] += 1
        calls["games_kw"] = kw
        return 0

    monkeypatch.setattr(scrape, "sync_all_standings", _fake_sync_all_standings)
    monkeypatch.setattr(scrape, "sync_all_games", _fake_sync_all_games)

    def _fake_sync_all_players(db: Any, errors: Any = None, **kw: Any) -> int:
        calls["players"] += 1
        calls["players_kw"] = kw
        return 0

    monkeypatch.setattr(scrape, "sync_all_players", _fake_sync_all_players)

    def _fake_sync_leagues(db: Any, errors: Any = None) -> int:
        calls["leagues"] += 1
        return 0

    monkeypatch.setattr(scrape, "sync_leagues", _fake_sync_leagues)
    yield calls


def test_sync_now_requires_admin(client: TestClient) -> None:
    response = client.post("/sync/now")
    assert response.status_code == 401


def test_sync_now_starts_background_sync_and_returns_202(
    admin_client: TestClient, stub_scrapers: dict[str, Any]
) -> None:
    response = admin_client.post("/sync/now")

    assert response.status_code == 202
    assert response.json() == {"status": "started"}
    assert stub_scrapers["standings"] == 1
    assert stub_scrapers["games"] == 1
    assert stub_scrapers["players"] == 1


def test_sync_now_returns_409_when_already_running(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync_router, "_running", True)

    response = admin_client.post("/sync/now")

    assert response.status_code == 409


def test_sync_status_requires_admin(client: TestClient) -> None:
    assert client.get("/sync/status").status_code == 401


def test_sync_status_reports_last_result(
    admin_client: TestClient, stub_scrapers: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync_router, "_last", None)
    initial = admin_client.get("/sync/status").json()
    assert initial["finished_at"] is None
    assert initial["elapsed_seconds"] is None

    admin_client.post("/sync/now")
    body = admin_client.get("/sync/status").json()

    assert body["running"] is False
    assert body["standings"] == 0
    assert body["games"] == 0
    assert body["players"] == 0
    assert body["errors"] == []
    assert body["finished_at"] is not None
    assert isinstance(body["elapsed_seconds"], int)


def test_sync_now_allowed_for_team_admin(
    team_admin_client: TestClient, stub_scrapers: dict[str, Any]
) -> None:
    assert team_admin_client.post("/sync/now").status_code == 202


def test_sync_now_forwards_kinds_teams_and_auto_accept(
    admin_client: TestClient, stub_scrapers: dict[str, Any], own_team: Team
) -> None:
    response = admin_client.post(
        "/sync/now", json={"team_ids": [own_team.id], "kinds": ["games"], "auto_accept": False}
    )

    assert response.status_code == 202
    assert stub_scrapers["games"] == 1
    assert stub_scrapers["games_kw"] == {"team_ids": [own_team.id], "auto_accept": False}
    assert stub_scrapers["standings"] == 0
    assert stub_scrapers["players"] == 0
    body = admin_client.get("/sync/status").json()
    assert body["standings"] is None
    assert body["players"] is None
    assert body["games"] == 0


@pytest.mark.parametrize("kwargs", [{}, {"json": {}}])
def test_sync_now_defaults_all_kinds_all_teams_auto_accept(
    admin_client: TestClient, stub_scrapers: dict[str, Any], kwargs: dict[str, Any]
) -> None:
    assert admin_client.post("/sync/now", **kwargs).status_code == 202

    assert (stub_scrapers["standings"], stub_scrapers["games"], stub_scrapers["players"]) == (1, 1, 1)
    assert stub_scrapers["standings_kw"] == {"team_ids": None}
    assert stub_scrapers["games_kw"] == {"team_ids": None, "auto_accept": True}
    assert stub_scrapers["players_kw"] == {"team_ids": None}
    assert stub_scrapers["leagues"] == 1


def test_team_admin_sync_is_scoped_to_own_team(
    team_admin_client: TestClient, stub_scrapers: dict[str, Any], own_team: Team
) -> None:
    assert team_admin_client.post("/sync/now", json={}).status_code == 202

    assert stub_scrapers["games_kw"]["team_ids"] == [own_team.id]
    assert stub_scrapers["standings_kw"]["team_ids"] == [own_team.id]
    assert stub_scrapers["players_kw"]["team_ids"] == [own_team.id]
    assert stub_scrapers["leagues"] == 0


def test_team_admin_cannot_sync_other_team(
    team_admin_client: TestClient, stub_scrapers: dict[str, Any], db_session: Session
) -> None:
    other = Team(name="Other", slug="other")
    db_session.add(other)
    db_session.commit()

    response = team_admin_client.post("/sync/now", json={"team_ids": [other.id]})

    assert response.status_code == 403
    assert (stub_scrapers["standings"], stub_scrapers["games"], stub_scrapers["players"]) == (0, 0, 0)
    assert sync_router._running is False


def test_sync_now_rejects_empty_kinds(admin_client: TestClient, stub_scrapers: dict[str, Any]) -> None:
    assert admin_client.post("/sync/now", json={"kinds": []}).status_code == 422


def test_club_admin_sync_defaults_to_club_teams(
    club_admin_client: TestClient,
    stub_scrapers: dict[str, Any],
    own_team: Team,
    sibling_team: Team,
    db_session: Session,
) -> None:
    assert club_admin_client.post("/sync/now", json={}).status_code == 202
    assert sorted(stub_scrapers["games_kw"]["team_ids"]) == sorted([own_team.id, sibling_team.id])

    other = Team(name="Other", slug="other")
    db_session.add(other)
    db_session.commit()
    assert club_admin_client.post("/sync/now", json={"team_ids": [other.id]}).status_code == 403
    assert sync_router._running is False


@pytest.mark.parametrize("run_scope", ["all", "partial"])
def test_team_admin_sync_status_hides_runs_outside_scope(
    team_admin_client: TestClient,
    own_team: Team,
    other_team: Team,
    monkeypatch: pytest.MonkeyPatch,
    run_scope: str,
) -> None:
    team_ids = None if run_scope == "all" else [own_team.id, other_team.id]
    monkeypatch.setattr(
        sync_router,
        "_last",
        {
            "team_ids": team_ids,
            "errors": ["boom other"],
            "games": 3,
            "failed": False,
            "finished_at": datetime.now(UTC),
        },
    )

    response = team_admin_client.get("/sync/status")

    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == []
    assert body["finished_at"] is None
    assert body["games"] is None
    assert body["running"] is sync_router._running


def test_team_admin_sync_status_shows_own_run(
    team_admin_client: TestClient, stub_scrapers: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync_router, "_last", None)
    team_admin_client.post("/sync/now")

    body = team_admin_client.get("/sync/status").json()

    assert body["finished_at"] is not None
    assert body["errors"] == []


def test_team_admin_sync_status_shows_own_failed_run(
    team_admin_client: TestClient, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(sync_router, "_last", None)
    monkeypatch.setattr(sync_router, "sync_all", _boom)

    assert team_admin_client.post("/sync/now", json={"team_ids": [own_team.id]}).status_code == 202
    body = team_admin_client.get("/sync/status").json()

    assert body["failed"] is True
    assert body["errors"] == ["boom"]


def test_sync_all_runs_each_kind_in_its_own_scrape_transaction(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    import sentry_sdk

    seen: dict[str, Any] = {}

    def _stub(kind: str):
        def _fake(db: Any, errors: Any = None, **kw: Any) -> int:
            seen[kind] = sentry_sdk.get_current_span()
            return 0

        return _fake

    monkeypatch.setattr(scrape, "sync_all_standings", _stub("standings"))
    monkeypatch.setattr(scrape, "sync_all_games", _stub("games"))
    monkeypatch.setattr(scrape, "sync_all_players", _stub("players"))
    monkeypatch.setattr(scrape, "sync_leagues", _stub("leagues"))
    scrape.sync_all(db_session)
    transactions = {kind: span.containing_transaction for kind, span in seen.items()}
    assert len({id(t) for t in transactions.values()}) == 4  # own 1000-span budget per kind
    assert {kind: (t.op, t.name) for kind, t in transactions.items()} == {
        "standings": ("scrape", "standings"),
        "games": ("scrape", "games"),
        "players": ("scrape", "players"),
        "leagues": ("scrape", "leagues"),
    }


def test_sync_all_refreshes_leagues_only_on_unscoped_run(db_session: Session, stub_scrapers: dict[str, Any]) -> None:
    scrape.sync_all(db_session, team_ids=[1])
    assert stub_scrapers["leagues"] == 0
    scrape.sync_all(db_session)
    assert stub_scrapers["leagues"] == 1


def test_sync_all_refreshes_leagues_before_games_and_standings(
    db_session: Session, stub_scrapers: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    order: list[str] = []
    for kind, attr in [("leagues", "sync_leagues"), ("games", "sync_all_games"), ("standings", "sync_all_standings")]:
        monkeypatch.setattr(scrape, attr, lambda *a, _k=kind, **kw: order.append(_k))

    scrape.sync_all(db_session)

    assert order == ["leagues", "games", "standings"]


TEAM_URL = "https://ibasketball.co.il/team/1/"
LEAGUE_URL = "https://ibasketball.co.il/league/77/"


def _evening(day_offset: int = 0, hour: int = 21) -> datetime:
    """Israel wall time `hour`:00 on today+offset (aware, like `now` in sync_tonight)."""
    today = datetime.now(ISRAEL).replace(hour=hour, minute=0, second=0, microsecond=0)
    return today + timedelta(days=day_offset)


def _game(db: Session, team: Team, at: datetime, **kw: Any) -> Game:
    opponent = Opponent(name="Opp", logo_url="https://x/logo.png")
    db.add(opponent)
    db.flush()
    game = Game(team_id=team.id, opponent_id=opponent.id, scheduled_at=at.replace(tzinfo=None), **kw)
    db.add(game)
    db.commit()
    return game


@pytest.fixture()
def tonight_teams(db_session: Session) -> dict[str, Team]:
    teams = {
        k: Team(name=k, slug=k, ibasketball_team_url=None if k == "D" else f"{TEAM_URL}{k}")
        for k in "ABCDE"
    }
    db_session.add_all(teams.values())
    db_session.commit()
    _game(db_session, teams["A"], _evening(hour=20))
    _game(db_session, teams["B"], _evening(), status=GameStatus.FINAL, team_score=80, opponent_score=70)
    _game(db_session, teams["C"], _evening(-1))
    _game(db_session, teams["D"], _evening())
    _game(db_session, teams["E"], _evening(1))
    return teams


def test_tonight_team_ids_selects_only_todays_unscored_games(
    db_session: Session, tonight_teams: dict[str, Team]
) -> None:
    assert scrape.tonight_team_ids(db_session, scrape.tonight_day(_evening())) == [tonight_teams["A"].id]


def test_tonight_team_ids_midnight_run_covers_day_that_ended(
    db_session: Session, tonight_teams: dict[str, Team]
) -> None:
    midnight = _evening(1, hour=0)
    assert scrape.tonight_team_ids(db_session, scrape.tonight_day(midnight)) == [tonight_teams["A"].id]


def test_sync_tonight_makes_no_requests_without_games(db_session: Session, stub_scrapers: dict[str, Any]) -> None:
    assert scrape.sync_tonight(db_session, _evening()) is None
    assert [stub_scrapers[k] for k in ("games", "standings", "players", "leagues")] == [0, 0, 0, 0]


def test_sync_tonight_runs_only_games_and_standings(
    db_session: Session, stub_scrapers: dict[str, Any], tonight_teams: dict[str, Team]
) -> None:
    scrape.sync_tonight(db_session, _evening())

    a = tonight_teams["A"].id
    assert stub_scrapers["games_kw"]["team_ids"] == [a]
    assert stub_scrapers["standings_kw"]["team_ids"] == [a]
    assert stub_scrapers["players"] == 0
    assert stub_scrapers["leagues"] == 0


def test_thin_run_routes_overridden_score_to_review(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = _evening()
    team = Team(name="T", slug="t", ibasketball_team_url=TEAM_URL)
    db_session.add(team)
    db_session.commit()
    game = _game(db_session, team, now, source_event_id=9001, is_scraped=True, is_manually_overridden=True)
    event = {**tsg.FUTURE_EVENT, "date": now.strftime("%Y-%m-%dT%H:%M:%S"), "status": "publish", "main_results": [90, 88]}
    monkeypatch.setattr(tsg.scrape_games, "_get_json", tsg.FakeApi([event]))
    monkeypatch.setattr(tsg.scrape_games, "_get_page", lambda url: "")
    monkeypatch.setattr(scrape, "sync_all_standings", lambda db, errors=None, **kw: 0)

    scrape.sync_tonight(db_session, now)

    db_session.refresh(game)
    assert (game.scrape_suggestion["team_score"], game.scrape_suggestion["opponent_score"]) == (90, 88)
    assert game.team_score is None
    assert db_session.get(Opponent, game.opponent_id).logo_url == "https://x/logo.png"


def test_sync_league_runs_thin_for_teams_in_league(
    admin_client: TestClient, db_session: Session, stub_scrapers: dict[str, Any], own_team: Team, other_team: Team
) -> None:
    db_session.add(League(ibasketball_id=77, name="L", url=LEAGUE_URL, season=2026))
    own_team.ibasketball_team_url, own_team.ibasketball_league_url = TEAM_URL, LEAGUE_URL
    other_team.ibasketball_team_url, other_team.ibasketball_league_url = TEAM_URL + "2", LEAGUE_URL + "other"
    db_session.commit()

    assert admin_client.post("/sync/league/77").status_code == 202

    assert stub_scrapers["games_kw"] == {"team_ids": [own_team.id], "auto_accept": True}
    assert stub_scrapers["standings_kw"] == {"team_ids": [own_team.id]}
    assert stub_scrapers["players"] == 0
    assert stub_scrapers["leagues"] == 0


def test_team_admin_cannot_sync_other_clubs_league(
    team_admin_client: TestClient, db_session: Session, stub_scrapers: dict[str, Any], other_team: Team
) -> None:
    db_session.add(League(ibasketball_id=77, name="L", url=LEAGUE_URL, season=2026))
    other_team.ibasketball_team_url, other_team.ibasketball_league_url = TEAM_URL, LEAGUE_URL
    db_session.commit()

    response = team_admin_client.post("/sync/league/77")

    assert response.status_code == 403
    assert "77" in response.json()["detail"]
    assert stub_scrapers["games"] == 0
    assert sync_router._running is False


def test_sync_league_returns_409_when_already_running(
    admin_client: TestClient, db_session: Session, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_session.add(League(ibasketball_id=77, name="L", url=LEAGUE_URL, season=2026))
    own_team.ibasketball_team_url, own_team.ibasketball_league_url = TEAM_URL, LEAGUE_URL
    db_session.commit()
    monkeypatch.setattr(sync_router, "_running", True)

    response = admin_client.post("/sync/league/77")

    assert response.status_code == 409
    assert response.json()["detail"] == "Sync already running"
