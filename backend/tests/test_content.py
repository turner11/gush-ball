from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Team, TeamImage, TeamLink, TeamPost, TeamVideo

# (segment, model_class, create_payload, patch_payload, patch_field, original_value_of_patch_field)
RESOURCES = [
    (
        "links",
        TeamLink,
        {"label": "Website", "url": "https://example.com"},
        {"label": "Updated Label"},
        "label",
        "Website",
    ),
    (
        "videos",
        TeamVideo,
        {"title": "Season Highlights", "url": "https://example.com/v.mp4"},
        {"title": "Updated Title"},
        "title",
        "Season Highlights",
    ),
    (
        "images",
        TeamImage,
        {"title": "Team Photo", "url": "https://example.com/i.jpg"},
        {"title": "Updated Title"},
        "title",
        "Team Photo",
    ),
    (
        "posts",
        TeamPost,
        {"title": "Big Win", "body": "We won the game last night."},
        {"title": "Updated Title"},
        "title",
        "Big Win",
    ),
]
RESOURCE_IDS = [r[0] for r in RESOURCES]


@pytest.fixture()
def team(db_session: Session) -> Generator[Team, None, None]:
    team = Team(name="Gush Ball A", slug="gush-ball-a")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    yield team


@pytest.mark.parametrize(
    ("segment", "_model", "create_payload", "_patch", "_field", "_orig"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
@pytest.mark.parametrize("method", ["POST", "PATCH", "DELETE"])
def test_write_routes_require_admin(
    client: TestClient,
    team: Team,
    method: str,
    segment: str,
    _model: type,
    create_payload: dict,
    _patch: dict,
    _field: str,
    _orig: str,
) -> None:
    if method == "POST":
        path = f"/teams/{team.id}/{segment}"
    else:
        path = f"/teams/{team.id}/{segment}/1"
    response = client.request(method, path, json=create_payload)
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("segment", "_model", "create_payload", "_patch", "_field", "_orig"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
def test_create_and_list(
    admin_client: TestClient,
    client: TestClient,
    team: Team,
    segment: str,
    _model: type,
    create_payload: dict,
    _patch: dict,
    _field: str,
    _orig: str,
) -> None:
    created_response = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload)
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert created["team_id"] == team.id

    list_response = client.get(f"/teams/{team.id}/{segment}")
    assert list_response.status_code == 200
    assert any(item["id"] == created["id"] for item in list_response.json())


@pytest.mark.parametrize(
    ("segment", "_model", "create_payload", "_patch", "_field", "_orig"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
def test_create_unknown_team_404(
    admin_client: TestClient,
    segment: str,
    _model: type,
    create_payload: dict,
    _patch: dict,
    _field: str,
    _orig: str,
) -> None:
    response = admin_client.post(f"/teams/999999/{segment}", json=create_payload)
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("segment", "_model", "create_payload", "patch_payload", "patch_field", "orig_value"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
def test_patch_partial_update(
    admin_client: TestClient,
    team: Team,
    segment: str,
    _model: type,
    create_payload: dict,
    patch_payload: dict,
    patch_field: str,
    orig_value: str,
) -> None:
    created = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload).json()
    item_id = created["id"]

    response = admin_client.patch(f"/teams/{team.id}/{segment}/{item_id}", json=patch_payload)
    assert response.status_code == 200
    body = response.json()
    assert body[patch_field] == patch_payload[patch_field]
    assert body[patch_field] != orig_value


@pytest.mark.parametrize(
    ("segment", "_model", "create_payload", "patch_payload", "_field", "_orig"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
def test_patch_wrong_team_404(
    admin_client: TestClient,
    db_session: Session,
    team: Team,
    segment: str,
    _model: type,
    create_payload: dict,
    patch_payload: dict,
    _field: str,
    _orig: str,
) -> None:
    other_team = Team(name="Gush Ball B", slug="gush-ball-b")
    db_session.add(other_team)
    db_session.commit()
    db_session.refresh(other_team)

    created = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload).json()
    item_id = created["id"]

    response = admin_client.patch(f"/teams/{other_team.id}/{segment}/{item_id}", json=patch_payload)
    assert response.status_code == 404


@pytest.mark.parametrize(
    ("segment", "model_class", "create_payload", "_patch", "_field", "_orig"),
    RESOURCES,
    ids=RESOURCE_IDS,
)
def test_delete(
    admin_client: TestClient,
    db_session: Session,
    team: Team,
    segment: str,
    model_class: type,
    create_payload: dict,
    _patch: dict,
    _field: str,
    _orig: str,
) -> None:
    created = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload).json()
    item_id = created["id"]

    unauth_response = TestClient(app).delete(f"/teams/{team.id}/{segment}/{item_id}")
    assert unauth_response.status_code == 401

    response = admin_client.delete(f"/teams/{team.id}/{segment}/{item_id}")
    assert response.status_code == 204

    assert db_session.get(model_class, item_id) is None


@pytest.mark.parametrize(
    ("segment", "base_payload"),
    [
        ("links", {"label": "Website"}),
        ("videos", {"title": "Season Highlights"}),
        ("images", {"title": "Team Photo"}),
    ],
    ids=["links", "videos", "images"],
)
def test_create_rejects_malformed_url(
    admin_client: TestClient, team: Team, segment: str, base_payload: dict
) -> None:
    response = admin_client.post(
        f"/teams/{team.id}/{segment}", json={**base_payload, "url": "not-a-url"}
    )
    assert response.status_code == 422


def test_create_post_requires_body(admin_client: TestClient, team: Team) -> None:
    response = admin_client.post(f"/teams/{team.id}/posts", json={"title": "Big Win"})
    assert response.status_code == 422
