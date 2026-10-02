from datetime import UTC, datetime

import cv2
import httpx
import numpy as np
import pytest
from sqlalchemy.orm import Session

from app import scrape_games
from app.models import Game, GameStatus, Opponent, Player, PlayerImage, Team

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


def _opponent_detail(sp_id: int) -> dict:
    if sp_id == OPP_SP_ID:
        return {**OPPONENT_DETAIL, "id": sp_id}
    return {
        "id": sp_id,
        "title": {"rendered": f"Other {sp_id}"},
        "link": f"https://ibasketball.co.il/team/{sp_id}/",
        "_embedded": {"wp:featuredmedia": [{"source_url": f"https://ibasketball.co.il/{sp_id}.png"}]},
    }


@pytest.fixture(autouse=True)
def _clear_sp_team_cache() -> None:
    scrape_games._sp_team_id.cache_clear()


class FakeApi:
    """Path-keyed fake for app.scrape_games._get_json. Records calls, no network/sleep."""

    def __init__(self, events: list[dict], known_opponents: tuple[int, ...] = (OPP_SP_ID,)) -> None:
        self.events = events
        self.known_opponents = known_opponents
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, path: str, **params: object) -> object:
        self.calls.append((path, params))
        if path == "/sportspress/v2/teams" and "include" in params:
            ids = [int(i) for i in str(params["include"]).split(",")]
            return [_opponent_detail(i) for i in ids if i in self.known_opponents]
        if path == "/sportspress/v2/teams":
            return [{"id": OUR_SP_ID}]
        if path == "/sportspress/v2/events":
            return self.events
        raise AssertionError(f"unexpected path {path}")

ADDRESS_HTML = (
    '<div class="data-venue"><span>אולם:</span>'
    '<a href="https://ibasketball.co.il/venue/2087/">בי"ס זבוטינסקי, הרקפת 44, בית שמש</a></div>'
    '<div class="data-address"><span>כתובת:</span>הצבר 19/14 ראשון לציון, ראשון לציון, 0</div>'
)
ADDRESS = 'בי"ס זבוטינסקי, הרקפת 44, בית שמש'


@pytest.fixture(autouse=True)
def page_calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Stub the team-page fetch (no network); records the URLs requested."""
    calls: list[str] = []

    def fake(url: str) -> str:
        calls.append(url)
        return ADDRESS_HTML

    monkeypatch.setattr(scrape_games, "_get_page", fake)
    return calls


def test_sync_fetches_all_opponents_in_one_request(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    other_event = {**FUTURE_EVENT, "id": 9003, "teams": [OUR_SP_ID, 2002]}
    fake = FakeApi([FUTURE_EVENT, FINAL_EVENT_AWAY, other_event], known_opponents=(OPP_SP_ID, 2002))
    monkeypatch.setattr(scrape_games, "_get_json", fake)

    scrape_games.sync_team_games(db_session, team)

    batches = [c for c in fake.calls if "include" in c[1]]
    assert len(batches) == 1
    assert batches[0][0] == "/sportspress/v2/teams"
    opponents = {o.name: o.logo_url for o in db_session.query(Opponent)}
    assert opponents == {
        OPPONENT_NAME_UNESCAPED: "https://ibasketball.co.il/logo.png",
        "Other 2002": "https://ibasketball.co.il/2002.png",
    }


def test_sync_fails_loud_when_opponent_missing_from_batch(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT], known_opponents=()))

    with pytest.raises(ValueError, match=str(OPP_SP_ID)):
        scrape_games.sync_team_games(db_session, team)


def test_sp_team_lookup_is_fetched_once_per_team_url(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, "")
    fake = FakeApi([])
    monkeypatch.setattr(scrape_games, "_get_json", fake)

    scrape_games.sync_team_games(db_session, team)
    scrape_games.sync_team_players(db_session, team)

    lookups = [c for c in fake.calls if c[0] == "/sportspress/v2/teams" and "include" not in c[1]]
    assert len(lookups) == 1


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


def test_sync_sets_opponent_address_from_team_page(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, page_calls: list[str]
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FINAL_EVENT_AWAY]))

    scrape_games.sync_team_games(db_session, team)

    assert db_session.query(Opponent).one().address == ADDRESS
    assert OPPONENT_DETAIL["link"] in page_calls


def test_sync_fills_own_team_home_court_address(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, page_calls: list[str]
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([]))

    scrape_games.sync_team_games(db_session, team)

    assert team.home_court_address == ADDRESS
    assert page_calls == [team.ibasketball_team_url]


def test_sync_never_overwrites_admin_home_court_address(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, page_calls: list[str]
) -> None:
    team = _make_team(db_session)
    team.home_court_address = "Admin Hall"
    db_session.commit()
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([]))

    scrape_games.sync_team_games(db_session, team)

    assert team.home_court_address == "Admin Hall"
    assert page_calls == []


@pytest.mark.parametrize(
    ("failure", "stored"),
    [
        ("<p>no address</p>", ""),
        # Empty venue (seen live on team 13673): never fall back to the club address.
        (
            (
                '<div class="data-venue"><span>אולם:</span></div>'
                '<div class="data-address"><span>כתובת:</span> , , 0</div>'
            ),
            "",
        ),
        (httpx.ConnectError("boom"), None),
    ],
)
def test_sync_address_missing_or_fetch_error_still_syncs_games(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, failure: object, stored: str | None
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))

    def fake(url: str) -> str:
        if isinstance(failure, Exception):
            raise failure
        return failure

    monkeypatch.setattr(scrape_games, "_get_page", fake)

    assert scrape_games.sync_team_games(db_session, team) == 1
    assert db_session.query(Opponent).one().address == stored
    assert team.home_court_address == stored


@pytest.mark.parametrize("known", [ADDRESS, ""])
def test_sync_does_not_refetch_opponent_with_known_address(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, page_calls: list[str], known: str
) -> None:
    team = _make_team(db_session)
    team.home_court_address = known
    db_session.add(
        Opponent(name=OPPONENT_NAME_UNESCAPED, source_url=OPPONENT_DETAIL["link"], address=known)
    )
    db_session.commit()
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))

    scrape_games.sync_team_games(db_session, team)

    assert page_calls == []


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


def _sync_then_reissue(db_session: Session, monkeypatch: pytest.MonkeyPatch, reissued: dict, **edits) -> tuple[Team, Game]:
    team = _make_team(db_session)
    fake = FakeApi([FUTURE_EVENT])
    monkeypatch.setattr(scrape_games, "_get_json", fake)
    scrape_games.sync_team_games(db_session, team)
    game = db_session.query(Game).filter_by(source_event_id=9001).one()
    game.needs_review = False
    for key, value in edits.items():
        setattr(game, key, value)
    db_session.commit()
    fake.events = [reissued]
    scrape_games.sync_team_games(db_session, team)
    db_session.refresh(game)
    return team, game


def test_resync_rekeys_game_when_source_reissues_event_id(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team, game = _sync_then_reissue(
        db_session, monkeypatch, {**FUTURE_EVENT, "id": 9101}, stats_url="https://example.com/sheet"
    )

    games = db_session.query(Game).filter_by(team_id=team.id).all()
    assert [g.id for g in games] == [game.id]
    assert game.source_event_id == 9101
    assert game.stats_url == "https://example.com/sheet"


def test_resync_rekeyed_overridden_game_keeps_admin_values_and_suggests(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    reissued = {**FUTURE_EVENT, "id": 9101, "status": "publish", "main_results": [90, 88]}
    team, game = _sync_then_reissue(
        db_session,
        monkeypatch,
        reissued,
        is_manually_overridden=True,
        team_score=12,
        status=GameStatus.FINAL,
    )

    assert db_session.query(Game).filter_by(team_id=team.id).count() == 1
    assert game.source_event_id == 9101
    assert game.team_score == 12
    assert game.scrape_suggestion == {"team_score": 90, "opponent_score": 88}


def test_resync_does_not_adopt_orphan_from_another_day(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team, game = _sync_then_reissue(
        db_session, monkeypatch, {**FUTURE_EVENT, "id": 9101, "date": "2026-11-28T21:00:00"}
    )

    assert db_session.query(Game).filter_by(team_id=team.id).count() == 2
    assert game.source_event_id == 9001


def test_sync_leaves_other_teams_game_untouched(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team_a = _make_team(db_session)
    team_b = Team(name="Gush Ball B", slug="gush-ball-b")
    opp = Opponent(name="Opp")
    db_session.add_all([team_b, opp])
    db_session.commit()
    game = Game(
        team_id=team_b.id, opponent_id=opp.id, is_home=True,
        scheduled_at=datetime(2026, 10, 28, tzinfo=UTC), status=GameStatus.SCHEDULED,
        source_event_id=9001,
    )
    db_session.add(game)
    db_session.commit()
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))

    scrape_games.sync_team_games(db_session, team_a)

    db_session.refresh(game)
    assert game.team_id == team_b.id
    assert game.opponent_id == opp.id
    assert db_session.query(Game).count() == 1


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


def _two_teams(db_session: Session) -> None:
    for slug in ("bad", "good"):
        db_session.add(
            Team(name=slug, slug=slug, ibasketball_team_url=f"https://ibasketball.co.il/team/1-{slug}/")
        )
    db_session.commit()


def _fail_for_bad(monkeypatch: pytest.MonkeyPatch, db_session: Session, fail) -> None:
    real = scrape_games.sync_team_games

    def fake(db: Session, team: Team, auto_accept: bool = False) -> int:
        if team.slug == "bad":
            return fail(db)
        return real(db, team, auto_accept)

    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))
    monkeypatch.setattr(scrape_games, "sync_team_games", fake)


def _raise_value_error(db: Session) -> int:
    raise ValueError("boom")


def test_sync_all_games_continues_after_one_team_fails(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _two_teams(db_session)
    _fail_for_bad(monkeypatch, db_session, _raise_value_error)
    errors: list[str] = []

    assert scrape_games.sync_all_games(db_session, errors) == 1

    assert db_session.query(Game).count() == 1
    assert "'bad'" in caplog.text
    assert errors == ["games bad: boom"]


def test_sync_auto_accept_publishes_new_games(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT, FINAL_EVENT_AWAY]))

    scrape_games.sync_team_games(db_session, team, auto_accept=True)

    games = db_session.query(Game).all()
    assert len(games) == 2
    assert all(g.needs_review is False and g.is_scraped is True for g in games)


def test_sync_auto_accept_publishes_previously_pending_game(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FUTURE_EVENT]))
    scrape_games.sync_team_games(db_session, team)
    assert db_session.query(Game).one().needs_review is True

    scrape_games.sync_team_games(db_session, team, auto_accept=True)

    db_session.expire_all()
    assert db_session.query(Game).one().needs_review is False


def test_sync_auto_accept_never_applies_suggestion_to_overridden_game(
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

    fake.events = [{**FUTURE_EVENT, "status": "publish", "main_results": [90, 88]}]
    scrape_games.sync_team_games(db_session, team, auto_accept=True)

    db_session.refresh(game)
    assert game.team_score == 12
    assert game.is_manually_overridden is True
    assert game.scrape_suggestion == {"team_score": 90, "opponent_score": 88}
    assert game.needs_review is True


def test_sync_all_games_filters_by_team_ids(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _two_teams(db_session)
    _fail_for_bad(monkeypatch, db_session, _raise_value_error)
    good = db_session.query(Team).filter_by(slug="good").one()
    errors: list[str] = []

    assert scrape_games.sync_all_games(db_session, errors, team_ids=[good.id]) == 1

    assert errors == []


def test_sync_all_games_reports_when_no_team_has_url(db_session: Session) -> None:
    errors: list[str] = []

    assert scrape_games.sync_all_games(db_session, errors) == 0

    assert errors == ["games: no team has an ibasketball_team_url set"]


def test_sync_all_games_rolls_back_after_db_failure_so_next_team_still_syncs(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _two_teams(db_session)

    def db_failure(db: Session) -> int:
        db.add(Game(team_id=None, is_home=True, status=GameStatus.SCHEDULED))  # violates NOT NULL
        db.commit()
        return 1

    _fail_for_bad(monkeypatch, db_session, db_failure)

    assert scrape_games.sync_all_games(db_session) == 1
    assert db_session.query(Game).count() == 1


ROSTER_HTML = (
    '<a class="player data-item male" href="/p/1"><img src="a.jpg"/>איתי ורולקר<br />'
    '<span></span><span>01-02-2000</span></a>'
    '<a class="player data-item male" href="/p/2"><img src="b.jpg"/>רן &#8211; לוי<br />'
    '<span></span><span>03-04-2001</span></a>'
)


def _fake_roster(monkeypatch: pytest.MonkeyPatch, html_text: str) -> list[dict]:
    calls: list[dict] = []

    def fake(**params: object) -> str:
        calls.append(params)
        return html_text

    monkeypatch.setattr(scrape_games, "_get_html", fake)
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([]))
    monkeypatch.setattr(scrape_games, "_get_image", lambda url: b"x")
    return calls


def test_sync_team_players_creates_players_from_roster_tab(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, ROSTER_HTML)

    assert scrape_games.sync_team_players(db_session, team) == 2

    players = db_session.query(Player).all()
    assert {(p.name, p.team_id, p.jersey_number) for p in players} == {
        ("איתי ורולקר", team.id, None),
        ("רן – לוי", team.id, None),
    }
    assert {p.source_url for p in players} == {"/p/1", "/p/2"}


def test_sync_team_players_requests_team_roster_template(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    calls = _fake_roster(monkeypatch, "")

    scrape_games.sync_team_players(db_session, team)

    assert calls == [{"action": "ibba", "template": "players", "id": OUR_SP_ID, "type": "sp_team"}]


def test_sync_team_players_is_idempotent_and_keeps_admin_edits(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    db_session.add(Player(team_id=team.id, name="איתי ורולקר", jersey_number=10))
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)

    assert scrape_games.sync_team_players(db_session, team) == 1
    assert scrape_games.sync_team_players(db_session, team) == 0

    players = {p.name: p.jersey_number for p in db_session.query(Player).all()}
    assert players == {"איתי ורולקר": 10, "רן – לוי": None}
    adopted = db_session.query(Player).filter_by(jersey_number=10).one()
    assert adopted.source_url == "/p/1"


def test_sync_team_players_does_not_reimport_renamed_player(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, ROSTER_HTML)
    scrape_games.sync_team_players(db_session, team)
    db_session.query(Player).filter_by(source_url="/p/1").one().name = "Renamed"
    db_session.commit()

    assert scrape_games.sync_team_players(db_session, team) == 0

    assert db_session.query(Player).count() == 2
    assert db_session.query(Player).filter_by(source_url="/p/1").one().name == "Renamed"


def test_sync_team_players_rekeys_player_whose_href_changed(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    db_session.add(Player(team_id=team.id, name="איתי ורולקר", jersey_number=10, source_url="/old/1"))
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)

    assert scrape_games.sync_team_players(db_session, team) == 1

    assert db_session.query(Player).count() == 2
    moved = db_session.query(Player).filter_by(jersey_number=10).one()
    assert moved.source_url == "/p/1"


def test_sync_team_players_does_not_reimport_soft_deleted_player(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, ROSTER_HTML)
    scrape_games.sync_team_players(db_session, team)
    gone = db_session.query(Player).filter_by(source_url="/p/2").one()
    gone.deleted_at = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.commit()

    assert scrape_games.sync_team_players(db_session, team) == 0

    assert db_session.query(Player).count() == 2
    assert db_session.query(Player).filter_by(source_url="/p/2").one().deleted_at is not None


def test_sync_team_players_moves_href_from_soft_deleted_twin_to_live_player(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    live = Player(team_id=team.id, name="איתי ורולקר", jersey_number=10, source_url="/old/1")
    twin = Player(
        team_id=team.id,
        name="איתי ורולקר",
        source_url="/p/1",
        deleted_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    db_session.add_all([live, twin])
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)

    scrape_games.sync_team_players(db_session, team)

    db_session.refresh(live)
    db_session.refresh(twin)
    assert live.source_url == "/p/1"
    assert twin.source_url is None
    assert twin.deleted_at is not None
    assert db_session.query(Player).count() == 3

    assert scrape_games.sync_team_players(db_session, team) == 0
    db_session.refresh(live)
    assert live.source_url == "/p/1"


def test_sync_team_players_handles_empty_roster(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, "")

    assert scrape_games.sync_team_players(db_session, team) == 0
    assert db_session.query(Player).count() == 0


def _images(db: Session) -> dict[str, list[str]]:
    return {p.name: [i.url for i in p.images] for p in db.query(Player).all()}


def test_sync_team_players_saves_scraped_image(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, ROSTER_HTML)

    scrape_games.sync_team_players(db_session, team)

    assert _images(db_session) == {
        "איתי ורולקר": ["https://ibasketball.co.il/a.jpg"],
        "רן – לוי": ["https://ibasketball.co.il/b.jpg"],
    }


def test_sync_team_players_fills_image_for_existing_player_without_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    db_session.add(Player(team_id=team.id, name="איתי ורולקר"))
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)

    assert scrape_games.sync_team_players(db_session, team) == 1

    assert _images(db_session)["איתי ורולקר"] == ["https://ibasketball.co.il/a.jpg"]


def test_sync_team_players_never_overrides_admin_image_and_is_idempotent(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    player = Player(team_id=team.id, name="איתי ורולקר")
    player.images.append(PlayerImage(url="https://cdn/admin.png"))
    db_session.add(player)
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)

    scrape_games.sync_team_players(db_session, team)
    scrape_games.sync_team_players(db_session, team)

    assert _images(db_session) == {
        "איתי ורולקר": ["https://cdn/admin.png"],
        "רן – לוי": ["https://ibasketball.co.il/b.jpg"],
    }


def test_sync_team_players_card_without_img_creates_player_without_image(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, '<a class="player" href="/p/1">איתי<br /></a>')

    assert scrape_games.sync_team_players(db_session, team) == 1
    assert _images(db_session) == {"איתי": []}


def test_focus_centers_face_in_tall_photo() -> None:
    assert scrape_games._focus(800, 1732, (120, 570, 520, 520)) == pytest.approx((50.0, 40.56, 1.0), abs=0.01)


def test_focus_zooms_small_face_capped_and_clamped_to_edges() -> None:
    assert scrape_games._focus(800, 800, (300, 300, 100, 100)) == pytest.approx((40.625, 38.75, 3.0))
    assert scrape_games._focus(800, 1600, (0, 0, 40, 40)) == (0.0, 0.0, 3.0)
    assert scrape_games._focus(1200, 800, (900, 100, 200, 200)) == pytest.approx((100.0, 0.0, 2.0))


def test_face_focus_without_face_defaults_to_top_center() -> None:
    blank = cv2.imencode(".png", np.full((400, 300), 255, np.uint8))[1].tobytes()
    for data in (b"", b"not an image", blank):
        assert scrape_games.face_focus(data) == (50.0, 0.0, 1.0)


def _image_focus(db: Session) -> list[tuple]:
    return [(i.url, i.focus_x, i.focus_y, i.zoom) for i in db.query(PlayerImage).order_by(PlayerImage.url)]


def test_sync_team_players_stores_face_focus_once(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    player = Player(team_id=team.id, name="איתי ורולקר")
    player.images.append(PlayerImage(url="https://cdn/admin.png"))
    db_session.add(player)
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)
    fetched: list[str] = []
    monkeypatch.setattr(scrape_games, "_get_image", lambda url: fetched.append(url) or b"x")
    monkeypatch.setattr(scrape_games, "face_focus", lambda data: (40.0, 30.0, 1.5))

    scrape_games.sync_team_players(db_session, team)

    assert _image_focus(db_session) == [
        ("https://cdn/admin.png", 40.0, 30.0, 1.5),
        ("https://ibasketball.co.il/b.jpg", 40.0, 30.0, 1.5),
    ]
    assert sorted(fetched) == ["https://cdn/admin.png", "https://ibasketball.co.il/b.jpg"]

    scrape_games.sync_team_players(db_session, team)
    assert len(fetched) == 2


def test_sync_team_players_fills_focus_for_off_roster_player_images(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    live = Player(team_id=team.id, name="משה קולקר")
    live.images.append(PlayerImage(url="https://cdn/off.webp"))
    gone = Player(team_id=team.id, name="נמחק", deleted_at=datetime.now(UTC))
    gone.images.append(PlayerImage(url="https://cdn/gone.webp"))
    db_session.add_all([live, gone])
    db_session.commit()
    _fake_roster(monkeypatch, ROSTER_HTML)
    fetched: list[str] = []
    monkeypatch.setattr(scrape_games, "_get_image", lambda url: fetched.append(url) or b"x")
    monkeypatch.setattr(scrape_games, "face_focus", lambda data: (40.0, 30.0, 1.5))

    scrape_games.sync_team_players(db_session, team)

    focus = {url: (x, y, z) for url, x, y, z in _image_focus(db_session)}
    assert focus["https://cdn/off.webp"] == (40.0, 30.0, 1.5)
    assert focus["https://cdn/gone.webp"] == (None, None, None)
    assert "https://cdn/gone.webp" not in fetched


def test_sync_team_players_image_fetch_error_keeps_players_and_retries(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    _fake_roster(monkeypatch, ROSTER_HTML)
    calls: list[str] = []

    def boom(url: str) -> bytes:
        calls.append(url)
        raise httpx.ConnectError("x")

    monkeypatch.setattr(scrape_games, "_get_image", boom)

    assert scrape_games.sync_team_players(db_session, team) == 2
    assert [f[1] for f in _image_focus(db_session)] == [None, None]
    assert len(calls) == 2

    scrape_games.sync_team_players(db_session, team)
    assert len(calls) == 4


def test_resync_refreshes_opponent_source_url_to_latest_link(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    opponent = Opponent(
        name=OPPONENT_NAME_UNESCAPED, source_url="https://ibasketball.co.il/team/old-opp/"
    )
    db_session.add(opponent)
    db_session.commit()
    monkeypatch.setattr(scrape_games, "_get_json", FakeApi([FINAL_EVENT_AWAY]))

    scrape_games.sync_team_games(db_session, team)

    db_session.refresh(opponent)
    assert db_session.query(Opponent).count() == 1
    assert opponent.source_url == OPPONENT_DETAIL["link"]
