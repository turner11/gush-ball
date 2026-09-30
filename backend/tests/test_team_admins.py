import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminUser, Team
from app.security import hash_password

NEW = {"username": "coach", "password": "longenough"}


@pytest.fixture()
def other_team(db_session: Session) -> Team:
    team = Team(name="Other", slug="other")
    db_session.add(team)
    db_session.commit()
    return team


def test_full_admin_creates_lists_and_deletes_team_admin(
    admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    url = f"/teams/{own_team.id}/admins"
    created = admin_client.post(url, json=NEW)
    assert created.status_code == 201
    body = created.json()
    assert set(body) == {"id", "username"}
    assert body["username"] == "coach"

    row = db_session.scalar(select(AdminUser).where(AdminUser.username == "coach"))
    assert row.team_id == own_team.id
    assert row.password_hash != "longenough"

    assert admin_client.get(url).json() == [body]
    assert admin_client.delete(f"{url}/{body['id']}").status_code == 204
    assert admin_client.get(url).json() == []


def test_created_team_admin_can_log_in_scoped(
    admin_client: TestClient, client: TestClient, own_team: Team
) -> None:
    assert admin_client.post(f"/teams/{own_team.id}/admins", json=NEW).status_code == 201
    assert client.post("/auth/login", json=NEW).status_code == 200
    assert client.get("/auth/me").json()["team_id"] == own_team.id


def test_duplicate_username_409(admin_client: TestClient, own_team: Team) -> None:
    url = f"/teams/{own_team.id}/admins"
    assert admin_client.post(url, json=NEW).status_code == 201
    assert admin_client.post(url, json=NEW).status_code == 409
    assert admin_client.post(url, json={**NEW, "username": "admin"}).status_code == 409


def test_invalid_input_422(admin_client: TestClient, db_session: Session, own_team: Team) -> None:
    url = f"/teams/{own_team.id}/admins"
    assert admin_client.post(url, json={**NEW, "password": "1234567"}).status_code == 422
    assert admin_client.post(url, json={**NEW, "username": ""}).status_code == 422
    assert db_session.scalar(select(AdminUser).where(AdminUser.username == "coach")) is None


def test_unknown_team_404(admin_client: TestClient) -> None:
    assert admin_client.post("/teams/9999/admins", json=NEW).status_code == 404
    assert admin_client.get("/teams/9999/admins").status_code == 404


def test_delete_cannot_reach_full_admin_or_other_team(
    admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    full = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    member = AdminUser(username="member", password_hash=hash_password("password123"), team_id=own_team.id)
    db_session.add(member)
    db_session.commit()

    assert admin_client.delete(f"/teams/{own_team.id}/admins/{full.id}").status_code == 404
    assert admin_client.delete(f"/teams/{other_team.id}/admins/{member.id}").status_code == 404
    db_session.expire_all()
    assert db_session.get(AdminUser, full.id) is not None
    assert db_session.get(AdminUser, member.id) is not None


def test_team_admin_cannot_manage_admins(team_admin_client: TestClient, own_team: Team) -> None:
    url = f"/teams/{own_team.id}/admins"
    assert team_admin_client.get(url).status_code == 403
    assert team_admin_client.post(url, json=NEW).status_code == 403
    assert team_admin_client.delete(f"{url}/1").status_code == 403


def test_anonymous_401(client: TestClient) -> None:
    assert client.get("/teams/1/admins").status_code == 401


def test_deleted_admin_session_ends_immediately(
    team_admin_client: TestClient, db_session: Session
) -> None:
    assert team_admin_client.get("/auth/me").status_code == 200
    db_session.delete(db_session.scalar(select(AdminUser).where(AdminUser.username == "teamadmin")))
    db_session.commit()
    assert team_admin_client.get("/auth/me").status_code == 401
