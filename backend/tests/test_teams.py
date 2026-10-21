import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import scrape_club
from app.models import Club, Team
from app.routers import teams as teams_router


def _create_team(admin_client: TestClient, name: str, **extra: str) -> dict:
    response = admin_client.post("/teams", json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_team_sets_unique_slug(admin_client: TestClient) -> None:
    first = _create_team(admin_client, "Team A")
    second = _create_team(admin_client, "Team A!!")
    assert first["slug"] == "team-a"
    assert second["slug"] == "team-a-2"


def test_create_team_rejects_invalid_hex_color(admin_client: TestClient) -> None:
    response = admin_client.post("/teams", json={"name": "Team B", "primary_color": "blue"})
    assert response.status_code == 422


def test_create_team_rejects_invalid_url(admin_client: TestClient) -> None:
    response = admin_client.post("/teams", json={"name": "Team C", "facebook_url": "not a url"})
    assert response.status_code == 422


def test_twitter_url_round_trips(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team T", twitter_url="https://x.com/club")
    assert admin_client.get(f"/teams/{created['id']}").json()["twitter_url"] == "https://x.com/club"
    admin_client.patch(f"/teams/{created['id']}", json={"twitter_url": "https://x.com/club2"})
    assert admin_client.get(f"/teams/{created['id']}").json()["twitter_url"] == "https://x.com/club2"


def test_wikipedia_url_round_trips(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team W", wikipedia_url="https://he.wikipedia.org/wiki/X")
    assert admin_client.get(f"/teams/{created['id']}").json()["wikipedia_url"] == "https://he.wikipedia.org/wiki/X"
    admin_client.patch(f"/teams/{created['id']}", json={"wikipedia_url": "https://en.m.wikipedia.org/wiki/Y"})
    assert admin_client.get(f"/teams/{created['id']}").json()["wikipedia_url"] == "https://en.m.wikipedia.org/wiki/Y"


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/wiki/X",
        "http://he.wikipedia.org/wiki/X",
        "https://he.wikipedia.org.evil.com/wiki/X",
        r"https://evil.com\@he.wikipedia.org/",
    ],
)
def test_wikipedia_url_rejects_non_wikipedia(admin_client: TestClient, url: str) -> None:
    response = admin_client.post("/teams", json={"name": "Team V", "wikipedia_url": url})
    assert response.status_code == 422


def test_create_team_rejects_invalid_twitter_url(admin_client: TestClient) -> None:
    response = admin_client.post("/teams", json={"name": "Team U", "twitter_url": "not a url"})
    assert response.status_code == 422


def test_create_team_rejects_oversized_field(admin_client: TestClient) -> None:
    response = admin_client.post("/teams", json={"name": "Team D", "home_court_address": "x" * 301})
    assert response.status_code == 422


def test_about_round_trips_and_clears(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team A", about="שורה 1\nשורה 2", about_en="Line")
    got = admin_client.get(f"/teams/{created['id']}").json()
    assert (got["about"], got["about_en"]) == ("שורה 1\nשורה 2", "Line")
    admin_client.patch(f"/teams/{created['id']}", json={"about": None})
    got = admin_client.get(f"/teams/{created['id']}").json()
    assert got["about"] is None
    assert got["about_en"] == "Line"


def test_about_rejects_oversized(admin_client: TestClient) -> None:
    response = admin_client.post("/teams", json={"name": "Team B", "about": "x" * 5001})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/teams"),
        ("POST", "/teams/club-preview"),
        ("GET", "/teams/club-preview/status"),
        ("PATCH", "/teams/1"),
        ("DELETE", "/teams/1"),
    ],
)
def test_write_routes_require_admin(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path, json={"name": "Nope"})
    assert response.status_code == 401


def test_list_and_get_team_are_public(admin_client: TestClient, client: TestClient) -> None:
    created = _create_team(admin_client, "Team D")

    list_response = client.get("/teams")
    assert list_response.status_code == 200
    assert any(team["id"] == created["id"] for team in list_response.json())

    get_response = client.get(f"/teams/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json() == created


def test_get_missing_team_404(client: TestClient) -> None:
    response = client.get("/teams/999999")
    assert response.status_code == 404


def test_update_team_partial_keeps_slug(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team E")

    response = admin_client.patch(f"/teams/{created['id']}", json={"name": "Team E Renamed"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Team E Renamed"
    assert updated["slug"] == created["slug"]


def test_delete_team_removes_it(admin_client: TestClient, client: TestClient) -> None:
    created = _create_team(admin_client, "Team F")

    delete_response = admin_client.delete(f"/teams/{created['id']}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/teams/{created['id']}")
    assert get_response.status_code == 404


@pytest.mark.parametrize("field", ["facebook_url", "logo_url"])
@pytest.mark.parametrize("value", ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])
def test_update_team_rejects_non_http_scheme(admin_client: TestClient, field: str, value: str) -> None:
    created = _create_team(admin_client, "Team S")
    assert admin_client.patch(f"/teams/{created['id']}", json={field: value}).status_code == 422


@pytest.mark.parametrize("field", ["ibasketball_team_url", "ibasketball_league_url"])
@pytest.mark.parametrize(
    "value",
    [
        "http://db:5432/",
        "http://169.254.169.254/latest/meta-data/",
        "https://evil.com/league/1/",
        "http://ibasketball.co.il/league/1/",
        "https://evil.com\\@ibasketball.co.il/league/1/",
        "https://ibasketball.co.il:8080/league/1/",
    ],
)
def test_update_team_rejects_non_ibasketball_host(admin_client: TestClient, field: str, value: str) -> None:
    created = _create_team(admin_client, "Team H")
    assert admin_client.patch(f"/teams/{created['id']}", json={field: value}).status_code == 422


def test_ibasketball_urls_accept_real_hosts(admin_client: TestClient) -> None:
    team_url = "https://ibasketball.co.il/team/12345-x/"
    league_url = "https://www.ibasketball.co.il/league/2026-1/"
    created = _create_team(
        admin_client, "Team R", ibasketball_team_url=team_url, ibasketball_league_url=league_url
    )
    got = admin_client.get(f"/teams/{created['id']}").json()
    assert got["ibasketball_team_url"] == team_url
    assert got["ibasketball_league_url"] == league_url


def test_background_defaults_and_round_trips(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team BG")
    url = f"/teams/{created['id']}"
    assert admin_client.get(url).json()["background"] == "hoop-1"
    admin_client.patch(url, json={"background": "hoop-2"})
    assert admin_client.get(url).json()["background"] == "hoop-2"
    assert admin_client.patch(url, json={"background": None}).status_code == 200
    assert admin_client.get(url).json()["background"] == "hoop-2"


def test_rejects_unknown_background(admin_client: TestClient) -> None:
    assert admin_client.post("/teams", json={"name": "Team X", "background": "nope"}).status_code == 422
    created = _create_team(admin_client, "Team Y")
    assert admin_client.patch(f"/teams/{created['id']}", json={"background": "nope"}).status_code == 422
    for bad in ("javascript:alert(1)", "https://example.com/" + "a" * 500):
        assert admin_client.patch(f"/teams/{created['id']}", json={"background": bad}).status_code == 422


def test_background_accepts_image_url(admin_client: TestClient) -> None:
    created = _create_team(admin_client, "Team Z")
    url = f"/teams/{created['id']}"
    bg = "https://cdn.example.com/bg.jpg"
    assert admin_client.patch(url, json={"background": bg}).status_code == 200
    assert admin_client.get(url).json()["background"] == bg


def test_club_preview_rejects_non_ibasketball_url(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/teams/club-preview", json={"club_url": "https://example.com/club/1/"}
    )
    assert response.status_code == 422


URL = {"club_url": "https://ibasketball.co.il/club/1/"}


def test_club_preview_runs_in_background_and_reports_error_on_fetch_failure(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(url: str) -> str:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(scrape_club, "_get_page", boom)
    assert admin_client.post("/teams/club-preview", json=URL).status_code == 202
    assert admin_client.get("/teams/club-preview/status").json() == {
        "running": False,
        "rows": None,
        "error": "unreachable",
    }


def test_club_preview_status_reports_not_a_club_on_value_error(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(scrape_club, "_get_page", lambda url: "<div>nothing</div>")
    admin_client.post("/teams/club-preview", json=URL)
    assert admin_client.get("/teams/club-preview/status").json()["error"] == "not_a_club"


def test_club_preview_status_returns_rows(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    row = {
        "name": "A",
        "ibasketball_team_url": "https://ibasketball.co.il/team/1-a/",
        "ibasketball_league_url": None,
        "league_name": "L",
        "home_court_address": None,
        "logo_url": None,
    }
    monkeypatch.setattr(scrape_club, "preview_club_teams", lambda db, url: [row])
    admin_client.post("/teams/club-preview", json=URL)
    assert admin_client.get("/teams/club-preview/status").json() == {
        "running": False,
        "rows": [row],
        "error": None,
    }


def test_club_preview_returns_409_when_already_running(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(teams_router, "_preview_running", True)
    assert admin_client.post("/teams/club-preview", json=URL).status_code == 409


def test_team_club_round_trips(admin_client: TestClient) -> None:
    created = admin_client.post("/teams", json={"name": "A", "club": "  Gush "})
    assert created.status_code == 201
    assert created.json()["club"] == "Gush"
    url = f"/teams/{created.json()['id']}"
    assert admin_client.patch(url, json={"club": None}).json()["club"] is None
    assert admin_client.patch(url, json={"club": ""}).status_code == 422


@pytest.mark.parametrize("via", ["create", "update"])
def test_setting_team_club_creates_club_row(admin_client: TestClient, db_session: Session, via: str) -> None:
    # Postgres enforces teams.club -> clubs.name; SQLite doesn't, so assert the row directly.
    def set_club(name: str) -> None:
        if via == "create":
            assert admin_client.post("/teams", json={"name": name, "club": "New"}).status_code == 201
        else:
            team_id = _create_team(admin_client, name)["id"]
            assert admin_client.patch(f"/teams/{team_id}", json={"club": "New"}).status_code == 200

    set_club("First")
    set_club("Second")

    assert [c.name for c in db_session.query(Club).all()] == ["New"]


def test_patch_changing_league_url_marks_it_overridden(admin_client: TestClient, db_session: Session) -> None:
    team_id = _create_team(admin_client, "L", ibasketball_league_url="https://ibasketball.co.il/league/a/")["id"]

    admin_client.patch(
        f"/teams/{team_id}", json={"ibasketball_league_url": "https://ibasketball.co.il/league/a/", "logo_url": "https://x.test/l.png"}
    )
    assert db_session.get(Team, team_id).league_url_overridden is False

    admin_client.patch(f"/teams/{team_id}", json={"ibasketball_league_url": "https://ibasketball.co.il/league/b/"})
    db_session.expire_all()
    assert db_session.get(Team, team_id).league_url_overridden is True


def test_patch_accepting_league_suggestion_clears_override(admin_client: TestClient, db_session: Session) -> None:
    new = "https://ibasketball.co.il/league/b/"
    team_id = _create_team(admin_client, "L", ibasketball_league_url="https://ibasketball.co.il/league/a/")["id"]
    team = db_session.get(Team, team_id)
    team.league_url_overridden, team.league_url_suggestion = True, new
    db_session.commit()

    assert admin_client.patch(f"/teams/{team_id}", json={"ibasketball_league_url": new}).status_code == 200

    db_session.expire_all()
    team = db_session.get(Team, team_id)
    assert (team.league_url_overridden, team.league_url_suggestion) == (False, None)
    assert admin_client.get(f"/teams/{team_id}").json()["league_url_suggestion"] is None
