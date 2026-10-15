from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import scrape_games, scrape_standings
from app.models import (
    AdminUser,
    Game,
    GameStatus,
    Membership,
    Opponent,
    Player,
    PlayerImage,
    Team,
    TeamLink,
)
from app.security import hash_password
from tests.test_scrape_games import FUTURE_EVENT, FakeApi
from tests.test_scrape_games import _make_team as _make_game_scrape_team
from tests.test_scrape_standings import FIXTURE_HTML
from tests.test_scrape_standings import _make_team as _make_standings_team


def _audit_model():  # imported lazily so a missing model fails each test, not collection
    from app.models.audit_log import AuditLog

    return AuditLog


def _rows(db: Session) -> list:
    return list(db.scalars(select(_audit_model()).order_by(_audit_model().id)))


def _team(db: Session) -> Team:
    team = Team(name="T", slug="t")
    db.add(team)
    db.commit()
    return team


def _game(db: Session, team: Team, **extra: object) -> Game:
    opponent = Opponent(name="Opp")
    db.add(opponent)
    db.flush()
    game = Game(
        team=team,
        opponent=opponent,
        scheduled_at=datetime(2026, 1, 1, 18, 0, tzinfo=UTC),
        status=GameStatus.SCHEDULED,
        **extra,
    )
    db.add(game)
    db.commit()
    return game


def _player(db: Session, team: Team, **extra: object) -> Player:
    player = Player(team_id=team.id, name="Dana", **extra)
    db.add(player)
    db.commit()
    return player


def _user(db: Session, name: str = "other") -> AdminUser:
    user = AdminUser(username=name, password_hash=hash_password("password123"))
    db.add(user)
    db.commit()
    return user


# Each case seeds, then returns (request, action, entity_type, entity_id | None for "the created id", team_id).
Case = Callable[[TestClient, Session], tuple[Callable, str, str, int | None, int | None]]


def _game_create(c, db):
    t = _team(db)
    body = {"opponent_name": "X", "scheduled_at": "2026-01-01T18:00:00Z", "is_home": True}
    return lambda: c.post(f"/teams/{t.id}/games", json=body), "create", "game", None, t.id


def _game_patch(c, db):
    t = _team(db)
    g = _game(db, t)
    return (
        lambda: c.patch(f"/teams/{t.id}/games/{g.id}", json={"team_score": 90}),
        "update",
        "game",
        g.id,
        t.id,
    )


def _game_approve(c, db):
    t = _team(db)
    g = _game(db, t, needs_review=True)
    return lambda: c.post(f"/teams/{t.id}/games/{g.id}/approve"), "update", "game", g.id, t.id


def _game_accept(c, db):
    t = _team(db)
    g = _game(db, t, scrape_suggestion={"team_score": 90}, scrape_suggestion_dismissed=False)
    return (
        lambda: c.post(f"/teams/{t.id}/games/{g.id}/suggestion/accept"),
        "update",
        "game",
        g.id,
        t.id,
    )


def _game_reject(c, db):
    t = _team(db)
    g = _game(db, t, scrape_suggestion={"team_score": 90}, scrape_suggestion_dismissed=False)
    return (
        lambda: c.post(f"/teams/{t.id}/games/{g.id}/suggestion/reject"),
        "update",
        "game",
        g.id,
        t.id,
    )


def _game_delete(c, db):
    t = _team(db)
    g = _game(db, t)
    return lambda: c.delete(f"/teams/{t.id}/games/{g.id}"), "delete", "game", g.id, t.id


def _player_create(c, db):
    t = _team(db)
    return (
        lambda: c.post(f"/teams/{t.id}/players", json={"name": "Dana"}),
        "create",
        "player",
        None,
        t.id,
    )


def _player_patch(c, db):
    t = _team(db)
    p = _player(db, t)
    return (
        lambda: c.patch(f"/teams/{t.id}/players/{p.id}", json={"jersey_number": 7}),
        "update",
        "player",
        p.id,
        t.id,
    )


def _player_soft_delete(c, db):
    t = _team(db)
    p = _player(db, t)
    return lambda: c.delete(f"/teams/{t.id}/players/{p.id}"), "update", "player", p.id, t.id


def _player_restore(c, db):
    t = _team(db)
    p = _player(db, t, deleted_at=datetime(2026, 1, 1))
    return lambda: c.post(f"/teams/{t.id}/players/{p.id}/restore"), "update", "player", p.id, t.id


def _image_add(c, db):
    t = _team(db)
    p = _player(db, t)
    body = {"url": "https://example.com/d.jpg"}
    return (
        lambda: c.post(f"/players/{p.id}/images", json=body),
        "create",
        "player_image",
        None,
        t.id,
    )


def _image_delete(c, db):
    t = _team(db)
    p = _player(db, t)
    img = PlayerImage(player_id=p.id, url="https://example.com/d.jpg")
    db.add(img)
    db.commit()
    return (
        lambda: c.delete(f"/players/{p.id}/images/{img.id}"),
        "delete",
        "player_image",
        img.id,
        t.id,
    )


def _link(db, t):
    link = TeamLink(team_id=t.id, label="L", url="https://example.com")
    db.add(link)
    db.commit()
    return link


def _link_create(c, db):
    t = _team(db)
    body = {"label": "L", "url": "https://example.com"}
    return lambda: c.post(f"/teams/{t.id}/links", json=body), "create", "link", None, t.id


def _link_patch(c, db):
    t = _team(db)
    link = _link(db, t)
    return (
        lambda: c.patch(f"/teams/{t.id}/links/{link.id}", json={"label": "M"}),
        "update",
        "link",
        link.id,
        t.id,
    )


def _link_delete(c, db):
    t = _team(db)
    link = _link(db, t)
    return lambda: c.delete(f"/teams/{t.id}/links/{link.id}"), "delete", "link", link.id, t.id


_STANDING = {
    "league_name": "L",
    "team_name": "A",
    "rank": 1,
    "played": 1,
    "won": 1,
    "lost": 0,
    "points_for": 80,
    "points_against": 70,
    "points": 2,
}


def _standing_create(c, db):
    return lambda: c.post("/standings", json=_STANDING), "create", "standing", None, None


def _standing_patch(c, db):
    sid = c.post("/standings", json=_STANDING).json()["id"]
    return lambda: c.patch(f"/standings/{sid}", json={"won": 5}), "update", "standing", sid, None


def _standing_delete(c, db):
    sid = c.post("/standings", json=_STANDING).json()["id"]
    return lambda: c.delete(f"/standings/{sid}"), "delete", "standing", sid, None


def _team_create(c, db):
    return lambda: c.post("/teams", json={"name": "New"}), "create", "team", None, "created"


def _team_patch(c, db):
    t = _team(db)
    return lambda: c.patch(f"/teams/{t.id}", json={"name": "Renamed"}), "update", "team", t.id, t.id


def _team_delete(c, db):
    t = _team(db)
    return lambda: c.delete(f"/teams/{t.id}"), "delete", "team", t.id, t.id


def _membership(db, t, role):
    row = Membership(user_id=_user(db).id, team_id=t.id, role=role)
    db.add(row)
    db.commit()
    return row


def _member_join(c, db):
    t = _team(db)
    return (
        lambda: c.post("/memberships", json={"team_id": t.id}),
        "create",
        "membership",
        None,
        t.id,
    )


def _member_approve(c, db):
    t = _team(db)
    m = _membership(db, t, "pending")
    return lambda: c.post(f"/memberships/{m.id}/approve"), "update", "membership", m.id, t.id


def _member_remove(c, db):
    t = _team(db)
    m = _membership(db, t, "member")
    return lambda: c.delete(f"/memberships/{m.id}"), "delete", "membership", m.id, t.id


def _member_leave(c, db):
    t = _team(db)
    me = db.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    m = Membership(user_id=me.id, team_id=t.id, role="member")
    db.add(m)
    db.commit()
    return lambda: c.delete(f"/memberships/mine/{m.id}"), "delete", "membership", m.id, t.id


def _admin_assign(c, db):
    t = _team(db)
    m = _membership(db, t, "member")
    return lambda: c.put(f"/teams/{t.id}/admins/{m.user_id}"), "update", "membership", m.id, t.id


def _admin_revoke(c, db):
    t = _team(db)
    m = _membership(db, t, "admin")
    return lambda: c.delete(f"/teams/{t.id}/admins/{m.user_id}"), "delete", "membership", m.id, t.id


def _admin_create(c, db):
    t = _team(db)
    body = {"username": "newadmin", "password": "password123"}
    new_membership_id = lambda r: db.scalar(
        select(Membership.id).where(Membership.user_id == r.json()["id"])
    )
    return (
        lambda: c.post(f"/teams/{t.id}/admins", json=body),
        "create",
        "membership",
        new_membership_id,
        t.id,
    )


CASES: list[Case] = [
    _game_create,
    _game_patch,
    _game_approve,
    _game_accept,
    _game_reject,
    _game_delete,
    _player_create,
    _player_patch,
    _player_soft_delete,
    _player_restore,
    _image_add,
    _image_delete,
    _link_create,
    _link_patch,
    _link_delete,
    _standing_create,
    _standing_patch,
    _standing_delete,
    _team_create,
    _team_patch,
    _team_delete,
    _member_join,
    _member_approve,
    _member_remove,
    _member_leave,
    _admin_assign,
    _admin_revoke,
    _admin_create,
]


@pytest.mark.parametrize("case", CASES, ids=lambda f: f.__name__.lstrip("_"))
def test_request_write_emits_one_row(
    case: Case, admin_client: TestClient, db_session: Session
) -> None:
    send, action, entity_type, entity_id, team_id = case(admin_client, db_session)
    before = len(_rows(db_session))

    response = send()

    assert response.status_code < 300, response.text
    new = _rows(db_session)[before:]
    assert len(new) == 1
    row = new[0]
    assert (row.action, row.entity_type) == (action, entity_type)
    assert row.team_id == (response.json()["id"] if team_id == "created" else team_id)
    if callable(entity_id):
        assert row.entity_id == entity_id(response)
    elif entity_id is None:
        assert row.entity_id == response.json()["id"]
    else:
        assert row.entity_id == entity_id
    admin = db_session.scalar(select(AdminUser).where(AdminUser.username == "admin"))
    assert (row.user_id, row.username) == (admin.id, "admin")


def test_update_logs_only_changed_fields(admin_client: TestClient, db_session: Session) -> None:
    t = _team(db_session)
    g = _game(db_session, t)
    before = len(_rows(db_session))

    admin_client.patch(f"/teams/{t.id}/games/{g.id}", json={"team_score": 90})

    # an admin edit of a scraped-style game also flips the override flag; nothing else changes
    assert _rows(db_session)[before].changes == {
        "team_score": [None, 90],
        "is_manually_overridden": [False, True],
    }


def test_scraper_writes_are_unattributed(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(scrape_standings, "_get_html", lambda url: FIXTURE_HTML)
    scrape_standings.sync_team_standings(
        db_session, _make_standings_team(db_session, slug="standings-team")
    )
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))
    monkeypatch.setattr(scrape_games, "_get_page", lambda url: "")
    scrape_games.sync_team_games(db_session, _make_game_scrape_team(db_session))

    rows = _rows(db_session)
    assert {r.entity_type for r in rows} >= {"standing", "game"}
    assert all(r.user_id is None and r.username is None for r in rows)


def test_unchanged_rescrape_adds_no_rows(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(scrape_standings, "_get_html", lambda url: FIXTURE_HTML)
    team = _make_standings_team(db_session)
    scrape_standings.sync_team_standings(db_session, team)
    first = len(_rows(db_session))
    assert first > 0

    scrape_standings.sync_team_standings(db_session, team)

    assert len(_rows(db_session)) == first


def test_audited_models_hold_no_secrets(db_session: Session) -> None:
    from app.models.audit_log import _AUDITED

    assert AdminUser not in _AUDITED
    for model in _AUDITED:
        assert not {"password_hash", "email", "session_version"} & set(
            model.__table__.columns.keys()
        )
    # Game.stats_url is an admin-only sheet URL: never copied into a diff.
    game = _game(db_session, _team(db_session), stats_url="https://example.com/sheet")
    assert "stats_url" not in str(_rows(db_session)[-1].changes)
    game.stats_url = "https://example.com/other"
    db_session.commit()
    db_session.delete(game)
    db_session.commit()
    assert all(
        "stats_url" not in r.changes and "has_stats" not in r.changes for r in _rows(db_session)
    )


def test_create_and_delete_rows_hold_the_values(db_session: Session) -> None:
    team = _team(db_session)
    player = _player(db_session, team, jersey_number=7)
    db_session.delete(player)
    db_session.commit()
    created, deleted = [r for r in _rows(db_session) if r.entity_type == "player"]
    assert created.changes["name"] == [None, "Dana"]
    assert created.changes["jersey_number"] == [None, 7]
    assert deleted.changes["name"] == ["Dana", None]


def test_audit_log_full_admin_only(team_admin_client: TestClient) -> None:
    assert team_admin_client.get("/audit-log").status_code == 403
    team_admin_client.post("/auth/logout")
    assert team_admin_client.get("/audit-log").status_code == 401


def test_audit_log_filters(admin_client: TestClient, db_session: Session) -> None:
    AuditLog = _audit_model()
    for team_id, etype, eid in [(1, "game", 10), (1, "player", 11), (2, "game", 12)]:
        db_session.add(
            AuditLog(
                user_id=None,
                username="x",
                action="update",
                entity_type=etype,
                entity_id=eid,
                team_id=team_id,
                changes={},
            )
        )
    db_session.commit()

    def ids(**params: object) -> list[int]:
        body = admin_client.get("/audit-log", params=params).json()
        return [r["entity_id"] for r in body if r["username"] == "x"]

    assert ids() == [12, 11, 10]  # newest first
    assert ids(team_id=1) == [11, 10]
    assert ids(entity_type="game") == [12, 10]
    assert ids(entity_id=11) == [11]


def test_deleted_user_keeps_username(admin_client: TestClient, db_session: Session) -> None:
    db_session.add(
        _audit_model()(
            user_id=None,
            username="gone",
            action="update",
            entity_type="game",
            entity_id=1,
            team_id=None,
            changes={},
        )
    )
    db_session.commit()

    row = admin_client.get("/audit-log").json()[0]

    assert (row["user_id"], row["username"]) == (None, "gone")
