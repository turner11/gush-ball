from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AdminUser, Membership, Player, Team, TeamPlay
from tests.test_lineups import _login_as, _login_user

FILE = "https://cdn.example.com/p.pdf"
LINK = "https://fastdraw.example.com/p/1"


def _plays(team: Team) -> str:
    return f"/teams/{team.id}/plays"


def _player(db: Session, team: Team, *, deleted: bool = False) -> Player:
    player = Player(team_id=team.id, name="P", deleted_at=datetime.now(UTC) if deleted else None)
    db.add(player)
    db.commit()
    return player


def _login_linked(client, db: Session, team: Team, *, deleted: bool = False, club_member: bool = False) -> None:
    grants = [Membership(role="member", club="Gush")] if club_member else []
    _login_user(client, db, "viewer", *grants)
    user = db.query(AdminUser).filter_by(username="viewer").one()
    player = _player(db, team, deleted=deleted)
    player.user_id = user.id
    db.commit()


ACCESS = [
    ("anonymous", 401),
    ("none", 403),
    ("pending:own", 403),
    ("member:own", 200),
    ("member:club", 403),
    ("member:other", 403),
    ("admin:own", 200),
    ("admin:club", 200),
    ("full admin", 200),
    ("player:own", 403),
    ("player+club:own", 200),
    ("player+club-deleted:own", 403),
    ("player:other", 403),
]


@pytest.mark.parametrize(("who", "expected"), ACCESS)
def test_list_plays_access(who, expected, client, db_session, own_team, other_team, sibling_team) -> None:
    if who.startswith("player"):
        kind, target = who.split(":")
        team = own_team if target == "own" else other_team
        _login_linked(client, db_session, team, deleted="deleted" in kind, club_member="club" in kind)
    else:
        _login_as(client, db_session, who, own_team, other_team)

    assert client.get(_plays(own_team)).status_code == expected
    if who != "anonymous":
        ids = client.get("/auth/me").json()["member_team_ids"]
        assert (ids is None or own_team.id in ids) is (expected == 200)
        assert (ids is None) is (who == "full admin")


def test_create_play_with_file_url_and_with_link(admin_client: TestClient, own_team: Team) -> None:
    for body in ({"title": "A", "file_url": FILE}, {"title": "B", "url": LINK, "notes": "n"}):
        assert admin_client.post(_plays(own_team), json=body).status_code == 201
    assert [p["title"] for p in admin_client.get(_plays(own_team)).json()] == ["A", "B"]


SNIPPET = (
    """<iframe allow="fullscreen" style="border:0" title="Play Creator App" width="800" height="500" """
    """src='https://www.thehoopsgeek.com/react-apps/PlayCreator/embed/?code=85zQytijU8&showTitle=1"""
    """&showVideo=1&showDescription=1&showPhaseDescriptions=1'></iframe>"""
)
SNIPPET_URL = (
    "https://www.thehoopsgeek.com/react-apps/PlayCreator/embed/"
    "?code=85zQytijU8&showTitle=1&showVideo=1&showDescription=1&showPhaseDescriptions=1"
)


LEGACY = "https://example.com/e?a=1&notes=1&copy=2&region=il"


@pytest.mark.parametrize(
    ("snippet", "stored"),
    [
        (SNIPPET, SNIPPET_URL),
        (f'<iframe src="{LEGACY}"></iframe>', LEGACY),  # no ";" so never an entity in an attribute
        (f'<iframe src="{LEGACY.replace("&", "&amp;")}"></iframe>', LEGACY),
    ],
)
def test_create_play_from_iframe_snippet(snippet, stored, admin_client: TestClient, own_team: Team) -> None:
    response = admin_client.post(_plays(own_team), json={"title": "A", "url": snippet})
    assert response.status_code == 201
    assert response.json()["url"] == stored


@pytest.mark.parametrize("bad", ["<div>hi</div>", '<iframe src="javascript:alert(1)"></iframe>', '<iframe src="&#106;avascript:alert(1)"></iframe>', "<script>alert(1)</script>"])
def test_play_url_rejects_bad_markup(bad, admin_client: TestClient, own_team: Team) -> None:
    assert admin_client.post(_plays(own_team), json={"title": "A", "url": bad}).status_code == 422


def test_patch_play_accepts_iframe_snippet(admin_client: TestClient, own_team: Team) -> None:
    play = admin_client.post(_plays(own_team), json={"title": "A", "url": LINK}).json()
    response = admin_client.patch(f"{_plays(own_team)}/{play['id']}", json={"url": SNIPPET})
    assert response.status_code == 200
    assert response.json()["url"] == SNIPPET_URL


def test_play_notes_capped(admin_client: TestClient, own_team: Team) -> None:
    response = admin_client.post(_plays(own_team), json={"title": "A", "url": LINK, "notes": "x" * 2001})
    assert response.status_code == 422


@pytest.mark.parametrize("sources", [{"file_url": FILE, "url": LINK}, {}])
def test_create_play_requires_exactly_one_source(sources, admin_client: TestClient, own_team: Team) -> None:
    assert admin_client.post(_plays(own_team), json={"title": "A", **sources}).status_code == 422


def test_patch_play_swaps_link_for_file(admin_client: TestClient, own_team: Team) -> None:
    play = admin_client.post(_plays(own_team), json={"title": "A", "url": LINK}).json()
    path = f"{_plays(own_team)}/{play['id']}"
    assert admin_client.patch(path, json={"url": None}).status_code == 422
    body = admin_client.patch(path, json={"file_url": FILE}).json()
    assert (body["file_url"], body["url"]) == (FILE, None)
    body = admin_client.patch(path, json={"url": LINK}).json()
    assert (body["file_url"], body["url"]) == (None, LINK)
    assert admin_client.patch(path, json={"title": "Z"}).json()["url"] == LINK


def test_play_writes_require_team_admin(client, db_session, own_team, sibling_team) -> None:
    play = TeamPlay(team_id=own_team.id, title="A", url=LINK)
    db_session.add(play)
    db_session.commit()
    _login_user(client, db_session, "viewer", Membership(role="member", team_id=own_team.id))
    path = _plays(own_team)
    assert client.post(path, json={"title": "B", "url": LINK}).status_code == 403
    assert client.patch(f"{path}/{play.id}", json={"title": "B"}).status_code == 403
    assert client.delete(f"{path}/{play.id}").status_code == 403
    assert client.put(f"{path}/order", json=[play.id]).status_code == 403


def test_team_admin_can_write_plays(team_admin_client: TestClient, own_team: Team) -> None:
    play = team_admin_client.post(_plays(own_team), json={"title": "B", "url": LINK}).json()
    assert team_admin_client.put(f"{_plays(own_team)}/order", json=[play["id"]]).status_code == 200
    assert team_admin_client.delete(f"{_plays(own_team)}/{play['id']}").status_code == 204


def test_reorder_plays(admin_client: TestClient, own_team: Team) -> None:
    ids = [admin_client.post(_plays(own_team), json={"title": t, "url": LINK}).json()["id"] for t in "abc"]
    response = admin_client.put(f"{_plays(own_team)}/order", json=ids[::-1])
    assert [p["id"] for p in response.json()] == ids[::-1]
    assert [p["id"] for p in admin_client.get(_plays(own_team)).json()] == ids[::-1]
    new = admin_client.post(_plays(own_team), json={"title": "d", "url": LINK}).json()["id"]
    assert [p["id"] for p in admin_client.get(_plays(own_team)).json()] == [*ids[::-1], new]


def test_reorder_rejects_foreign_or_missing_ids(admin_client: TestClient, own_team: Team, other_team: Team) -> None:
    a, b = (admin_client.post(_plays(own_team), json={"title": t, "url": LINK}).json()["id"] for t in "ab")
    foreign = admin_client.post(_plays(other_team), json={"title": "x", "url": LINK}).json()["id"]
    path = f"{_plays(own_team)}/order"
    for ids in ([a], [a, foreign], [a, a, b], [a, b, foreign]):
        assert admin_client.put(path, json=ids).status_code == 422


def test_list_plays_unknown_team(admin_client: TestClient) -> None:
    assert admin_client.get("/teams/9999/plays").status_code == 404


@pytest.mark.parametrize("sources", [{"file_url": FILE, "url": LINK}, {}])
def test_play_check_constraint(sources, db_session: Session, own_team: Team) -> None:
    db_session.add(TeamPlay(team_id=own_team.id, title="A", **sources))
    with pytest.raises(IntegrityError):
        db_session.commit()
