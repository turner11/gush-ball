import urllib.error
from datetime import UTC, datetime

import bbstats
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Game, GameStatus, LineupSnapshot, Opponent, Team

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


def test_delete_stats_other_team_admin_forbidden(team_admin_client, db_session) -> None:
    game = _make_game(db_session)  # not the team admin's team
    game.lineup_snapshots = [LineupSnapshot(players=[1, 2, 3, 4, 5], elapsed=1.0, offense_diff=0, defence_diff=0)]
    db_session.commit()

    r = team_admin_client.delete(_stats_path(game))

    assert r.status_code == 403
    assert _count(db_session) == 1


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
    assert "nope" in r.json()["detail"]
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


def test_load_stats_does_not_mark_override(admin_client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    admin_client.post(_stats_path(game), json={"url": URL})
    db_session.refresh(game)
    assert game.is_manually_overridden is False


def test_lineups_public_size_and_sort(admin_client, client, db_session, fake_sheet) -> None:
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


def test_lineups_empty_team_returns_empty_list(client, db_session) -> None:
    game = _make_game(db_session)
    assert client.get(f"/teams/{game.team_id}/lineups").json() == []
    assert client.get("/teams/9999/lineups").status_code == 404


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


def test_lineups_game_id_of_other_team_is_404(client, db_session) -> None:
    game = _make_game(db_session)
    other = Team(name="Other", slug="other")
    foreign = _second_game(db_session, other)
    base = f"/teams/{game.team_id}/lineups"

    assert client.get(f"{base}?game_id={foreign.id}").status_code == 404
    assert client.get(f"{base}?game_id=9999").status_code == 404


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


def test_game_read_exposes_stats_url(admin_client, client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    single = f"/teams/{game.team_id}/games/{game.id}"
    assert client.get(single).json()["stats_url"] is None

    admin_client.post(_stats_path(game), json={"url": URL})

    assert client.get(single).json()["stats_url"] == URL
    assert client.get(f"/teams/{game.team_id}/games").json()[0]["stats_url"] == URL
