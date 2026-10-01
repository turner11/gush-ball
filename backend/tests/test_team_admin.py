import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import AdminUser, Player, PlayerImage, Team


@pytest.fixture()
def other_team(db_session: Session) -> Team:
    team = Team(name="Other", slug="other")
    db_session.add(team)
    db_session.commit()
    return team


def test_team_admin_forbidden_on_every_other_team_write(
    team_admin_client: TestClient, other_team: Team
) -> None:
    """Sweeps every team-scoped write route, so a route that forgets the scope check fails here."""
    exercised = 0
    # openapi() flattens included routers (app.routes doesn't expose them directly)
    for route_path, operations in app.openapi()["paths"].items():
        if "{team_id}" not in route_path:
            continue
        for method in operations.keys() & {"post", "patch", "put", "delete"}:
            path = route_path.replace("{team_id}", str(other_team.id))
            path = re.sub(r"\{[^}]+\}", "1", path)
            response = team_admin_client.request(method.upper(), path, json={})
            assert response.status_code == 403, f"{method} {route_path} -> {response.status_code}"
            exercised += 1
    assert exercised >= 20


def test_team_admin_forbidden_reading_other_team_admin_lists(
    team_admin_client: TestClient, other_team: Team
) -> None:
    assert team_admin_client.get(f"/teams/{other_team.id}/games/pending-review").status_code == 403
    assert team_admin_client.get(f"/teams/{other_team.id}/players/deleted").status_code == 403


def test_team_admin_can_write_own_team(team_admin_client: TestClient, own_team: Team) -> None:
    c, t = team_admin_client, own_team.id
    assert c.patch(f"/teams/{t}", json={"facebook_url": "https://facebook.com/own"}).status_code == 200
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


def test_team_admin_cannot_do_club_wide_actions(
    team_admin_client: TestClient, own_team: Team
) -> None:
    assert team_admin_client.post("/teams", json={"name": "New"}).status_code == 403
    assert team_admin_client.delete(f"/teams/{own_team.id}").status_code == 403
    row = {
        "league_name": "L", "team_name": "T", "rank": 1, "played": 1, "won": 1,
        "lost": 0, "points_for": 1, "points_against": 0, "points": 2,
    }  # fmt: skip
    assert team_admin_client.post("/standings", json=row).status_code == 403


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

    assert team_admin_client.post(f"/players/{other_player.id}/images", json=body).status_code == 403
    r = team_admin_client.delete(f"/players/{other_player.id}/images/{img.id}")
    assert r.status_code == 403
    assert db_session.get(PlayerImage, img.id) is not None
    assert team_admin_client.post(f"/players/{own_player.id}/images", json=body).status_code == 201


def test_me_reports_team_scope(team_admin_client: TestClient, own_team: Team) -> None:
    me = team_admin_client.get("/auth/me").json()
    assert (me["username"], me["team_id"]) == ("teamadmin", own_team.id)


def test_me_full_admin_has_no_team_scope(admin_client: TestClient) -> None:
    me = admin_client.get("/auth/me").json()
    assert (me["username"], me["team_id"]) == ("admin", None)


def test_admin_team_fk_cascades() -> None:
    # SQLite tests run with FKs off; SET NULL would promote a deleted team's admins to full admin.
    (fk,) = AdminUser.__table__.c.team_id.foreign_keys
    assert fk.ondelete == "CASCADE"
