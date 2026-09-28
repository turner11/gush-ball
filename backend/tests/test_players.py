from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Player, PlayerImage, Team

# `client` and `admin_client` are the same TestClient instance under the hood (admin_client just
# logs in on it) - see conftest.py. Tests that need both an authenticated action and a genuinely
# unauthenticated check use a fresh TestClient(app) for the latter instead of `client`.


@pytest.fixture()
def team(db_session: Session) -> Generator[Team, None, None]:
    team = Team(name="Gush Ball A", slug="gush-ball-a")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    yield team


def test_list_players_public_no_auth(client: TestClient, team: Team) -> None:
    response = client.get(f"/teams/{team.id}/players")
    assert response.status_code == 200
    assert response.json() == []


def test_create_player_requires_admin(client: TestClient, team: Team) -> None:
    response = client.post(f"/teams/{team.id}/players", json={"name": "Dana"})
    assert response.status_code == 401


def test_create_player_as_admin(admin_client: TestClient, team: Team) -> None:
    response = admin_client.post(
        f"/teams/{team.id}/players", json={"name": "Dana", "jersey_number": 7}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Dana"
    assert body["jersey_number"] == 7
    assert body["team_id"] == team.id


def test_create_player_unknown_team_404(admin_client: TestClient) -> None:
    response = admin_client.post("/teams/999999/players", json={"name": "Dana"})
    assert response.status_code == 404


def test_list_players_returns_created(
    client: TestClient, admin_client: TestClient, team: Team
) -> None:
    admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"})
    response = client.get(f"/teams/{team.id}/players")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert names == ["Dana"]


def test_patch_player_partial_update(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(
        f"/teams/{team.id}/players", json={"name": "Dana", "jersey_number": 7}
    ).json()
    player_id = created["id"]

    response = admin_client.patch(
        f"/teams/{team.id}/players/{player_id}", json={"jersey_number": 9}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["jersey_number"] == 9
    assert body["name"] == "Dana"

    unauth_response = TestClient(app).patch(
        f"/teams/{team.id}/players/{player_id}", json={"jersey_number": 1}
    )
    assert unauth_response.status_code == 401


def test_patch_player_wrong_team_404(
    admin_client: TestClient, db_session: Session, team: Team
) -> None:
    other_team = Team(name="Gush Ball B", slug="gush-ball-b")
    db_session.add(other_team)
    db_session.commit()
    db_session.refresh(other_team)

    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]

    response = admin_client.patch(
        f"/teams/{other_team.id}/players/{player_id}", json={"jersey_number": 3}
    )
    assert response.status_code == 404


def test_delete_player_cascades_images(
    admin_client: TestClient, db_session: Session, team: Team
) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]
    image = admin_client.post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    ).json()
    image_id = image["id"]

    unauth_response = TestClient(app).delete(f"/teams/{team.id}/players/{player_id}")
    assert unauth_response.status_code == 401

    response = admin_client.delete(f"/teams/{team.id}/players/{player_id}")
    assert response.status_code == 204

    assert db_session.get(Player, player_id) is None
    assert db_session.get(PlayerImage, image_id) is None


def test_add_player_image_admin_only(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]

    unauth_response = TestClient(app).post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    )
    assert unauth_response.status_code == 401

    response = admin_client.post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    )
    assert response.status_code == 201
    assert response.json()["url"] == "https://example.com/dana.jpg"


def test_delete_player_image(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]
    image = admin_client.post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    ).json()
    image_id = image["id"]

    unauth_response = TestClient(app).delete(f"/players/{player_id}/images/{image_id}")
    assert unauth_response.status_code == 401

    wrong_response = admin_client.delete(f"/players/999999/images/{image_id}")
    assert wrong_response.status_code == 404

    response = admin_client.delete(f"/players/{player_id}/images/{image_id}")
    assert response.status_code == 204
