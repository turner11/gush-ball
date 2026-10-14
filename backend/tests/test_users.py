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
    assert all(set(r) == {"id", "username", "email", "memberships"} for r in rows)
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
