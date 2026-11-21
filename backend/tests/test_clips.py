import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Membership, Team, VideoClip
from tests.test_games import _make_game, _make_team
from tests.test_players import _login_user, _player

YT = "https://www.youtube.com/watch?v=abcdefghijk"


def _body(game_id: int | None, **overrides: object) -> dict:
    return {"game_id": game_id, "source_url": YT, "start": 10, "end": 20, **overrides}


def test_editor_creates_lists_updates_and_deletes_clip(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    player = _player(db_session, team)
    base = f"/teams/{team.id}/clips"
    created = admin_client.post(base, json=_body(game.id, section="Q1", is_highlight=True, player_ids=[player.id]))
    assert created.status_code == 201
    clip = created.json()
    assert (clip["is_highlight"], clip["in_game_briefing"], clip["player_ids"], clip["team_id"]) == (True, False, [player.id], team.id)
    assert clip["is_player_highlight"] is False
    assert admin_client.get(base).json() == [clip]

    patched = admin_client.patch(f"{base}/{clip['id']}", json=_body(game.id, start=12, end=30, section="Q2", is_highlight=True))
    assert (patched.json()["start"], patched.json()["end"], patched.json()["section"]) == (12, 30, "Q2")
    assert admin_client.delete(f"{base}/{clip['id']}").status_code == 204
    assert admin_client.get(base).json() == []
    db_session.refresh(game)
    assert game.is_manually_overridden is False


@pytest.mark.parametrize(
    ("who", "expected"),
    [("coach", 201), ("admin:own", 201), ("member:own", 403), ("linked", 403), ("admin:other", 403), ("anonymous", 401)],
)
def test_clip_write_scope(
    client: TestClient, db_session: Session, own_team: Team, other_team: Team, who: str, expected: int
) -> None:
    game = _make_game(db_session, own_team)
    base = f"/teams/{own_team.id}/clips"
    if who == "coach":
        user = _login_user(client, db_session, "u", Membership(team_id=own_team.id, role="member"))
        _player(db_session, own_team, "Coach", user=user, number=None).is_coach = True
        db_session.commit()
    elif who == "linked":
        user = _login_user(client, db_session, "u", Membership(team_id=own_team.id, role="member"))
        _player(db_session, own_team, "Linked", user=user)
    elif who != "anonymous":
        role, target = who.split(":")
        _login_user(client, db_session, "u", Membership(team_id=(own_team if target == "own" else other_team).id, role=role))
    assert client.post(base, json=_body(game.id, is_highlight=True)).status_code == expected
    assert client.get(base).status_code == (200 if expected == 201 else expected)


def test_clip_validation_422(admin_client: TestClient, db_session: Session) -> None:
    team, other = _make_team(db_session), _make_team(db_session, "Other")
    game, foreign_game = _make_game(db_session, team), _make_game(db_session, other)
    foreign_player = _player(db_session, other)
    base = f"/teams/{team.id}/clips"
    bad = [
        _body(None, is_highlight=True),
        _body(None, in_game_briefing=True),
        _body(game.id, start=20, end=20),
        _body(game.id, start=-1),
        _body(foreign_game.id),
        _body(game.id, player_ids=[foreign_player.id]),
        _body(game.id, source_url="javascript:alert(1)"),
        _body(game.id, is_player_highlight=True),
    ]
    assert [admin_client.post(base, json=b).status_code for b in bad] == [422] * len(bad)
    # a game-less clip is fine as a player briefing, and a text-only note needs no url
    assert admin_client.post(base, json=_body(None, in_player_briefing=True)).status_code == 201
    personal = _body(None, is_player_highlight=True, player_ids=[_player(db_session, team).id])
    assert admin_client.post(base, json=personal).status_code == 201
    assert admin_client.post(base, json={"game_id": game.id, "note": "hi", "is_highlight": True}).status_code == 201
    assert len(db_session.scalars(select(VideoClip.id)).all()) == 3


def test_clip_of_another_team_is_not_found(admin_client: TestClient, db_session: Session) -> None:
    team, other = _make_team(db_session), _make_team(db_session, "Other")
    clip = VideoClip(team_id=other.id)
    db_session.add(clip)
    db_session.commit()
    assert admin_client.patch(f"/teams/{team.id}/clips/{clip.id}", json=_body(None)).status_code == 404
    assert admin_client.delete(f"/teams/{team.id}/clips/{clip.id}").status_code == 404
