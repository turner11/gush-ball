from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import scrape
from app.models import Team
from app.routers import sync as sync_router


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
