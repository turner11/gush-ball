from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Player, Team, TeamImage, TeamLink, TeamPost, TeamVideo

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


@pytest.mark.parametrize(
    ("segment", "model_class", "create_payload"),
    [
        ("links", TeamLink, {"label": "Website", "url": "https://example.com"}),
        ("videos", TeamVideo, {"title": "Season Highlights", "url": "https://example.com/v.mp4"}),
        ("images", TeamImage, {"title": "Team Photo", "url": "https://example.com/i.jpg"}),
    ],
    ids=["links", "videos", "images"],
)
def test_patch_null_url_rejected(
    admin_client: TestClient,
    db_session: Session,
    team: Team,
    segment: str,
    model_class: type,
    create_payload: dict,
) -> None:
    created = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload).json()
    item_id = created["id"]

    response = admin_client.patch(f"/teams/{team.id}/{segment}/{item_id}", json={"url": None})
    assert response.status_code == 422

    db_session.expire_all()
    row = db_session.get(model_class, item_id)
    assert row.url == created["url"]
    assert row.url != "None"


MEDIA = pytest.mark.parametrize(
    ("segment", "create_payload"),
    [(r[0], r[2]) for r in RESOURCES if r[0] in ("videos", "images")],
    ids=["videos", "images"],
)


@MEDIA
def test_media_player_tags_roundtrip(
    admin_client: TestClient,
    client: TestClient,
    db_session: Session,
    team: Team,
    segment: str,
    create_payload: dict,
) -> None:
    p1, p2 = Player(team_id=team.id, name="A"), Player(team_id=team.id, name="B")
    db_session.add_all([p1, p2])
    db_session.commit()
    base = f"/teams/{team.id}/{segment}"

    created = admin_client.post(base, json={**create_payload, "player_ids": [p1.id, p2.id]})
    assert created.status_code == 201, created.text
    assert created.json()["player_ids"] == [p1.id, p2.id]
    item = f"{base}/{created.json()['id']}"

    assert client.get(base).json()[0]["player_ids"] == [p1.id, p2.id]
    assert admin_client.patch(item, json={"player_ids": [p2.id]}).json()["player_ids"] == [p2.id]
    assert admin_client.patch(item, json={"title": "x"}).json()["player_ids"] == [p2.id]
    assert admin_client.patch(item, json={"player_ids": []}).json()["player_ids"] == []


@MEDIA
def test_media_player_tags_default_empty(
    admin_client: TestClient, team: Team, segment: str, create_payload: dict
) -> None:
    response = admin_client.post(f"/teams/{team.id}/{segment}", json=create_payload)
    assert response.json()["player_ids"] == []


@MEDIA
def test_patch_null_player_ids_rejected(
    admin_client: TestClient, team: Team, segment: str, create_payload: dict
) -> None:
    base = f"/teams/{team.id}/{segment}"
    item_id = admin_client.post(base, json=create_payload).json()["id"]
    assert admin_client.patch(f"{base}/{item_id}", json={"player_ids": None}).status_code == 422


@MEDIA
def test_player_ids_must_belong_to_team(
    admin_client: TestClient, db_session: Session, team: Team, segment: str, create_payload: dict
) -> None:
    other = Team(name="Other", slug="other")
    db_session.add(other)
    db_session.commit()
    foreign = Player(team_id=other.id, name="X")
    db_session.add(foreign)
    db_session.commit()
    base = f"/teams/{team.id}/{segment}"
    for bad in ([foreign.id], [999999]):
        assert (
            admin_client.post(base, json={**create_payload, "player_ids": bad}).status_code == 422
        )
    item_id = admin_client.post(base, json=create_payload).json()["id"]
    assert (
        admin_client.patch(f"{base}/{item_id}", json={"player_ids": [foreign.id]}).status_code
        == 422
    )


@MEDIA
def test_soft_deleted_player_id_still_accepted(
    admin_client: TestClient, db_session: Session, team: Team, segment: str, create_payload: dict
) -> None:
    gone = Player(team_id=team.id, name="Gone", deleted_at=datetime.now(UTC))
    db_session.add(gone)
    db_session.commit()
    base = f"/teams/{team.id}/{segment}"
    created = admin_client.post(base, json={**create_payload, "player_ids": [gone.id]})
    assert created.status_code == 201, created.text
    patched = admin_client.patch(f"{base}/{created.json()['id']}", json={"title": "x"})
    assert patched.json()["player_ids"] == [gone.id]
