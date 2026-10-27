from collections.abc import Generator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.main import app
from app.models import AdminUser, Membership, Player, PlayerImage, PlayerVideo, Team
from app.routers import players
from app.routers.players import ISRAEL, age_on
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

    admin_client.post(
        f"/players/{player_id}/images", json={"url": "https://example.com/dana.jpg"}
    )

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


def _add_images(admin_client: TestClient, player_id: int, names: str) -> list[dict]:
    return [
        admin_client.post(f"/players/{player_id}/images", json={"url": f"https://example.com/{n}.jpg"}).json()
        for n in names
    ]


def test_set_main_player_image_moves_it_first(admin_client: TestClient, db_session: Session, team: Team) -> None:
    player_id = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]
    c = _add_images(admin_client, player_id, "abc")[2]
    row = db_session.get(PlayerImage, c["id"])
    row.focus_x, row.focus_y, row.zoom = 30.0, 40.0, 1.5
    db_session.commit()

    response = admin_client.post(f"/players/{player_id}/images/{c['id']}/main")
    assert response.status_code == 200
    body = response.json()
    assert [i["url"].rsplit("/", 1)[1] for i in body] == ["c.jpg", "a.jpg", "b.jpg"]
    assert [i["id"] for i in body] == sorted(i["id"] for i in body)
    assert (body[0]["focus_x"], body[0]["focus_y"], body[0]["zoom"]) == (30.0, 40.0, 1.5)
    assert body[1]["focus_x"] is None
    got = admin_client.get(f"/players/{player_id}").json()["images"]
    assert [i["url"] for i in got] == [i["url"] for i in body]

    again = admin_client.post(f"/players/{player_id}/images/{body[0]['id']}/main").json()
    assert [i["url"] for i in again] == [i["url"] for i in body]


def test_set_main_player_image_404s_and_requires_login(admin_client: TestClient, team: Team) -> None:
    first = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]
    second = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dan"}).json()["id"]
    (image,) = _add_images(admin_client, first, "a")
    assert admin_client.post(f"/players/{second}/images/{image['id']}/main").status_code == 404
    assert admin_client.post(f"/players/999999/images/{image['id']}/main").status_code == 404
    assert TestClient(app).post(f"/players/{first}/images/{image['id']}/main").status_code == 401


def test_linked_user_sets_main_image_on_own_player_only(
    client: TestClient, db_session: Session, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "object_storage_public_url", "https://x.test")
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    other = _player(db_session, own_team, name="Other")
    for n in "ab":
        client.post(f"/players/{mine.id}/images", json={"url": f"https://x.test/{n}.png"})
    second = client.get(f"/players/{mine.id}").json()["images"][1]["id"]
    assert client.post(f"/players/{mine.id}/images/{second}/main").status_code == 200
    assert client.post(f"/players/{other.id}/images/{second}/main").status_code == 403


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


def test_get_player_soft_deleted_404(
    client: TestClient, db_session: Session, team: Team
) -> None:
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


def test_patch_player_null_name_rejected(admin_client: TestClient, db_session: Session, team: Team) -> None:
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


def _login_user(client: TestClient, db: Session, username: str, *memberships: Membership) -> AdminUser:
    user = _make_user(db, username, *memberships)
    assert client.post("/auth/login", json={"username": username, "password": "password123"}).status_code == 200
    return user


def _player(db: Session, team: Team, name: str = "P", user: AdminUser | None = None, number: int | None = 5) -> Player:
    player = Player(team_id=team.id, name=name, jersey_number=number, user_id=user.id if user else None)
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


def test_public_player_responses_never_expose_user_id(client: TestClient, db_session: Session, own_team: Team) -> None:
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
        response = team_admin_client.patch(f"/teams/{own_team.id}/players/{player.id}", json={"user_id": user.id})
        assert response.status_code == 422
        assert str(user.id) in response.json()["detail"]


def test_link_accepts_club_member(club_admin_client: TestClient, db_session: Session, sibling_team: Team) -> None:
    member = _make_user(db_session, "cm", Membership(club="Gush", role="member"))
    player = _player(db_session, sibling_team)
    response = club_admin_client.patch(f"/teams/{sibling_team.id}/players/{player.id}", json={"user_id": member.id})
    assert response.status_code == 200


def test_link_outside_scope_403(team_admin_client: TestClient, db_session: Session, other_team: Team) -> None:
    player = _player(db_session, other_team)
    response = team_admin_client.patch(f"/teams/{other_team.id}/players/{player.id}", json={"user_id": 1})
    assert response.status_code == 403


def test_linked_user_edits_own_name(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    response = client.patch(f"/teams/{own_team.id}/players/{player.id}", json={"name": "New", "name_en": "New EN"})
    assert response.status_code == 200
    assert response.json()["name"] == "New"


@pytest.mark.parametrize("field,value", [("jersey_number", 9), ("user_id", None), ("is_coach", True)])
def test_linked_user_cannot_change_admin_fields(
    field: str, value: int | None, client: TestClient, db_session: Session, own_team: Team
) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    response = client.patch(f"/teams/{own_team.id}/players/{player.id}", json={field: value})
    assert response.status_code == 403
    assert field in response.json()["detail"]


def test_linked_user_cannot_edit_other_player(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    _player(db_session, own_team, user=user)
    other = _player(db_session, own_team, name="Other")
    assert client.patch(f"/teams/{own_team.id}/players/{other.id}", json={"name": "X"}).status_code == 403


VIDEO = {"title": "Highlights", "url": "https://youtu.be/dQw4w9WgXcQ"}


def test_linked_user_manages_own_videos_only(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    other = _player(db_session, own_team, name="Other")
    created = client.post(f"/players/{mine.id}/videos", json=VIDEO)
    assert created.status_code == 201
    assert created.json()["title"] == "Highlights"
    assert created.json()["url"] == VIDEO["url"]
    assert [v["id"] for v in client.get(f"/players/{mine.id}").json()["videos"]] == [created.json()["id"]]
    assert client.post(f"/players/{other.id}/videos", json=VIDEO).status_code == 403
    teammate_video = PlayerVideo(player_id=other.id, title="T", url=VIDEO["url"])
    db_session.add(teammate_video)
    db_session.commit()
    assert client.delete(f"/players/{mine.id}/videos/{teammate_video.id}").status_code == 404
    assert client.delete(f"/players/{mine.id}/videos/{created.json()['id']}").status_code == 204


def test_player_videos_capped(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    mine = _player(db_session, own_team, user=user)
    db_session.add_all(
        PlayerVideo(player_id=mine.id, title=f"V{i}", url=VIDEO["url"]) for i in range(players.MAX_PLAYER_VIDEOS)
    )
    db_session.commit()
    assert client.post(f"/players/{mine.id}/videos", json=VIDEO).status_code == 409
    first = db_session.query(PlayerVideo).filter_by(player_id=mine.id).first()
    assert client.delete(f"/players/{mine.id}/videos/{first.id}").status_code == 204
    assert client.post(f"/players/{mine.id}/videos", json=VIDEO).status_code == 201


@pytest.mark.parametrize(
    ("url", "status_code"),
    [
        ("https://youtube.com/watch?v=dQw4w9WgXcQ", 201),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 201),
        ("https://m.youtube.com/watch?v=dQw4w9WgXcQ", 201),
        ("https://youtu.be/dQw4w9WgXcQ", 201),
        ("https://youtube.com/shorts/dQw4w9WgXcQ", 201),
        ("https://evil.test/watch?v=dQw4w9WgXcQ", 422),
        ("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", 422),
        ("https://notyoutube.com/watch?v=dQw4w9WgXcQ", 422),
        ("https://www.youtube.com/channel/abc", 422),
        ("https://www.youtube.com/watch?v=short", 422),
        ("not a url", 422),
    ],
)
def test_player_video_url_must_be_youtube(admin_client: TestClient, team: Team, url: str, status_code: int) -> None:
    player = admin_client.post(f"/teams/{team.id}/players", json={"name": "P"}).json()
    response = admin_client.post(f"/players/{player['id']}/videos", json={"title": "V", "url": url})
    assert response.status_code == status_code, response.text


def test_player_videos_404_for_deleted_player(admin_client: TestClient, db_session: Session, team: Team) -> None:
    player = Player(team_id=team.id, name="Gone", deleted_at=datetime.now(UTC))
    db_session.add(player)
    db_session.commit()
    video = PlayerVideo(player_id=player.id, title="V", url=VIDEO["url"])
    db_session.add(video)
    db_session.commit()
    assert admin_client.post(f"/players/{player.id}/videos", json=VIDEO).status_code == 404
    assert admin_client.delete(f"/players/{player.id}/videos/{video.id}").status_code == 404


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
    assert client.post(f"/players/{other.id}/images", json={"url": "https://x.test/a.png"}).status_code == 403


def test_linked_user_loses_self_edit_after_leaving(
    client: TestClient, db_session: Session, own_team: Team, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "object_storage_public_url", "https://x.test")
    membership = Membership(team_id=own_team.id, role="member")
    user = _login_user(client, db_session, "me", membership)
    mine = _player(db_session, own_team, user=user)
    image_id = client.post(f"/players/{mine.id}/images", json={"url": "https://x.test/a.png"}).json()["id"]
    video_id = client.post(f"/players/{mine.id}/videos", json=VIDEO).json()["id"]
    private = [f"/teams/{own_team.id}/practices", f"/teams/{own_team.id}/plays"]
    assert [client.get(url).status_code for url in private] == [200, 200]
    assert client.delete(f"/memberships/mine/{membership.id}").status_code == 204
    assert [client.get(url).status_code for url in private] == [403, 403]
    assert client.patch(f"/teams/{own_team.id}/players/{mine.id}", json={"name": "New"}).status_code == 403
    assert client.post(f"/players/{mine.id}/images", json={"url": "https://x.test/b.png"}).status_code == 403
    assert client.delete(f"/players/{mine.id}/images/{image_id}").status_code == 403
    assert client.post(f"/players/{mine.id}/videos", json=VIDEO).status_code == 403
    assert client.delete(f"/players/{mine.id}/videos/{video_id}").status_code == 403
    me = client.get("/auth/me").json()
    assert (me["player_ids"], me["member_team_ids"]) == ([], [])


def test_club_member_self_edits_linked_player(client: TestClient, db_session: Session, sibling_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(club="Gush", role="member"))
    mine = _player(db_session, sibling_team, user=user)
    response = client.patch(f"/teams/{sibling_team.id}/players/{mine.id}", json={"name": "New"})
    assert response.status_code == 200


def test_me_lists_linked_player_team_ids(client: TestClient, db_session: Session, sibling_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(club="Gush", role="member"))
    mine = _player(db_session, sibling_team, user=user)
    assert client.get("/auth/me").json()["player_team_ids"] == [sibling_team.id]
    mine.deleted_at = datetime.now(UTC)
    db_session.commit()
    assert client.get("/auth/me").json()["player_team_ids"] == []


def test_linked_user_cannot_delete_or_restore(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    player = _player(db_session, own_team, user=user)
    url = f"/teams/{own_team.id}/players/{player.id}"
    assert client.delete(url).status_code == 403
    assert client.post(f"{url}/restore").status_code == 403


def test_linkable_users_scoped_to_team(
    team_admin_client: TestClient, db_session: Session, own_team: Team, sibling_team: Team, other_team: Team
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
    assert team_admin_client.get(f"/teams/{other_team.id}/players/linkable-users").status_code == 403


def test_linkable_users_ignores_club_grants_for_clubless_team(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    assert own_team.club is None
    _make_user(db_session, "x", Membership(club="Gush", role="member"))
    rows = team_admin_client.get(f"/teams/{own_team.id}/players/linkable-users").json()
    assert "x" not in {r["username"] for r in rows}


def test_me_lists_linked_player_ids(client: TestClient, db_session: Session, own_team: Team) -> None:
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
    assert client.post(f"/players/{mine.id}/images", json={"url": "https://evil.test/a.png"}).status_code == 422
    assert client.post(f"/players/{mine.id}/images", json={"url": "https://cdn.test.evil.test/a.png"}).status_code == 422
    assert client.post(f"/players/{mine.id}/images", json={"url": "https://cdn.test/a.png"}).status_code == 201


@pytest.mark.parametrize("field", ["name", "name_en"])
def test_patch_player_name_over_120_chars_is_422(admin_client: TestClient, team: Team, field: str) -> None:
    player_id = admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).json()["id"]
    response = admin_client.patch(f"/teams/{team.id}/players/{player_id}", json={field: "x" * 121})
    assert response.status_code == 422


def _born(years_ago: int, db: Session, team: Team) -> Player:
    today = datetime.now(ISRAEL).date()
    player = _player(db, team)
    player.birth_date = date(today.year - years_ago, 1, 1)
    db.commit()
    return player


def test_age_on_boundary() -> None:
    born = date(2008, 5, 10)
    assert [age_on(born, date(2024, 5, d)) for d in (9, 10, 11)] == [15, 16, 16]
    leap = date(2008, 2, 29)
    assert age_on(leap, date(2024, 2, 28)) == 15
    assert age_on(leap, date(2024, 2, 29)) == 16
    assert age_on(leap, date(2025, 2, 28)) == 16
    assert age_on(leap, date(2025, 3, 1)) == 17


def test_public_payload_hides_dob_under_16(client: TestClient, db_session: Session, team: Team) -> None:
    player = _born(10, db_session, team)
    for body in (client.get(f"/players/{player.id}").json(), client.get(f"/teams/{team.id}/players").json()[0]):
        assert body["birth_date"] is None
        assert body["age"] is None
        assert body["minor"] is True


def test_public_payload_shows_dob_16_plus(client: TestClient, db_session: Session, team: Team) -> None:
    player = _player(db_session, team)
    player.birth_date = date(2000, 1, 1)
    db_session.commit()
    body = client.get(f"/players/{player.id}").json()
    assert body["birth_date"] == "2000-01-01"
    assert body["age"] == age_on(date(2000, 1, 1), datetime.now(ISRAEL).date())
    assert body["minor"] is False


def test_player_without_birth_date_is_not_minor(client: TestClient, db_session: Session, team: Team) -> None:
    body = client.get(f"/players/{_player(db_session, team).id}").json()
    assert body["minor"] is False
    assert body["age"] is None


def test_in_scope_admin_sees_under_16_dob(team_admin_client: TestClient, db_session: Session, own_team: Team) -> None:
    player = _born(10, db_session, own_team)
    expected = player.birth_date.isoformat()
    patched = team_admin_client.patch(f"/teams/{own_team.id}/players/{player.id}", json={"jersey_number": 9})
    for body in (
        team_admin_client.get(f"/players/{player.id}").json(),
        team_admin_client.get(f"/teams/{own_team.id}/players").json()[0],
        patched.json(),
    ):
        assert body["birth_date"] == expected
        assert body["minor"] is True


def test_out_of_scope_admin_does_not_see_under_16_dob(
    team_admin_client: TestClient, db_session: Session, other_team: Team
) -> None:
    player = _born(10, db_session, other_team)
    assert team_admin_client.get(f"/players/{player.id}").json()["birth_date"] is None


def test_admin_sets_and_clears_birth_date(admin_client: TestClient, db_session: Session, team: Team) -> None:
    player = _player(db_session, team)
    url = f"/teams/{team.id}/players/{player.id}"
    assert admin_client.patch(url, json={"birth_date": "2008-03-12"}).json()["birth_date"] == "2008-03-12"
    assert admin_client.patch(url, json={"birth_date": None}).json()["birth_date"] is None
    assert admin_client.patch(url, json={"birth_date": "2999-01-01"}).status_code == 422


def test_list_players_sorted_by_number_then_name(client: TestClient, db_session: Session, team: Team) -> None:
    for name, number in [("b", 7), ("Zed", None), ("x", 3), ("A", 7), ("alpha", None)]:
        _player(db_session, team, name, number=number)
    names = [p["name"] for p in client.get(f"/teams/{team.id}/players").json()]
    assert names == ["x", "A", "b", "alpha", "Zed"]


def test_list_deleted_players_sorted_by_number_then_name(admin_client: TestClient, team: Team) -> None:
    for name, number in [("b", None), ("a", 4)]:
        player = admin_client.post(f"/teams/{team.id}/players", json={"name": name, "jersey_number": number}).json()
        admin_client.delete(f"/teams/{team.id}/players/{player['id']}")
    names = [p["name"] for p in admin_client.get(f"/teams/{team.id}/players/deleted").json()]
    assert names == ["a", "b"]


def test_create_coach_has_no_jersey(admin_client: TestClient, team: Team) -> None:
    response = admin_client.post(
        f"/teams/{team.id}/players", json={"name": "Coach", "is_coach": True, "jersey_number": 5}
    )
    assert response.status_code == 201
    assert response.json()["is_coach"] is True
    assert response.json()["jersey_number"] is None


def test_patch_to_coach_clears_jersey(admin_client: TestClient, db_session: Session, team: Team) -> None:
    player = _player(db_session, team, number=8)
    response = admin_client.patch(f"/teams/{team.id}/players/{player.id}", json={"is_coach": True})
    assert response.status_code == 200
    assert response.json()["is_coach"] is True
    assert response.json()["jersey_number"] is None


def test_list_players_coaches_first(client: TestClient, db_session: Session, team: Team) -> None:
    _player(db_session, team, name="Numbered", number=3)
    _player(db_session, team, name="Unnumbered", number=None)
    for name in ("Coach B", "Coach A"):
        db_session.add(Player(team_id=team.id, name=name, is_coach=True))
    db_session.commit()
    names = [p["name"] for p in client.get(f"/teams/{team.id}/players").json()]
    assert names == ["Coach A", "Coach B", "Numbered", "Unnumbered"]


def test_linked_user_edits_own_coach_row(client: TestClient, db_session: Session, own_team: Team) -> None:
    user = _login_user(client, db_session, "me", Membership(team_id=own_team.id, role="member"))
    coach = Player(team_id=own_team.id, name="Coach", is_coach=True, user_id=user.id)
    db_session.add(coach)
    db_session.commit()
    response = client.patch(f"/teams/{own_team.id}/players/{coach.id}", json={"name": "New"})
    assert response.status_code == 200
