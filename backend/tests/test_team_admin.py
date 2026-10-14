import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import AdminUser, Membership, Player, PlayerImage, Team
from app.security import hash_password


@pytest.mark.parametrize("scoped_client", ["team_admin_client", "club_admin_client"])
def test_team_admin_forbidden_on_every_other_team_write(
    scoped_client: str, request: pytest.FixtureRequest, other_team: Team
) -> None:
    """Sweeps every team-scoped write route, so a route that forgets the scope check fails here."""
    client = request.getfixturevalue(scoped_client)
    exercised = 0
    # openapi() flattens included routers (app.routes doesn't expose them directly)
    for route_path, operations in app.openapi()["paths"].items():
        if "{team_id}" not in route_path:
            continue
        for method in operations.keys() & {"post", "patch", "put", "delete"}:
            path = route_path.replace("{team_id}", str(other_team.id))
            path = re.sub(r"\{[^}]+\}", "1", path)
            response = client.request(method.upper(), path, json={})
            assert response.status_code == 403, f"{method} {route_path} -> {response.status_code}"
            exercised += 1
    assert exercised >= 20


@pytest.mark.parametrize("scoped_client", ["team_admin_client", "club_admin_client"])
def test_team_admin_forbidden_reading_other_team_admin_lists(
    scoped_client: str, request: pytest.FixtureRequest, other_team: Team
) -> None:
    client = request.getfixturevalue(scoped_client)
    assert client.get(f"/teams/{other_team.id}/games/pending-review").status_code == 403
    assert client.get(f"/teams/{other_team.id}/players/deleted").status_code == 403


def test_team_admin_can_write_own_team(team_admin_client: TestClient, own_team: Team) -> None:
    c, t = team_admin_client, own_team.id
    assert (
        c.patch(f"/teams/{t}", json={"facebook_url": "https://facebook.com/own"}).status_code == 200
    )
    assert c.post(f"/teams/{t}/posts", json={"title": "Hi", "body": "Body"}).status_code == 201
    assert c.post(f"/teams/{t}/players", json={"name": "Dana"}).status_code == 201
    game = c.post(
        f"/teams/{t}/games",
        json={
            "opponent_name": "Opp",
            "scheduled_at": datetime(2026, 1, 1, 18, 0, tzinfo=UTC).isoformat(),
            "is_home": True,
        },
    )
    assert game.status_code == 201
    assert c.post(f"/teams/{t}/games/{game.json()['id']}/approve").status_code == 200
    assert c.delete(f"/teams/{t}/games/{game.json()['id']}/stats").status_code == 204


@pytest.mark.parametrize("scoped_client", ["team_admin_client", "club_admin_client"])
def test_team_admin_cannot_do_club_wide_actions(
    scoped_client: str, request: pytest.FixtureRequest, own_team: Team
) -> None:
    client = request.getfixturevalue(scoped_client)
    assert client.post("/teams", json={"name": "New"}).status_code == 403
    assert client.delete(f"/teams/{own_team.id}").status_code == 403
    preview = {"club_url": "https://ibasketball.co.il/club/1/"}
    assert client.post("/teams/club-preview", json=preview).status_code == 403
    assert client.get("/teams/club-preview/status").status_code == 403
    row = {
        "league_name": "L", "team_name": "T", "rank": 1, "played": 1, "won": 1,
        "lost": 0, "points_for": 1, "points_against": 0, "points": 2,
    }  # fmt: skip
    assert client.post("/standings", json=row).status_code == 403


def test_team_admin_player_images_scoped(
    team_admin_client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    own_player = Player(team_id=own_team.id, name="Mine")
    other_player = Player(team_id=other_team.id, name="Theirs")
    db_session.add_all([own_player, other_player])
    db_session.commit()
    img = PlayerImage(player_id=other_player.id, url="https://x.test/a.png")
    db_session.add(img)
    db_session.commit()
    body = {"url": "https://x.test/b.png"}

    assert (
        team_admin_client.post(f"/players/{other_player.id}/images", json=body).status_code == 403
    )
    r = team_admin_client.delete(f"/players/{other_player.id}/images/{img.id}")
    assert r.status_code == 403
    assert db_session.get(PlayerImage, img.id) is not None
    assert team_admin_client.post(f"/players/{own_player.id}/images", json=body).status_code == 201


def test_me_reports_team_scope(team_admin_client: TestClient, own_team: Team) -> None:
    me = team_admin_client.get("/auth/me").json()
    assert (me["username"], me["team_id"]) == ("teamadmin", own_team.id)
    assert me["team_ids"] == [own_team.id]


def test_me_reports_club_scope(
    club_admin_client: TestClient, own_team: Team, sibling_team: Team
) -> None:
    me = club_admin_client.get("/auth/me").json()
    assert me["team_id"] is None
    assert sorted(me["team_ids"]) == sorted([own_team.id, sibling_team.id])


def test_club_admin_can_write_every_team_in_club(
    club_admin_client: TestClient, own_team: Team, sibling_team: Team
) -> None:
    for team in (own_team, sibling_team):
        r = club_admin_client.patch(
            f"/teams/{team.id}", json={"facebook_url": "https://facebook.com/x"}
        )
        assert r.status_code == 200
        assert (
            club_admin_client.post(f"/teams/{team.id}/players", json={"name": "Dana"}).status_code
            == 201
        )


def test_only_full_admin_changes_team_club(
    club_admin_client: TestClient, db_session: Session, own_team: Team
) -> None:
    url = f"/teams/{own_team.id}"
    assert club_admin_client.patch(url, json={"club": "Other"}).status_code == 403
    db_session.refresh(own_team)
    assert own_team.club == "Gush"
    assert club_admin_client.patch(url, json={"club": "Gush"}).status_code == 200


def test_me_full_admin_has_no_team_scope(admin_client: TestClient) -> None:
    me = admin_client.get("/auth/me").json()
    assert (me["username"], me["team_id"]) == ("admin", None)
    assert me["team_ids"] is None


def test_membership_fks_cascade() -> None:
    # SQLite tests run with FKs off; a missing CASCADE would leave a deleted team's/user's grants behind.
    for column in (Membership.__table__.c.user_id, Membership.__table__.c.team_id):
        (fk,) = column.foreign_keys
        assert fk.ondelete == "CASCADE"


def _login_user(
    client: TestClient, db_session: Session, username: str, *memberships: Membership
) -> None:
    user = AdminUser(username=username, password_hash=hash_password("password123"))
    db_session.add(user)
    db_session.flush()
    for m in memberships:
        m.user_id = user.id
        db_session.add(m)
    db_session.commit()
    assert (
        client.post(
            "/auth/login", json={"username": username, "password": "password123"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("role", [None, "pending", "member"])
def test_user_without_admin_grant_is_403_on_admin_routes(
    role: str | None, client: TestClient, db_session: Session, own_team: Team
) -> None:
    grants = [Membership(team_id=own_team.id, role=role)] if role else []
    _login_user(client, db_session, "player", *grants)
    tid = own_team.id
    assert client.post("/uploads", files={"file": ("a.png", b"x", "image/png")}).status_code == 403
    assert (
        client.patch(f"/teams/{tid}", json={"facebook_url": "https://facebook.com/x"}).status_code
        == 403
    )
    assert client.post("/sync/now").status_code == 403
    assert client.post(f"/teams/{tid}/games/1/stats", json={}).status_code == 403
    assert client.get("/sync/status").status_code == 403
    assert client.get(f"/teams/{tid}/admins").status_code == 403
    assert client.get("/teams/assignable-users").status_code == 403
    assert client.get("/memberships").status_code == 403
    pending_id = db_session.scalar(select(Membership.id).where(Membership.team_id == tid)) or 1
    assert client.post(f"/memberships/{pending_id}/approve").status_code == 403
    assert client.delete(f"/memberships/{pending_id}").status_code == 403
    me = client.get("/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["is_admin"] is False
    assert body["team_ids"] == []
    assert body["can_view_stats"] is (role == "member")
    assert "stats_app_url" not in body
    assert "stats_template_url" not in body


def test_admin_of_many_teams_across_clubs(
    client: TestClient, db_session: Session, own_team: Team, sibling_team: Team, other_team: Team
) -> None:
    _login_user(
        client,
        db_session,
        "multi",
        Membership(team_id=own_team.id, role="admin"),
        Membership(team_id=other_team.id, role="admin"),
        Membership(club="Gush", role="admin"),
    )
    for team in (own_team, sibling_team, other_team):
        assert (
            client.patch(
                f"/teams/{team.id}", json={"facebook_url": "https://facebook.com/x"}
            ).status_code
            == 200
        )
    me = client.get("/auth/me").json()
    assert sorted(me["team_ids"]) == sorted([own_team.id, sibling_team.id, other_team.id])
    assert me["clubs"] == ["Gush"]
    assert me["is_admin"] is True


def test_member_row_grants_no_write_scope(
    client: TestClient, db_session: Session, own_team: Team, other_team: Team
) -> None:
    _login_user(
        client,
        db_session,
        "mixed",
        Membership(team_id=own_team.id, role="admin"),
        Membership(team_id=other_team.id, role="member"),
    )
    assert client.get("/auth/me").json()["team_ids"] == [own_team.id]
    assert (
        client.patch(
            f"/teams/{other_team.id}", json={"facebook_url": "https://facebook.com/x"}
        ).status_code
        == 403
    )
