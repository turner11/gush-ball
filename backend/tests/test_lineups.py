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
        return bbstats.get_snapshots_df(CSV)

    monkeypatch.setattr("app.routers.lineups.get_snapshots_df", fake)
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
    assert fake_sheet == []


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

    monkeypatch.setattr("app.routers.lineups.get_snapshots_df", boom)
    r = admin_client.post(_stats_path(game), json={"url": URL})

    assert r.status_code == 422
    assert "nope" in r.json()["detail"]
    assert _count(db_session) == before


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


def test_game_read_has_stats(admin_client, client, db_session, fake_sheet) -> None:
    game = _make_game(db_session)
    list_url = f"/teams/{game.team_id}/games"
    one_url = f"{list_url}/{game.id}"
    assert client.get(list_url).json()[0]["has_stats"] is False
    assert client.get(one_url).json()["has_stats"] is False

    admin_client.post(_stats_path(game), json={"url": URL})

    assert client.get(list_url).json()[0]["has_stats"] is True
    assert client.get(one_url).json()["has_stats"] is True
