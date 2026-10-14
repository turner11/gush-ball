from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, GameStatus, Opponent, Team


def _game(db: Session, team: Team, opp: str, at: datetime, **kw: object) -> Game:
    opponent = Opponent(name=opp, address=kw.pop("opp_address", None))
    db.add(opponent)
    db.flush()
    game = Game(team=team, opponent=opponent, scheduled_at=at, status=GameStatus.SCHEDULED, **kw)
    db.add(game)
    db.commit()
    return game


def _feed(client: TestClient, team: Team) -> str:
    response = client.get(f"/teams/{team.id}/calendar.ics")
    assert response.status_code == 200
    return response.text


def test_calendar_feed_lists_live_games_with_stable_uids(client: TestClient, db_session: Session, own_team: Team) -> None:
    a = _game(db_session, own_team, "Alpha", datetime(2026, 1, 1, 18, 0))
    b = _game(db_session, own_team, "Beta", datetime(2026, 1, 8, 18, 0))
    pending = _game(db_session, own_team, "Pending Opp", datetime(2026, 1, 9, 18, 0), needs_review=True)

    first = client.get(f"/teams/{own_team.id}/calendar.ics")
    second = client.get(f"/teams/{own_team.id}/calendar.ics")

    assert first.status_code == 200
    assert first.headers["content-type"].startswith("text/calendar")
    assert first.text.startswith("BEGIN:VCALENDAR\r\n")
    assert first.text.count("BEGIN:VEVENT") == 2

    def uids(body: str) -> set[str]:
        return {line for line in body.split("\r\n") if line.startswith("UID:")}

    assert uids(first.text) == {f"UID:{a.id}@gush-ball", f"UID:{b.id}@gush-ball"}
    assert uids(first.text) == uids(second.text)
    assert f"UID:{pending.id}@" not in first.text
    assert "Pending Opp" not in first.text


def test_calendar_times_are_asia_jerusalem(client: TestClient, db_session: Session, own_team: Team) -> None:
    _game(db_session, own_team, "Winter", datetime(2026, 1, 15, 20, 0))
    _game(db_session, own_team, "Summer", datetime(2026, 7, 15, 20, 0))

    body = _feed(client, own_team)

    assert "DTSTART:20260115T180000Z" in body
    assert "DTSTART:20260715T170000Z" in body


def test_calendar_event_title_location_score(client: TestClient, db_session: Session) -> None:
    team = Team(name="Own", slug="own", home_court_address="Hall 1, Tel Aviv; Israel")
    db_session.add(team)
    db_session.commit()
    _game(
        db_session, team, "Home Opp", datetime(2026, 1, 1, 18, 0),
        is_home=True, team_score=80, opponent_score=70, description="Cup, final; bring tickets",
    )
    _game(db_session, team, "Away Opp", datetime(2026, 1, 8, 18, 0), is_home=False, opp_address="Their Gym, Haifa")

    home_event, away_event = _feed(client, team).split("BEGIN:VEVENT")[1:]
    home_event = home_event.replace("\r\n ", "")
    away_event = away_event.replace("\r\n ", "")

    assert "SUMMARY:Own נגד Home Opp" in home_event
    assert r"LOCATION:Hall 1\, Tel Aviv\; Israel" in home_event
    assert "80–70" in home_event
    assert r"Cup\, final\; bring tickets" in home_event
    assert r"LOCATION:Their Gym\, Haifa" in away_event
    assert "SUMMARY:Away Opp נגד Own" in away_event
    assert "תוצאה" not in away_event


def test_calendar_lines_are_folded_at_75_octets(client: TestClient, db_session: Session, own_team: Team) -> None:
    text = "שלום עולם " * 30
    _game(db_session, own_team, "Opp", datetime(2026, 1, 1, 18, 0), description=text)

    body = _feed(client, own_team)

    assert all(len(line.encode()) <= 75 for line in body.split("\r\n"))
    assert f"DESCRIPTION:{text}" in body.replace("\r\n ", "")


def test_calendar_unknown_team_404(client: TestClient) -> None:
    assert client.get("/teams/999/calendar.ics").status_code == 404
