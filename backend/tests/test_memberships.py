import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AdminUser, Membership, Team
from app.security import hash_password
from tests.test_team_admin import _login_user


def _pending(db: Session, *rows: Membership) -> list[int]:
    """Adds each row for its own throwaway requester (who has an email) and returns the ids."""
    for row in rows:
        n = db.scalar(select(func.count(AdminUser.id)))
        user = AdminUser(username=f"req{n}", email=f"secret{n}@example.com", password_hash="x")
        db.add(user)
        db.flush()
        row.user_id = user.id
        db.add(row)
    db.commit()
    return [row.id for row in rows]


def _role(db: Session, membership_id: int) -> str | None:
    db.expire_all()
    return db.scalar(select(Membership.role).where(Membership.id == membership_id))


def test_anonymous_cannot_request_or_list(client: TestClient, own_team: Team) -> None:
    assert client.post("/memberships", json={"team_id": own_team.id}).status_code == 401
    assert client.get("/memberships").status_code == 401


def test_join_request_is_always_pending(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    _login_user(client, db_session, "player")
    r = client.post(
        "/memberships", json={"team_id": own_team.id, "role": "admin", "is_full_admin": True}
    )
    assert r.status_code == 201 and r.json()["role"] == "pending"
    me = client.get("/auth/me").json()
    assert me["is_admin"] is False
    assert [(m["team_id"], m["role"]) for m in me["memberships"]] == [(own_team.id, "pending")]
    assert (
        db_session.scalar(select(AdminUser.is_full_admin).where(AdminUser.username == "player"))
        is False
    )


def test_join_requires_exactly_one_existing_scope(
    client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    _login_user(client, db_session, "player")
    assert (
        client.post("/memberships", json={"team_id": sibling_team.id, "club": "Gush"}).status_code
        == 422
    )
    assert client.post("/memberships", json={}).status_code == 422
    assert client.post("/memberships", json={"team_id": 9999}).status_code == 404
    assert client.post("/memberships", json={"club": "Nope"}).status_code == 404
    assert client.post("/memberships", json={"club": "Gush"}).status_code == 201


def test_duplicate_or_existing_membership_is_409(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    client = team_admin_client
    assert (
        client.post("/memberships", json={"team_id": own_team.id}).status_code == 409
    )  # already its admin
    client.post("/auth/logout")
    _login_user(client, db_session, "player")
    assert client.post("/memberships", json={"team_id": own_team.id}).status_code == 201
    assert client.post("/memberships", json={"team_id": own_team.id}).status_code == 409
    assert (
        db_session.scalar(
            select(func.count(Membership.id)).where(Membership.team_id == own_team.id)
        )
        == 2
    )


def test_list_is_scoped(
    request: pytest.FixtureRequest,
    db_session: Session,
    own_team: Team,
    sibling_team: Team,
    other_team: Team,
) -> None:
    _pending(
        db_session,
        Membership(team_id=own_team.id, role="pending"),
        Membership(team_id=sibling_team.id, role="pending"),
        Membership(team_id=other_team.id, role="pending"),
        Membership(club="Gush", role="pending"),
        Membership(team_id=own_team.id, role="member"),
    )
    for fixture, count in {
        "admin_client": 5,
        "team_admin_client": 2,
        "club_admin_client": 3,
    }.items():
        client = request.getfixturevalue(fixture)
        response = client.get("/memberships")
        assert response.status_code == 200
        items = response.json()
        assert len(items) == count, fixture
        assert all("email" not in i for i in items) and "secret" not in response.text
        assert all("role" in i for i in items)
        assert [i["team_id"] for i in items if i["role"] == "member"] == [own_team.id]
        if fixture == "club_admin_client":
            assert {i["team_id"] for i in items} == {own_team.id, sibling_team.id}
        client.post("/auth/logout")


def test_queue_shows_masked_email_and_flags_unverified(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    _pending(db_session, Membership(team_id=own_team.id, role="pending"))
    unverified = AdminUser(username="noemail", email=None, password_hash="x")
    db_session.add(unverified)
    db_session.flush()
    db_session.add(Membership(user_id=unverified.id, team_id=own_team.id, role="pending"))
    db_session.commit()
    response = team_admin_client.get("/memberships")
    first, second = response.json()
    assert first["email_hint"] == "s***@example.com"
    assert second["email_hint"] is None
    assert second["display_name"] == "noemail"
    assert "secret" not in response.text


def test_team_admin_approves_own_team_request_only(
    team_admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    mine, theirs = _pending(
        db_session,
        Membership(team_id=own_team.id, role="pending"),
        Membership(team_id=other_team.id, role="pending"),
    )
    assert team_admin_client.post(f"/memberships/{mine}/approve").status_code == 204
    assert _role(db_session, mine) == "member"
    assert team_admin_client.post(f"/memberships/{theirs}/approve").status_code == 403
    assert team_admin_client.delete(f"/memberships/{theirs}").status_code == 403
    assert _role(db_session, theirs) == "pending"


def test_club_admin_scope(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team, other_team: Team
) -> None:
    c = club_admin_client
    inside, outside, club = _pending(
        db_session,
        Membership(team_id=sibling_team.id, role="pending"),
        Membership(team_id=other_team.id, role="pending"),
        Membership(club="Gush", role="pending"),
    )
    assert c.post(f"/memberships/{inside}/approve").status_code == 204
    assert c.post(f"/memberships/{outside}/approve").status_code == 403
    assert c.post(f"/memberships/{club}/approve").status_code == 403
    assert c.delete(f"/memberships/{club}").status_code == 403
    assert _role(db_session, club) == "pending" and _role(db_session, outside) == "pending"


def test_club_request_needs_full_admin(
    team_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    c = team_admin_client
    (club,) = _pending(db_session, Membership(club="Gush", role="pending"))
    assert c.post(f"/memberships/{club}/approve").status_code == 403
    c.post("/auth/logout")
    db_session.add(
        AdminUser(username="boss", password_hash=hash_password("password123"), is_full_admin=True)
    )
    db_session.commit()
    assert (
        c.post("/auth/login", json={"username": "boss", "password": "password123"}).status_code
        == 200
    )
    assert c.post(f"/memberships/{club}/approve").status_code == 204
    assert _role(db_session, club) == "member"


def test_approve_never_grants_admin(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    c = team_admin_client
    c.post("/auth/logout")
    _login_user(c, db_session, "player")
    mid = c.post("/memberships", json={"team_id": own_team.id}).json()["id"]
    c.post("/auth/logout")
    assert (
        c.post("/auth/login", json={"username": "teamadmin", "password": "password123"}).status_code
        == 200
    )
    assert c.post(f"/memberships/{mid}/approve").status_code == 204
    c.post("/auth/logout")
    assert (
        c.post("/auth/login", json={"username": "player", "password": "password123"}).status_code
        == 200
    )
    me = c.get("/auth/me").json()
    assert me["is_admin"] is False and me["team_ids"] == []
    assert [m["role"] for m in me["memberships"]] == ["member"]
    assert (
        c.patch(
            f"/teams/{own_team.id}", json={"facebook_url": "https://facebook.com/x"}
        ).status_code
        == 403
    )


def test_approve_only_pending_and_admin_rows_never_removed(
    team_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    c = team_admin_client
    pending, member = _pending(
        db_session,
        Membership(team_id=own_team.id, role="pending"),
        Membership(team_id=own_team.id, role="member"),
    )
    admin_row = db_session.scalar(select(Membership.id).where(Membership.role == "admin"))
    assert c.post(f"/memberships/{pending}/approve").status_code == 204
    assert c.post(f"/memberships/{pending}/approve").status_code == 404
    assert c.post(f"/memberships/{member}/approve").status_code == 404
    assert c.post(f"/memberships/{admin_row}/approve").status_code == 404
    assert c.delete(f"/memberships/{admin_row}").status_code == 404
    assert c.delete(f"/memberships/{member}").status_code == 204
    assert _role(db_session, member) is None and _role(db_session, admin_row) == "admin"


def test_admin_removes_member_in_scope_only(
    team_admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    c = team_admin_client
    own, other, club = _pending(
        db_session,
        Membership(team_id=own_team.id, role="member"),
        Membership(team_id=other_team.id, role="member"),
        Membership(club="Gush", role="member"),
    )
    assert c.delete(f"/memberships/{own}").status_code == 204
    assert c.delete(f"/memberships/{other}").status_code == 403
    assert c.delete(f"/memberships/{club}").status_code == 403
    assert _role(db_session, own) is None
    assert _role(db_session, other) == "member" and _role(db_session, club) == "member"
    # removal revokes /stats access on the player's next request
    c.post("/auth/logout")
    _login_user(c, db_session, "player", Membership(team_id=own_team.id, role="member"))
    assert c.get(f"/teams/{own_team.id}/lineups").status_code == 200
    player_row = db_session.scalar(
        select(Membership.id).where(Membership.role == "member", Membership.team_id == own_team.id)
    )
    c.post("/auth/logout")
    assert (
        c.post("/auth/login", json={"username": "teamadmin", "password": "password123"}).status_code
        == 200
    )
    assert c.delete(f"/memberships/{player_row}").status_code == 204
    c.post("/auth/logout")
    assert (
        c.post("/auth/login", json={"username": "player", "password": "password123"}).status_code
        == 200
    )
    assert c.get(f"/teams/{own_team.id}/lineups").status_code == 403
    assert c.get("/auth/me").json()["can_view_stats"] is False


def test_user_leaves_own_pending_or_member_row(
    client: TestClient, db_session: Session, own_team: Team, sibling_team: Team, other_team: Team
) -> None:
    (theirs,) = _pending(db_session, Membership(team_id=own_team.id, role="pending"))
    _login_user(
        client,
        db_session,
        "player",
        Membership(team_id=own_team.id, role="pending"),
        Membership(team_id=sibling_team.id, role="member"),
        Membership(team_id=other_team.id, role="admin"),
    )
    mine = {m["role"]: m["id"] for m in client.get("/auth/me").json()["memberships"]}
    assert client.delete(f"/memberships/mine/{mine['pending']}").status_code == 204
    assert client.delete(f"/memberships/mine/{mine['member']}").status_code == 204
    assert client.delete(f"/memberships/mine/{mine['admin']}").status_code == 404
    assert client.delete(f"/memberships/mine/{theirs}").status_code == 404
    assert _role(db_session, mine["admin"]) == "admin" and _role(db_session, theirs) == "pending"
    assert _role(db_session, mine["pending"]) is None and _role(db_session, mine["member"]) is None
    assert client.post("/memberships", json={"team_id": own_team.id}).status_code == 201
    client.post("/auth/logout")
    assert client.delete(f"/memberships/mine/{theirs}").status_code == 401


def test_reject_deletes_pending_row_and_player_can_ask_again(
    client: TestClient, db_session: Session, own_team: Team
) -> None:
    _login_user(client, db_session, "player")
    mid = client.post("/memberships", json={"team_id": own_team.id}).json()["id"]
    client.post("/auth/logout")
    _login_user(client, db_session, "coach", Membership(team_id=own_team.id, role="admin"))
    assert client.delete(f"/memberships/{mid}").status_code == 204
    assert _role(db_session, mid) is None
    client.post("/auth/logout")
    assert (
        client.post(
            "/auth/login", json={"username": "player", "password": "password123"}
        ).status_code
        == 200
    )
    assert client.post("/memberships", json={"team_id": own_team.id}).status_code == 201


def test_signup_emails_not_exposed_to_admins(
    club_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    _pending(db_session, Membership(team_id=sibling_team.id, role="pending"))
    assert "@" not in club_admin_client.get("/teams/assignable-users").text
    assert "secret" not in club_admin_client.get("/memberships").text
