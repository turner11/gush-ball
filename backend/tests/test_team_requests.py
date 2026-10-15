from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import scrape_games, scrape_league_teams
from app.models import AdminUser, League, Membership, Team, get_or_create_club
from app.models.team_request import TeamRequest
from app.routers import sync
from tests.test_team_admin import _login_user

URL = "https://ibasketball.co.il/team/{}-x/"
LEAGUE_URL = "https://ibasketball.co.il/league/10/"


def _sp(title: str, code: int, logo: str | None = None) -> dict:
    item: dict[str, Any] = {"title": {"rendered": title}, "link": URL.format(code)}
    if logo:
        item["_embedded"] = {"wp:featuredmedia": [{"source_url": logo}]}
    return item


@pytest.fixture(autouse=True)
def feed(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> dict:
    """League 10 feed (no network), the team-page club lookup and the sync kick-off (recorded)."""
    scrape_league_teams._cache.clear()
    state: dict[str, Any] = {
        "items": [_sp("א", 1, "https://img/a.png"), _sp("ב", 2), _sp("ג", 3), _sp("ד", 4)],
        "club": "Gush",
        "syncs": [],
    }
    monkeypatch.setattr(scrape_league_teams, "_fetch", lambda league_id: state["items"])

    def page_club(db: Session, team_url: str) -> str | None:
        return get_or_create_club(db, state["club"]).name if state["club"] else None

    monkeypatch.setattr(scrape_games, "team_page_club", page_club)

    def start_sync(background_tasks: Any, team_ids: list[int], **_: Any) -> bool:
        state["syncs"].append(team_ids)
        return True

    monkeypatch.setattr(sync, "start_sync", start_sync)
    db_session.add(League(ibasketball_id=10, name="ליגה", url=LEAGUE_URL, season=2026))
    db_session.commit()
    return state


def _ask(client: TestClient, code: int = 1, league: int = 10):
    return client.post("/team-requests", json={"league_id": league, "ibasketball_team_url": URL.format(code)})


def _club_admin(client: TestClient, db: Session, name: str = "boss", club: str = "Gush") -> None:
    _login_user(client, db, name, Membership(club=club, role="admin"))


def test_anonymous_cannot_request(client: TestClient) -> None:
    assert _ask(client).status_code == 401


def test_request_is_pending_with_feed_data_and_page_club(client: TestClient, db_session: Session) -> None:
    _login_user(client, db_session, "dana")
    res = _ask(client)
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    row = db_session.execute(select(TeamRequest)).scalar_one()
    assert (row.name, row.logo_url, row.ibasketball_team_url) == ("א", "https://img/a.png", URL.format(1))
    assert row.ibasketball_league_url == LEAGUE_URL
    assert row.club == "Gush"
    assert db_session.scalar(select(Team.id)) is None
    assert db_session.scalar(select(Membership.id)) is None


def test_request_rejects_unknown_league_team_not_in_league_and_team_on_site(
    client: TestClient, db_session: Session
) -> None:
    _login_user(client, db_session, "dana")
    assert _ask(client, league=99).status_code == 404
    assert _ask(client, code=77).status_code == 404
    db_session.add(Team(name="א", slug="a", ibasketball_team_url=URL.format(1)))
    db_session.commit()
    assert _ask(client, code=1).status_code == 409


def test_second_pending_request_for_same_team_is_409_and_allowed_again_after_reject(
    client: TestClient, db_session: Session
) -> None:
    _login_user(client, db_session, "dana")
    assert _ask(client).status_code == 201
    _login_user(client, db_session, "ron")
    assert _ask(client).status_code == 409
    _club_admin(client, db_session)
    request_id = client.get("/team-requests").json()[0]["id"]
    assert client.post(f"/team-requests/{request_id}/reject").status_code == 204
    _login_user(client, db_session, "ron2")
    assert _ask(client).status_code == 201


def test_fourth_pending_request_per_user_is_409(client: TestClient, db_session: Session) -> None:
    _login_user(client, db_session, "dana")
    assert [_ask(client, code).status_code for code in (1, 2, 3)] == [201, 201, 201]
    assert _ask(client, 4).status_code == 409


def test_inbox_scoped_to_club_admin_and_full_admin(client: TestClient, db_session: Session, feed: dict) -> None:
    _login_user(client, db_session, "dana")
    _ask(client, 1)
    feed["club"] = None
    _ask(client, 2)
    get_or_create_club(db_session, "Other")
    db_session.commit()

    _club_admin(client, db_session)
    inbox = client.get("/team-requests").json()
    assert [r["name"] for r in inbox] == ["א"]
    assert (inbox[0]["username"], inbox[0]["league_name"], inbox[0]["club"]) == ("dana", "ליגה", "Gush")
    _club_admin(client, db_session, "other", "Other")
    assert client.get("/team-requests").json() == []
    team = Team(name="Own", slug="own")
    db_session.add(team)
    db_session.commit()
    _login_user(client, db_session, "teamadmin", Membership(team_id=team.id, role="admin"))
    assert client.get("/team-requests").json() == []
    _login_user(client, db_session, "root")
    db_session.execute(update(AdminUser).where(AdminUser.username == "root").values(is_full_admin=True))
    db_session.commit()
    assert [r["name"] for r in client.get("/team-requests").json()] == ["א", "ב"]


def test_club_admin_approves_creates_team_grants_admin_and_starts_sync(
    client: TestClient, db_session: Session, feed: dict
) -> None:
    _login_user(client, db_session, "dana")
    request_id = _ask(client).json()["id"]
    _club_admin(client, db_session)
    assert client.post(f"/team-requests/{request_id}/approve").status_code == 204

    team = db_session.scalar(select(Team))
    assert (team.name, team.club, team.background, team.logo_url) == ("א", "Gush", "hoop-1", "https://img/a.png")
    assert team.ibasketball_team_url == URL.format(1)
    assert team.ibasketball_league_url == LEAGUE_URL
    dana = db_session.scalar(select(AdminUser).where(AdminUser.username == "dana"))
    grant = db_session.scalar(select(Membership).where(Membership.user_id == dana.id))
    assert (grant.team_id, grant.role) == (team.id, "admin")
    assert feed["syncs"] == [[team.id]]
    assert db_session.scalar(select(TeamRequest.status)) == "approved"


def test_out_of_scope_approve_or_reject_is_403_and_non_pending_is_404(
    client: TestClient, db_session: Session
) -> None:
    _login_user(client, db_session, "dana")
    request_id = _ask(client).json()["id"]
    get_or_create_club(db_session, "Other")
    _club_admin(client, db_session, "other", "Other")
    assert client.post(f"/team-requests/{request_id}/approve").status_code == 403
    assert client.post(f"/team-requests/{request_id}/reject").status_code == 403
    _club_admin(client, db_session)
    assert client.post(f"/team-requests/{request_id}/reject").status_code == 204
    assert client.post(f"/team-requests/{request_id}/approve").status_code == 404
    assert client.post("/team-requests/999/reject").status_code == 404
    _login_user(client, db_session, "plain")
    assert client.get("/team-requests").status_code == 403
    assert client.post(f"/team-requests/{request_id}/approve").status_code == 403


def test_reject_sets_rejected_and_me_lists_request_statuses(client: TestClient, db_session: Session) -> None:
    _login_user(client, db_session, "dana")
    request_id = _ask(client).json()["id"]
    assert client.get("/auth/me").json()["team_requests"] == [{"id": request_id, "name": "א", "status": "pending"}]
    _club_admin(client, db_session)
    client.post(f"/team-requests/{request_id}/reject")
    assert client.post("/auth/login", json={"username": "dana", "password": "password123"}).status_code == 200
    assert client.get("/auth/me").json()["team_requests"][0]["status"] == "rejected"


@pytest.mark.parametrize("kind", ["full", "club"])
def test_self_approver_request_is_approved_immediately(
    kind: str, client: TestClient, db_session: Session, feed: dict
) -> None:
    _login_user(client, db_session, "dana", *([Membership(club="Gush", role="admin")] if kind == "club" else []))
    if kind == "full":
        db_session.execute(update(AdminUser).where(AdminUser.username == "dana").values(is_full_admin=True))
        db_session.commit()
    res = _ask(client)
    assert res.status_code == 201
    assert res.json()["status"] == "approved"
    team = db_session.scalar(select(Team))
    assert team.name == "א"
    assert feed["syncs"] == [[team.id]]


def test_approve_409_when_team_already_on_site(client: TestClient, db_session: Session) -> None:
    _login_user(client, db_session, "dana")
    request_id = _ask(client).json()["id"]
    db_session.add(Team(name="א", slug="a", ibasketball_team_url=URL.format(1)))
    db_session.commit()
    _club_admin(client, db_session)
    assert client.post(f"/team-requests/{request_id}/approve").status_code == 409
    assert db_session.scalar(select(TeamRequest.status)) == "pending"
