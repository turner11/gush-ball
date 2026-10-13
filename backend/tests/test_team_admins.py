import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminUser, Membership, Team
from app.security import hash_password

NEW = {"username": "coach", "password": "longenough"}


def _grants(db: Session, user: AdminUser) -> list[tuple[int | None, str | None, str]]:
    rows = db.scalars(select(Membership).where(Membership.user_id == user.id).order_by(Membership.id))
    return [(m.team_id, m.club, m.role) for m in rows]


@pytest.fixture()
def other_team(db_session: Session) -> Team:
    team = Team(name="Other", slug="other")
    db_session.add(team)
    db_session.commit()
    return team


def _member(db_session: Session, team: Team | None = None, role: str = "admin") -> AdminUser:
    member = AdminUser(username="member", password_hash=hash_password("password123"))
    db_session.add(member)
    db_session.flush()
    if team is not None:
        db_session.add(Membership(user_id=member.id, team_id=team.id, role=role))
    db_session.commit()
    return member


def test_full_admin_creates_lists_and_deletes_team_admin(
    admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    url = f"/teams/{own_team.id}/admins"
    created = admin_client.post(url, json=NEW)
    assert created.status_code == 201
    body = created.json()
    assert set(body) == {"id", "username", "email", "club"}
    assert body["username"] == "coach"

    row = db_session.scalar(select(AdminUser).where(AdminUser.username == "coach"))
    assert _grants(db_session, row) == [(own_team.id, None, "admin")]
    assert row.is_full_admin is False
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
    assert admin_client.post(url, json={**NEW, "username": "coach@club"}).status_code == 422  # login would treat it as an email
    assert admin_client.post(url, json={**NEW, "username": "x" * 65}).status_code == 422  # login caps at 64
    assert db_session.scalar(select(AdminUser).where(AdminUser.username == "coach")) is None


def test_username_is_stripped(admin_client: TestClient, db_session: Session, own_team: Team) -> None:
    assert admin_client.post(f"/teams/{own_team.id}/admins", json={**NEW, "username": " coach "}).status_code == 201
    assert db_session.scalar(select(AdminUser).where(AdminUser.username == "coach")) is not None


def test_unknown_team_404(admin_client: TestClient) -> None:
    assert admin_client.post("/teams/9999/admins", json=NEW).status_code == 404
    assert admin_client.get("/teams/9999/admins").status_code == 404


def test_delete_cannot_reach_full_admin_or_other_team(
    admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    full = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    member = _member(db_session, own_team)

    assert admin_client.delete(f"/teams/{own_team.id}/admins/{full.id}").status_code == 404
    assert admin_client.delete(f"/teams/{other_team.id}/admins/{member.id}").status_code == 404
    db_session.expire_all()
    assert db_session.get(AdminUser, full.id) is not None
    assert db_session.get(AdminUser, member.id) is not None


def test_team_admin_cannot_manage_admins(team_admin_client: TestClient, own_team: Team) -> None:
    client = team_admin_client
    url = f"/teams/{own_team.id}/admins"
    assert client.get(url).status_code == 403
    assert client.post(url, json=NEW).status_code == 403
    assert client.delete(f"{url}/1").status_code == 403
    assert client.get("/teams/assignable-users").status_code == 403
    assert client.put(f"{url}/1").status_code == 403


def test_anonymous_401(client: TestClient) -> None:
    assert client.get("/teams/1/admins").status_code == 401
    assert client.get("/teams/assignable-users").status_code == 401
    assert client.put("/teams/1/admins/1").status_code == 401


def test_remove_admin_keeps_account_and_ends_rights_immediately(
    admin_client: TestClient, client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    user = _member(db_session, own_team)
    db_session.add(Membership(user_id=user.id, team_id=other_team.id, role="admin"))
    db_session.commit()
    player = TestClient(client.app)
    assert player.post("/auth/login", json={"username": "member", "password": "password123"}).status_code == 200
    patch = {"facebook_url": "https://facebook.com/x"}
    assert player.patch(f"/teams/{own_team.id}", json=patch).status_code == 200

    assert admin_client.delete(f"/teams/{own_team.id}/admins/{user.id}").status_code == 204

    assert player.patch(f"/teams/{own_team.id}", json=patch).status_code == 403
    assert player.patch(f"/teams/{other_team.id}", json=patch).status_code == 200
    assert player.get("/auth/me").status_code == 200
    assert db_session.get(AdminUser, user.id) is not None
    assert _grants(db_session, user) == [(other_team.id, None, "admin")]


def test_team_admin_email_is_saved_lowercase_and_unique(
    admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    url = f"/teams/{own_team.id}/admins"
    created = admin_client.post(url, json={**NEW, "email": " Coach@Club.COM "})
    assert created.status_code == 201
    assert created.json()["email"] == "coach@club.com"
    row = db_session.scalar(select(AdminUser).where(AdminUser.username == "coach"))
    assert row.email == "coach@club.com"

    dup = {"username": "coach2", "password": "longenough", "email": "COACH@club.com"}
    assert admin_client.post(url, json=dup).status_code == 409
    assert admin_client.post(url, json={**dup, "email": "not-an-email"}).status_code == 422

    plain = admin_client.post(url, json={**dup, "email": None})
    assert plain.status_code == 201
    assert plain.json()["email"] is None


def test_full_admin_creates_club_admin(
    admin_client: TestClient, client: TestClient, db_session: Session, own_team: Team, sibling_team: Team
) -> None:
    created = admin_client.post(f"/teams/{own_team.id}/admins", json={**NEW, "scope": "club"})
    assert created.status_code == 201
    assert created.json()["club"] == "Gush"
    row = db_session.scalar(select(AdminUser).where(AdminUser.username == "coach"))
    assert _grants(db_session, row) == [(None, "Gush", "admin")]

    sibling_url = f"/teams/{sibling_team.id}/admins"
    assert [a["username"] for a in admin_client.get(sibling_url).json()] == ["coach"]
    assert admin_client.delete(f"{sibling_url}/{created.json()['id']}").status_code == 204

    admin_client.post(f"/teams/{own_team.id}/admins", json={**NEW, "scope": "club"})
    assert client.post("/auth/login", json=NEW).status_code == 200
    ids = client.get("/auth/me").json()["team_ids"]
    assert sorted(ids) == sorted([own_team.id, sibling_team.id])


def test_club_scope_requires_team_club(admin_client: TestClient, own_team: Team) -> None:
    r = admin_client.post(f"/teams/{own_team.id}/admins", json={**NEW, "scope": "club"})
    assert r.status_code == 409


def test_clubless_team_cannot_reach_full_admin(
    admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    full = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    club_admin = _member(db_session)
    db_session.add(Membership(user_id=club_admin.id, club="Gush", role="admin"))
    db_session.commit()
    url = f"/teams/{own_team.id}/admins"
    assert own_team.club is None
    assert admin_client.get(url).json() == []
    assert admin_client.delete(f"{url}/{full.id}").status_code == 404


def test_assign_adds_without_moving(
    admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    member = _member(db_session, other_team)
    url = f"/teams/{own_team.id}/admins/{member.id}"
    assert admin_client.put(url).status_code == 204
    assert admin_client.put(url).status_code == 204  # idempotent
    assert _grants(db_session, member) == [(other_team.id, None, "admin"), (own_team.id, None, "admin")]
    assert [a["id"] for a in admin_client.get(f"/teams/{own_team.id}/admins").json()] == [member.id]


def test_assign_promotes_existing_member_row(admin_client: TestClient, db_session: Session, own_team: Team) -> None:
    member = _member(db_session, own_team, role="member")
    assert admin_client.put(f"/teams/{own_team.id}/admins/{member.id}").status_code == 204
    assert _grants(db_session, member) == [(own_team.id, None, "admin")]


def test_assign_club_scope_by_full_admin(
    admin_client: TestClient, db_session: Session, own_team: Team, sibling_team: Team
) -> None:
    member = _member(db_session)
    r = admin_client.put(f"/teams/{own_team.id}/admins/{member.id}", json={"scope": "club"})
    assert r.status_code == 204
    assert _grants(db_session, member) == [(None, "Gush", "admin")]


def test_club_admin_assigns_team_admin_in_own_club(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    member = _member(db_session)
    assert club_admin_client.put(f"/teams/{sibling_team.id}/admins/{member.id}").status_code == 204
    assert _grants(db_session, member) == [(sibling_team.id, None, "admin")]
    assert [a["id"] for a in club_admin_client.get(f"/teams/{sibling_team.id}/admins").json()] == [member.id]


def test_club_admin_cannot_assign_outside_club(
    club_admin_client: TestClient, db_session: Session, other_team: Team
) -> None:
    member = _member(db_session)
    outsider = Team(name="X team", slug="x-team", club="X")
    db_session.add(outsider)
    db_session.commit()
    for team in (other_team, outsider):
        assert club_admin_client.put(f"/teams/{team.id}/admins/{member.id}").status_code == 403
    assert _grants(db_session, member) == []


def test_club_admin_cannot_grant_or_revoke_club_admin(
    club_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    member = _member(db_session)
    url = f"/teams/{own_team.id}/admins/{member.id}"
    assert club_admin_client.put(url, json={"scope": "club"}).status_code == 403
    assert _grants(db_session, member) == []

    db_session.add(Membership(user_id=member.id, club="Gush", role="admin"))
    db_session.commit()
    assert club_admin_client.delete(f"{url}?scope=club").status_code == 403
    assert _grants(db_session, member) == [(None, "Gush", "admin")]


def test_club_admin_can_revoke_team_admin_in_own_club(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    member = _member(db_session, sibling_team)
    assert club_admin_client.delete(f"/teams/{sibling_team.id}/admins/{member.id}").status_code == 204
    assert _grants(db_session, member) == []


def test_club_admin_cannot_create_accounts(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    assert club_admin_client.post(f"/teams/{sibling_team.id}/admins", json=NEW).status_code == 403
    assert db_session.scalar(select(AdminUser).where(AdminUser.username == "coach")) is None


def test_nothing_creates_or_demotes_full_admin(
    admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    full = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    url = f"/teams/{own_team.id}/admins"
    assert admin_client.put(f"{url}/{full.id}").status_code == 404
    assert admin_client.delete(f"{url}/{full.id}").status_code == 404
    created = admin_client.post(url, json={**NEW, "is_full_admin": True})
    assert created.status_code == 201
    coach = db_session.scalar(select(AdminUser).where(AdminUser.username == "coach"))
    assert coach.is_full_admin is False
    db_session.refresh(full)
    assert full.is_full_admin is True
    assert _grants(db_session, full) == []


def test_assign_unknown_team_404(admin_client: TestClient, db_session: Session, other_team: Team) -> None:
    member = _member(db_session, other_team)
    assert admin_client.put(f"/teams/9999/admins/{member.id}").status_code == 404


def test_list_assignable_users(admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team) -> None:
    clubby = _member(db_session)
    db_session.add(Membership(user_id=clubby.id, club="Gush", role="admin"))
    db_session.add(Membership(user_id=clubby.id, team_id=other_team.id, role="admin"))
    db_session.add(Membership(user_id=clubby.id, team_id=own_team.id, role="member"))
    db_session.commit()
    response = admin_client.get("/teams/assignable-users")  # static route must not be shadowed by /{team_id}
    assert response.status_code == 200
    assert response.json() == [{"id": clubby.id, "username": "member", "team_ids": [other_team.id]}]


def test_assignable_users_open_to_club_admin_only_below_full(
    club_admin_client: TestClient, db_session: Session
) -> None:
    _member(db_session)
    response = club_admin_client.get("/teams/assignable-users")
    assert response.status_code == 200
    assert all("email" not in row for row in response.json())
