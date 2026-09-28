from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app import scrape_games
from app.models import Game, GameStatus, Opponent, Team

OUR_SP_ID = 1542241
OPP_SP_ID = 2001

FUTURE_EVENT = {
    "id": 9001,
    "date": "2026-10-28T21:00:00",
    "status": "future",
    "teams": [OUR_SP_ID, OPP_SP_ID],
    "main_results": [],
    "link": "https://ibasketball.co.il/event/9001/",
}

FINAL_EVENT_AWAY = {
    "id": 9002,
    "date": "2026-09-01T18:00:00",
    "status": "publish",
    "teams": [OPP_SP_ID, OUR_SP_ID],
    "main_results": [80, 75],
    "link": "https://ibasketball.co.il/event/9002/",
}

OPPONENT_DETAIL = {
    "title": {"rendered": "מכבי &#8211; תל אביב"},
    "link": "https://ibasketball.co.il/team/opp/",
    "_embedded": {
        "wp:featuredmedia": [{"source_url": "https://ibasketball.co.il/logo.png"}]
    },
}

OPPONENT_NAME_UNESCAPED = "מכבי – תל אביב"


class FakeApi:
    """Path-keyed fake for app.scrape_games._get_json. Records calls, no network/sleep."""

    def __init__(self, events: list[dict]) -> None:
        self.events = events
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, path: str, **params: object) -> object:
        self.calls.append((path, params))
        if path == "/sportspress/v2/teams":
            return [{"id": OUR_SP_ID}]
        if path == "/sportspress/v2/events":
            return self.events
        if path == f"/sportspress/v2/teams/{OPP_SP_ID}":
            return OPPONENT_DETAIL
        raise AssertionError(f"unexpected path {path}")


def _make_team(db_session: Session) -> Team:
    team = Team(
        name="Gush Ball A",
        slug="gush-ball-a",
        ibasketball_team_url="https://ibasketball.co.il/team/12345-%d7%a7%d7%91%d7%95%d7%a6%d7%94/",
    )
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


def test_sync_creates_pending_scraped_games(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT, FINAL_EVENT_AWAY])
    monkeypatch.setattr(scrape_games, "_get_json", fake)

    count = scrape_games.sync_team_games(db_session, team)

    assert count == 2
    games = db_session.query(Game).order_by(Game.source_event_id).all()
    assert [g.source_event_id for g in games] == [9001, 9002]
    for g in games:
        assert g.is_scraped is True
        assert g.needs_review is True
        assert g.is_manually_overridden is False

    future_game = games[0]
    assert future_game.status == GameStatus.SCHEDULED
    assert future_game.team_score is None
    assert future_game.opponent_score is None
    assert future_game.is_home is True
    assert future_game.scheduled_at == datetime(2026, 10, 28, 21, 0)  # noqa: DTZ001 (naive local wall time, per #14)


def test_sync_maps_final_score_to_our_side(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FINAL_EVENT_AWAY])
    monkeypatch.setattr(scrape_games, "_get_json", fake)

    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9002).one()
    assert game.status == GameStatus.FINAL
    assert game.team_score == 75
    assert game.opponent_score == 80
    assert game.is_home is False


def test_sync_sets_opponent_name_logo_and_source_url(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    existing_opponent = Opponent(
        name=OPPONENT_NAME_UNESCAPED, logo_url="https://existing.example/logo.png"
    )
    db_session.add(existing_opponent)
    db_session.commit()

    fake = FakeApi([FINAL_EVENT_AWAY])
    monkeypatch.setattr(scrape_games, "_get_json", fake)

    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9002).one()
    assert game.opponent.name == OPPONENT_NAME_UNESCAPED
    assert game.opponent.id == existing_opponent.id
    # Admin-set logo is never clobbered.
    assert game.opponent.logo_url == "https://existing.example/logo.png"
    assert game.opponent.source_url == "https://ibasketball.co.il/team/opp/"


def test_resync_updates_score_without_duplicating_or_republishing(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT])
    monkeypatch.setattr(scrape_games, "_get_json", fake)
    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9001).one()
    game.needs_review = False
    db_session.commit()

    played_event = {**FUTURE_EVENT, "status": "publish", "main_results": [90, 88]}
    fake.events = [played_event]

    scrape_games.sync_team_games(db_session, team)

    games = db_session.query(Game).filter_by(source_event_id=9001).all()
    assert len(games) == 1
    game = games[0]
    assert game.status == GameStatus.FINAL
    assert game.team_score == 90
    assert game.opponent_score == 88
    assert game.needs_review is False


def test_resync_skips_manually_overridden_game(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT])
    monkeypatch.setattr(scrape_games, "_get_json", fake)
    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9001).one()
    game.is_manually_overridden = True
    game.team_score = 12
    game.status = GameStatus.FINAL
    db_session.commit()

    played_event = {**FUTURE_EVENT, "status": "publish", "main_results": [90, 88]}
    fake.events = [played_event]

    scrape_games.sync_team_games(db_session, team)

    db_session.refresh(game)
    assert game.team_score == 12
    assert game.status == GameStatus.FINAL
    assert game.scrape_suggestion == {"team_score": 90, "opponent_score": 88}
    assert game.scrape_suggestion_dismissed is False


def test_resync_overridden_game_without_changes_clears_suggestion(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT])
    monkeypatch.setattr(scrape_games, "_get_json", fake)
    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9001).one()
    game.is_manually_overridden = True
    game.scrape_suggestion = {"team_score": 1}
    db_session.commit()

    # Re-scrape the exact same event: nothing differs from the overridden game's
    # values (still SCHEDULED/None/None), so the stale suggestion should clear.
    scrape_games.sync_team_games(db_session, team)

    db_session.refresh(game)
    assert game.scrape_suggestion is None
    assert game.scrape_suggestion_dismissed is False


def test_resync_keeps_dismissed_suggestion_until_source_changes(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT])
    monkeypatch.setattr(scrape_games, "_get_json", fake)
    scrape_games.sync_team_games(db_session, team)

    game = db_session.query(Game).filter_by(source_event_id=9001).one()
    game.is_manually_overridden = True
    game.team_score = 12
    game.status = GameStatus.FINAL
    game.scrape_suggestion = {"team_score": 90, "opponent_score": 88}
    game.scrape_suggestion_dismissed = True
    db_session.commit()

    played_event = {**FUTURE_EVENT, "status": "publish", "main_results": [90, 88]}
    fake.events = [played_event]

    # Same diff as before: dismissed stays put.
    scrape_games.sync_team_games(db_session, team)
    db_session.refresh(game)
    assert game.scrape_suggestion == {"team_score": 90, "opponent_score": 88}
    assert game.scrape_suggestion_dismissed is True

    # Source changes again: new diff resets dismissed.
    different_event = {**FUTURE_EVENT, "status": "publish", "main_results": [95, 88]}
    fake.events = [different_event]
    scrape_games.sync_team_games(db_session, team)
    db_session.refresh(game)
    assert game.scrape_suggestion == {"team_score": 95, "opponent_score": 88}
    assert game.scrape_suggestion_dismissed is False
