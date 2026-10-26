import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import check_not_last_full_admin
from app.models import AdminUser, Membership, Team
from app.security import hash_password


def _user(db: Session, username: str, email: str | None = None, full: bool = False) -> AdminUser:
    user = AdminUser(username=username, email=email, password_hash=hash_password("password123"), is_full_admin=full)
    db.add(user)
    db.commit()
    return user


def test_full_admin_lists_users_with_memberships(admin_client: TestClient, db_session: Session, own_team: Team):
    player = _user(db_session, "zed", "zed@example.com")
    boss = _user(db_session, "bob", "bob@example.com")
    db_session.add_all(
        [
            Membership(user_id=player.id, team_id=own_team.id, role="pending"),
            Membership(user_id=boss.id, club="Gush", role="admin"),
        ]
    )
    db_session.commit()

    rows = admin_client.get("/users").json()

    assert [r["username"] for r in rows] == ["admin", "bob", "zed"]
    assert all(set(r) == {"id", "username", "display_name", "email", "memberships"} for r in rows)
    by_name = {r["username"]: r for r in rows}
    assert by_name["zed"]["email"] == "zed@example.com"
    assert by_name["zed"]["memberships"] == [{"team_id": own_team.id, "team_name": "Own", "club": None, "role": "pending"}]
    assert by_name["bob"]["memberships"] == [{"team_id": None, "team_name": None, "club": "Gush", "role": "admin"}]
    assert by_name["admin"]["memberships"] == []


@pytest.mark.parametrize(("method", "path"), [("get", "/users"), ("delete", "/users/1")])
def test_user_admin_routes_need_full_admin(client: TestClient, request, method: str, path: str):
    assert getattr(client, method)(path).status_code == 401
    request.getfixturevalue("team_admin_client")
    assert getattr(client, method)(path).status_code == 403


def test_full_admin_deletes_user_and_their_memberships(admin_client: TestClient, db_session: Session, own_team: Team):
    victim = _user(db_session, "victim")
    victim_id = victim.id
    db_session.add(Membership(user_id=victim_id, team_id=own_team.id, role="member"))
    db_session.commit()

    assert admin_client.delete(f"/users/{victim_id}").status_code == 204

    db_session.expire_all()
    assert db_session.get(AdminUser, victim_id) is None
    assert db_session.scalars(select(Membership).where(Membership.user_id == victim_id)).all() == []


def test_full_admin_cannot_delete_self(admin_client: TestClient, db_session: Session):
    me = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))

    assert admin_client.delete(f"/users/{me.id}").status_code == 409
    assert db_session.get(AdminUser, me.id) is not None


def test_delete_unknown_user_is_404(admin_client: TestClient):
    assert admin_client.delete("/users/9999").status_code == 404


def test_full_admin_can_delete_another_full_admin(admin_client: TestClient, db_session: Session):
    other = _user(db_session, "boss2", full=True)

    assert admin_client.delete(f"/users/{other.id}").status_code == 204


def test_check_not_last_full_admin(db_session: Session):
    sole = _user(db_session, "sole", full=True)
    plain = _user(db_session, "plain")

    with pytest.raises(HTTPException) as exc:
        check_not_last_full_admin(db_session, sole)
    assert exc.value.status_code == 409
    assert check_not_last_full_admin(db_session, plain) is None

    _user(db_session, "second", full=True)
    assert check_not_last_full_admin(db_session, sole) is None


def _memberships(db: Session, user_id: int, team_id: int) -> list[Membership]:
    db.expire_all()
    return list(db.scalars(select(Membership).where(Membership.user_id == user_id, Membership.team_id == team_id)))


def test_full_admin_assigns_user_to_team_as_member(admin_client: TestClient, db_session: Session, own_team: Team):
    player = _user(db_session, "fresh")

    response = admin_client.put(f"/users/{player.id}/teams/{own_team.id}")

    assert response.status_code == 200
    assert response.json() == {"team_id": own_team.id, "team_name": "Own", "club": None, "role": "member"}
    assert len(_memberships(db_session, player.id, own_team.id)) == 1
    by_name = {r["username"]: r for r in admin_client.get("/users").json()}
    assert by_name["fresh"]["memberships"] == [response.json()]


@pytest.mark.parametrize(("before", "after"), [("pending", "member"), ("member", "member"), ("admin", "admin")])
def test_assign_upserts_existing_row(
    admin_client: TestClient, db_session: Session, own_team: Team, before: str, after: str
):
    player = _user(db_session, "existing")
    row = Membership(user_id=player.id, team_id=own_team.id, role=before)
    db_session.add(row)
    db_session.commit()
    row_id = row.id

    response = admin_client.put(f"/users/{player.id}/teams/{own_team.id}")

    assert response.status_code == 200
    assert response.json()["role"] == after
    rows = _memberships(db_session, player.id, own_team.id)
    assert [(r.id, r.role) for r in rows] == [(row_id, after)]


def test_assign_to_team_is_full_admin_only(client: TestClient, db_session: Session, own_team: Team, request):
    player = _user(db_session, "target")
    path = f"/users/{player.id}/teams/{own_team.id}"
    assert client.put(path).status_code == 401
    request.getfixturevalue("team_admin_client")
    assert client.put(path).status_code == 403
    client.post("/auth/logout")
    request.getfixturevalue("club_admin_client")
    assert client.put(path).status_code == 403
    assert _memberships(db_session, player.id, own_team.id) == []


def test_assign_to_team_unknown_user_or_team_is_404(admin_client: TestClient, db_session: Session, own_team: Team):
    player = _user(db_session, "someone")

    missing_user = admin_client.put(f"/users/9999/teams/{own_team.id}")
    assert missing_user.status_code == 404
    assert missing_user.json()["detail"] == "User 9999 not found"
    assert admin_client.put(f"/users/{player.id}/teams/9999").status_code == 404
