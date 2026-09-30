from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import scrape
from app.routers import sync as sync_router


@pytest.fixture()
def stub_scrapers(monkeypatch: pytest.MonkeyPatch) -> Generator[dict[str, Any], None, None]:
    """Monkeypatch the scraper entry points the router delegates to; records calls."""
    calls: dict[str, Any] = {"standings": 0, "games": 0, "players": 0}

    def _fake_sync_all_standings(db: Any, errors: Any = None) -> int:
        calls["standings"] += 1
        return 0

    def _fake_sync_all_games(db: Any, errors: Any = None) -> int:
        calls["games"] += 1
        return 0

    monkeypatch.setattr(scrape, "sync_all_standings", _fake_sync_all_standings)
    monkeypatch.setattr(scrape, "sync_all_games", _fake_sync_all_games)

    def _fake_sync_all_players(db: Any, errors: Any = None) -> int:
        calls["players"] += 1
        return 0

    monkeypatch.setattr(scrape, "sync_all_players", _fake_sync_all_players)
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
    assert admin_client.get("/sync/status").json()["finished_at"] is None

    admin_client.post("/sync/now")
    body = admin_client.get("/sync/status").json()

    assert body["running"] is False
    assert body["standings"] == 0
    assert body["games"] == 0
    assert body["players"] == 0
    assert body["errors"] == []
    assert body["finished_at"] is not None


def test_sync_now_allowed_for_team_admin(
    team_admin_client: TestClient, stub_scrapers: dict[str, Any]
) -> None:
    assert team_admin_client.post("/sync/now").status_code == 202
