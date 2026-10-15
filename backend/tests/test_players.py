from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.main import app
from app.models import AdminUser, Membership, Player, PlayerImage, Team
from app.security import hash_password

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


def test_delete_player_soft_deletes(
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

    assert db_session.get(Player, player_id).deleted_at is not None
    assert db_session.get(PlayerImage, image_id) is not None
    assert admin_client.get(f"/teams/{team.id}/players").json() == []


def test_list_deleted_players_admin_only(admin_client: TestClient, team: Team) -> None:
    gone = admin_client.post(f"/teams/{team.id}/players", json={"name": "Gone"}).json()
    admin_client.post(f"/teams/{team.id}/players", json={"name": "Live"})
    admin_client.delete(f"/teams/{team.id}/players/{gone['id']}")

    assert TestClient(app).get(f"/teams/{team.id}/players/deleted").status_code == 401

    response = admin_client.get(f"/teams/{team.id}/players/deleted")
    assert response.status_code == 200
    assert [p["name"] for p in response.json()] == ["Gone"]


def test_restore_player(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]
    admin_client.post(f"/players/{player_id}/images", json={"url": "https://example.com/d.jpg"})
    admin_client.delete(f"/teams/{team.id}/players/{player_id}")

    url = f"/teams/{team.id}/players/{player_id}/restore"
    assert TestClient(app).post(url).status_code == 401
    assert admin_client.post(f"/teams/{team.id + 1}/players/{player_id}/restore").status_code == 404

    response = admin_client.post(url)
    assert response.status_code == 200
    listed = admin_client.get(f"/teams/{team.id}/players").json()
    assert [p["id"] for p in listed] == [player_id]
    assert len(listed[0]["images"]) == 1


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


def test_add_player_image_rejects_malformed_url(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]

    response = admin_client.post(f"/players/{player_id}/images", json={"url": "not-a-url"})
    assert response.status_code == 422


def test_player_out_includes_images(admin_client: TestClient, team: Team) -> None:
    created = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()
    player_id = created["id"]
    assert created["images"] == []

    admin_client.post(f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"})

    list_response = admin_client.get(f"/teams/{team.id}/players")
    player = list_response.json()[0]
    assert [img["url"] for img in player["images"]] == ["https://example.com/dana.jpg"]

    patch_response = admin_client.patch(
        f"/teams/{team.id}/players/{player_id}", json={"jersey_number": 4}
    )
    assert [img["url"] for img in patch_response.json()["images"]] == [
        "https://example.com/dana.jpg"
    ]


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


def test_get_player_public_includes_images(
    client: TestClient, db_session: Session, team: Team
) -> None:
    player = Player(team_id=team.id, name="Dana")
    player.images.append(PlayerImage(url="https://example.com/a.jpg"))
    db_session.add(player)
    db_session.commit()

    response = client.get(f"/players/{player.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Dana"
    assert [i["url"] for i in body["images"]] == ["https://example.com/a.jpg"]


def test_get_player_unknown_404(client: TestClient) -> None:
    assert client.get("/players/999999").status_code == 404


def test_get_player_soft_deleted_404(client: TestClient, db_session: Session, team: Team) -> None:
    player = Player(team_id=team.id, name="Gone", deleted_at=datetime.now(UTC))
    db_session.add(player)
    db_session.commit()

    assert client.get(f"/players/{player.id}").status_code == 404


def test_player_image_out_includes_focus_fields(admin_client: TestClient, team: Team) -> None:
    player_id = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]
    response = admin_client.post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    )
    body = response.json()
    assert (body["focus_x"], body["focus_y"], body["zoom"]) == (None, None, None)


def test_patch_player_null_name_rejected(
    admin_client: TestClient, db_session: Session, team: Team
) -> None:
    player_id = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]

    response = admin_client.patch(f"/teams/{team.id}/players/{player_id}", json={"name": None})
    assert response.status_code == 422

    db_session.expire_all()
    assert db_session.get(Player, player_id).name == "Dana"


# ---- #329: linking a roster player to a user account ----


def _make_user(db: Session, username: str, *memberships: Membership) -> AdminUser:
    user = AdminUser(username=username, password_hash=hash_password("password123"))
    db.add(user)
    db.flush()
    for m in memberships:
        m.user_id = user.id
        db.add(m)
    db.commit()
    return user


def _login_user(
    client: TestClient, db: Session, username: str, *memberships: Membership
) -> AdminUser:
    user = _make_user(db, username, *memberships)
    assert (
        client.post(
            "/auth/login", json={"username": username, "password": "password123"}
        ).status_code
        == 200
    )
    return user


def _player(
    db: Session, team: Team, name: str = "P", user: AdminUser | None = None, number: int | None = 5
) -> Player:
    player = Player(
        team_id=team.id, name=name, jersey_number=number, user_id=user.id if user else None
    )
    db.add(player)
    db.commit()
    return player


def _links(client: TestClient, team: Team) -> dict[int, int]:
    rows = client.get(f"/teams/{team.id}/players/links").json()
    return {r["player_id"]: r["user_id"] for r in rows}


def test_player_user_fk_is_set_null_and_not_unique(db_session: Session, own_team: Team) -> None:
    column = Player.__table__.c.user_id
    (fk,) = column.foreign_keys
    assert fk.ondelete == "SET NULL"
    assert not column.unique
    user = _make_user(db_session, "u")
    player = _player(db_session, own_team, user=user)
    db_session.delete(user)
    db_session.commit()
    assert db_session.get(Player, player.id) is not None


def test_public_player_responses_never_expose_user_id(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    player = _player(db_session, own_team, user=_make_user(db_session, "u"))
    assert "user_id" not in client.get(f"/players/{player.id}").json()
    assert "user_id" not in client.get(f"/teams/{own_team.id}/players").json()[0]
    assert client.get(f"/teams/{own_team.id}/players/links").status_code == 401


def test_team_admin_links_and_unlinks_player(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    member = _make_user(db_session, "m", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team)
    url = f"/teams/{own_team.id}/players/{player.id}"
    assert team_admin_client.patch(url, json={"user_id": member.id}).status_code == 200
    assert _links(team_admin_client, own_team) == {player.id: member.id}
    assert team_admin_client.patch(url, json={"user_id": None}).status_code == 200
    assert _links(team_admin_client, own_team) == {}


def test_link_requires_covering_grant(
    team_admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    pending = _make_user(db_session, "p", Membership(team_id=own_team.id, role="pending"))
    elsewhere = _make_user(db_session, "e", Membership(team_id=other_team.id, role="member"))
    player = _player(db_session, own_team)
    for user in (pending, elsewhere):
        response = team_admin_client.patch(
            f"/teams/{own_team.id}/players/{player.id}", json={"user_id": user.id}
        )
        assert response.status_code == 422
        assert str(user.id) in response.json()["detail"]


def test_link_accepts_club_member(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    member = _make_user(db_session, "cm", Membership(club="Gush", role="member"))
    player = _player(db_session, sibling_team)
    response = club_admin_client.patch(
        f"/teams/{sibling_team.id}/players/{player.id}", json={"user_id": member.id}
    )
    assert response.status_code == 200


def test_link_outside_scope_403(
    team_admin_client: TestClient, db_session: Session, other_team: Team
) -> None:
    player = _player(db_session, other_team)
    response = team_admin_client.patch(
        f"/teams/{other_team.id}/players/{player.id}", json={"user_id": 1}
    )
    assert response.status_code == 403


def test_linked_user_edits_own_name(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    response = client.patch(
        f"/teams/{own_team.id}/players/{player.id}", json={"name": "New", "name_en": "New EN"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New"


@pytest.mark.parametrize("field,value", [("jersey_number", 9), ("user_id", None)])
def test_linked_user_cannot_change_admin_fields(
    field: str, value: int | None, client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    response = client.patch(f"/teams/{own_team.id}/players/{player.id}", json={field: value})
    assert response.status_code == 403
    assert field in response.json()["detail"]


def test_linked_user_cannot_edit_other_player(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    _player(db_session, own_team, user=user)
    other = _player(db_session, own_team, name="Other")
    assert (
        client.patch(f"/teams/{own_team.id}/players/{other.id}", json={"name": "X"}).status_code
        == 403
    )


def test_linked_user_manages_own_images_only(
    client: TestClient, db_session: Session, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "object_storage_public_url", "https://x.test")
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    other = _player(db_session, own_team, name="Other")
    created = client.post(f"/players/{mine.id}/images", json={"url": "https://x.test/a.png"})
    assert created.status_code == 201
    assert client.delete(f"/players/{mine.id}/images/{created.json()['id']}").status_code == 204
    assert (
        client.post(f"/players/{other.id}/images", json={"url": "https://x.test/a.png"}).status_code
        == 403
    )


def test_linked_user_cannot_delete_or_restore(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    url = f"/teams/{own_team.id}/players/{player.id}"
    assert client.delete(url).status_code == 403
    assert client.post(f"{url}/restore").status_code == 403


def test_linkable_users_scoped_to_team(
    team_admin_client: TestClient,
    db_session: Session,
    own_team: Team,
    sibling_team: Team,
    other_team: Team,
) -> None:
    _make_user(db_session, "team_member", Membership(team_id=own_team.id, role="member"))
    _make_user(db_session, "club_member", Membership(club="Gush", role="member"))
    _make_user(db_session, "pending", Membership(team_id=own_team.id, role="pending"))
    _make_user(db_session, "elsewhere", Membership(team_id=other_team.id, role="member"))
    response = team_admin_client.get(f"/teams/{own_team.id}/players/linkable-users")
    assert response.status_code == 200
    rows = response.json()
    usernames = {r["username"] for r in rows}
    assert {"team_member", "club_member"} <= usernames
    assert not {"pending", "elsewhere"} & usernames
    assert all(set(r) == {"id", "username", "display_name"} for r in rows)
    assert (
        team_admin_client.get(f"/teams/{other_team.id}/players/linkable-users").status_code == 403
    )


def test_linkable_users_ignores_club_grants_for_clubless_team(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    assert own_team.club is None
    _make_user(db_session, "x", Membership(club="Gush", role="member"))
    rows = team_admin_client.get(f"/teams/{own_team.id}/players/linkable-users").json()
    assert "x" not in {r["username"] for r in rows}


def test_me_lists_linked_player_ids(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    gone = _player(db_session, own_team, name="Gone", user=user)
    gone.deleted_at = datetime.now(UTC)
    db_session.commit()
    _player(db_session, own_team, name="Other")
    assert client.get("/auth/me").json()["player_ids"] == [mine.id]


def test_linked_user_cannot_attach_external_photo_url(
    client: TestClient, db_session: Session, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "object_storage_public_url", "https://cdn.test")
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    assert (
        client.post(
            f"/players/{mine.id}/images", json={"url": "https://evil.test/a.png"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/players/{mine.id}/images", json={"url": "https://cdn.test.evil.test/a.png"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/players/{mine.id}/images", json={"url": "https://cdn.test/a.png"}
        ).status_code
        == 201
    )


@pytest.mark.parametrize("field", ["name", "name_en"])
def test_patch_player_name_over_120_chars_is_422(
    admin_client: TestClient, team: Team, field: str
) -> None:
    player_id = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]
    response = admin_client.patch(f"/teams/{team.id}/players/{player_id}", json={field: "x" * 121})
    assert response.status_code == 422
