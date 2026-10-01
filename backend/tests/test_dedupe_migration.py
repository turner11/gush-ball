import importlib.util
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Game, LineupSnapshot, Opponent, Player, PlayerImage, Team, TeamVideo

_path = next((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("f5ecfce52374_*.py"))
_spec = importlib.util.spec_from_file_location("dedupe_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)

SCRAPED_PHOTO = "https://ibasketball.co.il/wp-content/uploads/p.jpg"


def _games(db: Session, team: Team) -> tuple[Game, Game]:
    opp = Opponent(name="Opp")
    db.add(opp)
    db.flush()
    twins = [
        Game(team_id=team.id, opponent_id=opp.id, scheduled_at=datetime(2026, 1, 1, 20, tzinfo=UTC), source_event_id=ev, **kw)
        for ev, kw in ((10, {}), (20, {"needs_review": True}))
    ]
    db.add_all(twins)
    db.commit()
    return twins[0], twins[1]


def _run_games(db: Session) -> list[Game]:
    migration._dedupe_games(db.connection())
    db.expire_all()
    return list(db.scalars(select(Game)))


def test_game_twins_without_admin_data_keep_published_row_at_newest_event(db_session, own_team):
    old, _ = _games(db_session, own_team)
    (kept,) = _run_games(db_session)
    assert (kept.id, kept.source_event_id) == (old.id, 20)


def test_game_twins_keep_the_one_with_stats(db_session, own_team):
    _, new = _games(db_session, own_team)
    db_session.add(LineupSnapshot(game_id=new.id, players=[1, 2, 3, 4, 5], elapsed=1.0, offense_diff=0, defence_diff=0))
    db_session.commit()
    (kept,) = _run_games(db_session)
    assert (kept.id, kept.source_event_id) == (new.id, 20)


def _players(db: Session, team: Team) -> tuple[Player, Player]:
    twins = [Player(team_id=team.id, name="Dan", source_url=f"u{i}") for i in (1, 2)]
    db.add_all(twins)
    db.flush()
    db.add_all(PlayerImage(player_id=p.id, url=SCRAPED_PHOTO) for p in twins)
    db.commit()
    return twins[0], twins[1]


def _run_players(db: Session) -> dict[int, bool]:
    migration._dedupe_players(db.connection())
    db.expire_all()
    return {p.id: p.deleted_at is not None for p in db.scalars(select(Player))}


def test_player_twins_keep_the_one_with_jersey_and_soft_delete_other(db_session, own_team):
    a, b = _players(db_session, own_team)
    b.jersey_number = 7
    db_session.commit()
    assert _run_players(db_session) == {a.id: True, b.id: False}


def test_player_twins_keep_the_one_tagged_in_a_video(db_session, own_team):
    a, b = _players(db_session, own_team)
    db_session.add(TeamVideo(team_id=own_team.id, title="v", url="https://x", player_ids=[b.id]))
    db_session.commit()
    assert _run_players(db_session) == {a.id: True, b.id: False}


def test_player_twins_both_with_admin_data_are_untouched(db_session, own_team):
    a, b = _players(db_session, own_team)
    a.jersey_number, b.jersey_number = 4, 7
    db_session.commit()
    assert _run_players(db_session) == {a.id: False, b.id: False}
