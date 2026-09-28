import pytest
from fastapi.testclient import TestClient


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


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/teams"),
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
