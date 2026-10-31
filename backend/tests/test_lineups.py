import re
import urllib.error
from datetime import UTC, datetime

import bbstats
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import AdminUser, Game, GameStatus, LineupSnapshot, Membership, Opponent, Team
from app.security import hash_password
from tests.test_team_admin import _login_user

CSV = """#1,#2,#3,#4,#5,Points,Points Against,Quarter,Time Left
1,2,3,4,5,0,0,1,10:00
1,2,3,4,5,2,0,1,5:00
1,2,3,4,6,4,3,2,10:00
1,2,3,4,6,6,3,3,10:00
1,2,3,4,6,6,5,4,0:00
"""
URL = "https://docs.google.com/spreadsheets/d/X/edit"


@pytest.fixture()
def fake_sheet(monkeypatch: pytest.MonkeyPatch) -> list:
    urls: list = []

    def fake(url: str):
        urls.append(url)
        return CSV

    monkeypatch.setattr("app.routers.lineups.fetch_csv", fake)
    return urls


def _make_game(db: Session) -> Game:
    team = Team(name="Gush Ball A", slug="gush-ball-a")
    opponent = Opponent(name="Opp")
    game = Game(
        team=team,
        opponent=opponent,
        scheduled_at=datetime(2026, 1, 1, 18, 0, tzinfo=UTC),
        status=GameStatus.FINAL,
    )
    db.add(game)
    db.commit()
    return game


def _stats_path(game: Game) -> str:
    return f"/teams/{game.team_id}/games/{game.id}/stats"


def _count(db: Session) -> int:
    return len(db.scalars(select(LineupSnapshot)).all())


def test_load_stats_stores_snapshots_and_url(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    expected = len(bbstats.get_snapshots_df(CSV))

    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 200
    assert r.json() == {"stats_url": URL, "snapshots": expected}
    db_session.refresh(game)
    assert _count(db_session) == expected
    assert game.stats_url == URL


def test_non_http_url_rejected(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)

    r = admin_client.post(_stats_path(game), json={"url": "/etc/passwd"})

    assert r.status_code == 422
    assert "/etc/passwd" in r.json()["detail"]
    assert fake_sheet == []


def test_load_stats_accepts_bare_sheet_id(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    full = "https://docs.google.com/spreadsheets/d/1xvlTs0ry_f-jg3iRN2wdiwM7v1YMiRC7oJwI6MDGb"

    r = admin_client.post(_stats_path(game), json={"url": " 1xvlTs0ry_f-jg3iRN2wdiwM7v1YMiRC7oJwI6MDGb "})

    assert r.status_code == 200
    assert r.json()["stats_url"] == full
    assert fake_sheet == [full]
    db_session.refresh(game)
    assert game.stats_url == full


def test_delete_stats_clears_snapshots_keeps_url(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})

    r = admin_client.delete(_stats_path(game))

    assert r.status_code == 204
    db_session.refresh(game)
    assert _count(db_session) == 0
    assert game.stats_url == URL
    assert game.has_stats is False
    assert game.is_manually_overridden is False


def test_reload_replaces_snapshots_and_uses_stored_url(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    first = _count(db_session)

    r = admin_client.post(_stats_path(game), json={})

    assert r.status_code == 200
    assert fake_sheet == [URL, URL]
    assert _count(db_session) == first


def test_load_stats_requires_admin(client: TestClient, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    assert client.post(_stats_path(game), json={"url": URL}).status_code == 401


def test_load_stats_without_any_url_is_422(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    assert admin_client.post(_stats_path(game), json={}).status_code == 422


def test_load_stats_failure_keeps_old_snapshots(admin_client, db_session, fake_sheet, monkeypatch) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    before = _count(db_session)

    def boom(url: str):
        raise RuntimeError("nope")

    monkeypatch.setattr("app.routers.lineups.fetch_csv", boom)
    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 422
    assert "nope" not in r.json()["detail"]
    assert _count(db_session) == before


def test_load_stats_accepts_alternate_header_spelling(admin_client, db_session, monkeypatch) -> None:
    game = _make_game(db_session)
    alt = CSV.replace("#1,#2,#3,#4,#5,Points,Points Against,Quarter,Time Left", "player 1,player 2,player 3,player 4,player 5,Team,Opponent,Quarter,Time left")
    monkeypatch.setattr("app.routers.lineups.fetch_csv", lambda url: alt)

    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 200
    assert r.json()["snapshots"] == len(bbstats.get_snapshots_df(CSV))


def test_load_stats_missing_column_names_it(admin_client, db_session, monkeypatch) -> None:
    game = _make_game(db_session)
    monkeypatch.setattr("app.routers.lineups.fetch_csv", lambda url: CSV.replace("Time Left", "Clock"))

    r = admin_client.post(_stats_path(game), json={"url": URL})

    detail = r.json()["detail"]
    assert r.status_code == 422
    assert "time" in detail and "Time Left" in detail
    assert "anyone with the link" not in detail


def test_load_stats_private_sheet_says_share(admin_client, db_session, monkeypatch) -> None:
    game = _make_game(db_session)

    def private(url: str):
        raise urllib.error.HTTPError(url, 401, "Unauthorized", None, None)

    monkeypatch.setattr("app.routers.lineups.fetch_csv", private)
    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 422
    assert "anyone with the link" in r.json()["detail"]
    assert "401" not in r.json()["detail"]
    assert "Unauthorized" not in r.json()["detail"]


def test_load_stats_does_not_mark_override(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    db_session.refresh(game)
    assert game.is_manually_overridden is False


def test_lineups_size_and_sort(admin_client, client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    base = f"/teams/{game.team_id}/lineups"

    ones = client.get(f"{base}?size=1").json()
    assert ones and all(len(x["players"]) == 1 for x in ones)

    defense = [x["defence_pm"] for x in client.get(f"{base}?size=1&sort=defense").json()]
    assert defense == sorted(defense)
    top = [x["score_pm"] for x in client.get(f"{base}?size=1&sort=top").json()]
    assert top == sorted(top, reverse=True)

    assert client.get(f"{base}?size=6").status_code == 422
    assert client.get(f"{base}?sort=bogus").status_code == 422


def test_lineups_empty_team_returns_empty_list(client, admin_client, db_session) -> None:
    game = _make_game(db_session)
    assert admin_client.get(f"/teams/{game.team_id}/lineups").json() == []
    assert admin_client.get("/teams/9999/lineups").status_code == 404


def test_delete_game_deletes_snapshots(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    assert admin_client.delete(f"/teams/{game.team_id}/games/{game.id}").status_code == 204
    assert _count(db_session) == 0


def _second_game(db: Session, team: Team) -> Game:
    game = Game(
        team=team,
        opponent=Opponent(name="Opp B"),
        scheduled_at=datetime(2026, 2, 1, 18, 0, tzinfo=UTC),
    )
    db.add(game)
    db.commit()
    return game


def test_lineups_game_id_filters_to_that_game(admin_client, client, db_session, fake_sheet) -> None:
    a = _make_game(db_session)
    b = _second_game(db_session, a.team)
    admin_client.post(_stats_path(a), json={"url": URL})
    base = f"/teams/{a.team_id}/lineups"

    assert client.get(base).json() != []
    assert client.get(f"{base}?game_id={a.id}").json() != []
    assert client.get(f"{base}?game_id={b.id}").json() == []


def test_lineups_game_id_of_other_team_is_404(admin_client, db_session) -> None:
    game = _make_game(db_session)
    other = Team(name="Other", slug="other")
    foreign = _second_game(db_session, other)
    base = f"/teams/{game.team_id}/lineups"

    assert admin_client.get(f"{base}?game_id={foreign.id}").status_code == 404
    assert admin_client.get(f"{base}?game_id=9999").status_code == 404


def _has_stats_by_id(client, list_url: str) -> dict[int, bool]:
    return {g["id"]: g["has_stats"] for g in client.get(list_url).json()}


def test_game_read_has_stats(admin_client, client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    other = _second_game(db_session, game.team)
    list_url = f"/teams/{game.team_id}/games"
    one_url = f"{list_url}/{game.id}"
    assert _has_stats_by_id(client, list_url) == {game.id: False, other.id: False}
    assert client.get(one_url).json()["has_stats"] is False

    admin_client.post(_stats_path(game), json={"url": URL})

    assert _has_stats_by_id(client, list_url) == {game.id: True, other.id: False}
    assert client.get(one_url).json()["has_stats"] is True
    assert client.get(f"{list_url}/{other.id}").json()["has_stats"] is False


HEADER = CSV.splitlines()[0]


@pytest.mark.parametrize("body", [",,,,,,,,\n", "1,2,3,4,5,0,0,1,\n"], ids=["blank-rows", "rows-without-time"])
def test_empty_sheet_saves_url_with_zero_snapshots(admin_client, client, db_session, monkeypatch, body) -> None:
    # A template with no timed rows (Google exports formatted blank rows as ",,,,") is valid before tip-off.
    monkeypatch.setattr("app.routers.lineups.fetch_csv", lambda url: HEADER + "\n" + body)
    game = _make_game(db_session)

    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 200
    assert r.json() == {"stats_url": URL, "snapshots": 0}
    db_session.refresh(game)
    assert game.stats_url == URL
    assert game.is_manually_overridden is False
    assert client.get(f"/teams/{game.team_id}/games/{game.id}").json()["has_stats"] is False


def test_game_read_exposes_stats_url_to_admin(admin_client, client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    single = f"/teams/{game.team_id}/games/{game.id}"
    assert client.get(single).json()["stats_url"] is None

    admin_client.post(_stats_path(game), json={"url": URL})

    assert client.get(single).json()["stats_url"] == URL
    assert client.get(f"/teams/{game.team_id}/games").json()[0]["stats_url"] == URL


def test_load_stats_uses_gid_tab(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    url = "https://docs.google.com/spreadsheets/d/X/edit?gid=77"

    r = admin_client.post(_stats_path(game), json={"url": url})

    assert r.status_code == 200
    assert fake_sheet == [url]
    db_session.refresh(game)
    assert game.stats_url == url
    assert bbstats.to_csv_url(url).endswith("&gid=77")


def _own_game_with_snapshots(db: Session, team: Team) -> Game:
    game = Game(
        team=team,
        opponent=Opponent(name="Opp"),
        scheduled_at=datetime(2026, 1, 1, 18, 0, tzinfo=UTC),
        status=GameStatus.FINAL,
        stats_url=URL,
    )
    game.lineup_snapshots = [
        LineupSnapshot(players=[1, 2, 3, 4, 5], elapsed=5.0, offense_diff=2, defence_diff=0),
        LineupSnapshot(players=[1, 2, 3, 4, 6], elapsed=10.0, offense_diff=4, defence_diff=3),
    ]
    db.add(game)
    db.commit()
    return game


def _login_full_admin(client, db: Session, username: str) -> None:
    db.add(AdminUser(username=username, password_hash=hash_password("password123"), is_full_admin=True))
    db.commit()
    assert client.post("/auth/login", json={"username": username, "password": "password123"}).status_code == 200


def _login_as(client, db: Session, who: str, own: Team, other: Team) -> None:
    """Logs `who` in. Grants are written 'role:target', target being own/other/club."""
    if who == "anonymous":
        return
    if who == "full admin":
        return _login_full_admin(client, db, "viewer")
    targets = {"own": {"team_id": own.id}, "other": {"team_id": other.id}, "club": {"club": "Gush"}}
    grants = []
    if who != "none":
        role, target = who.split(":")
        grants.append(Membership(role=role, **targets[target]))
    _login_user(client, db, "viewer", *grants)


GRANTS = [
    ("anonymous", 401),
    ("none", 403),
    ("pending:own", 403),
    ("pending:club", 403),
    ("member:own", 200),
    ("member:club", 200),
    ("member:other", 200),
    ("admin:own", 200),
    ("admin:club", 200),
    ("full admin", 200),
]


@pytest.mark.parametrize(("who", "expected"), GRANTS)
def test_lineups_access_by_grant(who, expected, client, db_session, own_team, other_team, sibling_team) -> None:
    game = _own_game_with_snapshots(db_session, own_team)
    _login_as(client, db_session, who, own_team, other_team)
    base = f"/teams/{own_team.id}/lineups"

    assert client.get(base).status_code == expected
    assert client.get(f"{base}?game_id={game.id}").status_code == expected
    if who != "anonymous":
        assert client.get("/auth/me").json()["can_view_stats"] is (expected == 200)


def test_every_stats_read_route_needs_login(client) -> None:
    exercised = 0
    for route_path, operations in app.openapi()["paths"].items():
        if "get" not in operations or not ("lineups" in route_path or route_path.endswith("/stats")):
            continue
        r = client.get(re.sub(r"\{[^}]+\}", "1", route_path))
        assert r.status_code == 401, f"GET {route_path} -> {r.status_code}"
        exercised += 1
    assert exercised >= 1


def test_lineups_unknown_team_is_401_for_anonymous(client) -> None:
    assert client.get("/teams/9999/lineups").status_code == 401


SHEET_VIEWERS = [
    ("anonymous", False),
    ("none", False),
    ("pending:own", False),
    ("member:own", False),
    ("admin:other", False),
    ("admin:own", True),
    ("admin:club", True),
    ("full admin", True),
]


@pytest.mark.parametrize(("who", "shown"), SHEET_VIEWERS)
def test_public_games_hide_stats_url(who, shown, client, db_session, own_team, other_team, sibling_team) -> None:
    game = _own_game_with_snapshots(db_session, own_team)
    _login_as(client, db_session, who, own_team, other_team)
    list_url = f"/teams/{own_team.id}/games"

    for r in (client.get(list_url), client.get(f"{list_url}/{game.id}")):
        assert r.status_code == 200
        body = r.json()
        item = body[0] if isinstance(body, list) else body
        assert item["has_stats"] is True
        assert (item["stats_url"] == URL) if shown else (item["stats_url"] is None and URL not in r.text)


def test_load_stats_rejects_non_google_url(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)

    r = admin_client.post(_stats_path(game), json={"url": "http://db:5432"})

    assert r.status_code == 422
    assert fake_sheet == []


def test_reload_rejects_stored_non_google_url(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    game.stats_url = "http://169.254.169.254/latest/meta-data"
    db_session.commit()

    r = admin_client.post(_stats_path(game), json={})

    assert r.status_code == 422
    assert fake_sheet == []


def test_lineups_merge_same_players_in_any_order(admin_client, db_session, own_team) -> None:
    game = _own_game_with_snapshots(db_session, own_team)
    game.lineup_snapshots = [
        LineupSnapshot(players=[1, 2, 3, 4, 5], elapsed=5.0, offense_diff=2, defence_diff=0),
        LineupSnapshot(players=[5, 4, 3, 2, 1], elapsed=3.0, offense_diff=1, defence_diff=1),
    ]
    db_session.commit()
    base = f"/teams/{own_team.id}/lineups"

    rows = admin_client.get(f"{base}?size=5").json()
    assert len(rows) == 1
    assert rows[0]["players"] == [1, 2, 3, 4, 5]
    assert rows[0]["minutes"] == 8.0
    assert rows[0]["score_diff"] == 2

    pairs = [tuple(r["players"]) for r in admin_client.get(f"{base}?size=2").json()]
    assert len(pairs) == len(set(pairs)) == 10


# --- rows typed on the site (#601) ---
ROWS = [line.split(",") for line in CSV.splitlines()[1:]]


def _rows_path(game: Game) -> str:
    return f"{_stats_path(game)}/rows"


def test_put_stats_rows_replaces_snapshots_and_rows(admin_client, db_session) -> None:
    from app.models.audit_log import AuditLog

    game = _make_game(db_session)
    audits_before = len(db_session.scalars(select(AuditLog)).all())

    r = admin_client.put(_rows_path(game), json=ROWS)

    assert r.status_code == 200
    assert r.json()["snapshots"] == len(bbstats.get_snapshots_df(CSV))
    assert admin_client.get(_rows_path(game)).json() == ROWS
    db_session.refresh(game)
    assert game.has_stats
    assert game.is_manually_overridden is False
    assert len(db_session.scalars(select(AuditLog)).all()) == audits_before


def test_stats_csv_export_matches_sheet_format(admin_client, db_session) -> None:
    game = _make_game(db_session)
    admin_client.put(_rows_path(game), json=ROWS)

    r = admin_client.get(f"{_stats_path(game)}.csv")

    assert r.status_code == 200
    assert r.text == CSV
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]


def test_put_stats_rows_rejects_formula_cell(admin_client, db_session) -> None:
    game = _make_game(db_session)
    admin_client.put(_rows_path(game), json=ROWS)
    bad = [["=1+1", *ROWS[0][1:]]]

    r = admin_client.put(_rows_path(game), json=bad)

    assert r.status_code == 422
    assert admin_client.get(_rows_path(game)).json() == ROWS
    assert _count(db_session) == len(bbstats.get_snapshots_df(CSV))


def test_put_stats_rows_time_over_quarter_names_value(admin_client, db_session) -> None:
    game = _make_game(db_session)

    r = admin_client.put(_rows_path(game), json=[[*ROWS[0][:7], "1", "12:00"]])

    assert r.status_code == 422
    assert "12" in r.json()["detail"]


def test_put_empty_stats_rows_clears_stats(admin_client, db_session) -> None:
    game = _make_game(db_session)
    admin_client.put(_rows_path(game), json=ROWS)

    r = admin_client.put(_rows_path(game), json=[])

    assert r.status_code == 200
    assert r.json()["snapshots"] == 0
    db_session.refresh(game)
    assert game.has_stats is False


def test_sheet_load_and_delete_clear_stats_rows(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.put(_rows_path(game), json=ROWS)
    admin_client.post(_stats_path(game), json={"url": URL})
    db_session.refresh(game)
    assert game.stats_rows == []

    admin_client.put(_rows_path(game), json=ROWS)
    admin_client.delete(_stats_path(game))
    db_session.refresh(game)
    assert game.stats_rows == []


@pytest.mark.parametrize(
    ("who", "expected"),
    [("anonymous", 401), ("member:own", 403), ("admin:other", 403), ("admin:own", 200), ("admin:club", 200)],
)
def test_stats_rows_routes_need_team_admin(who, expected, client, db_session, own_team, other_team) -> None:
    game = _own_game_with_snapshots(db_session, own_team)
    _login_as(client, db_session, who, own_team, other_team)

    assert client.get(_rows_path(game)).status_code == expected
    assert client.put(_rows_path(game), json=ROWS).status_code == expected
    assert client.get(f"{_stats_path(game)}.csv").status_code == expected
