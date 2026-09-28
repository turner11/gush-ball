from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Game, GameStatus, Opponent, Team


def _make_team(db_session: Session, name: str = "Gush Ball A") -> Team:
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


def _make_game(db_session: Session, team: Team) -> Game:
    opponent = Opponent(name="Seeded Opponent")
    db_session.add(opponent)
    db_session.flush()
    game = Game(
        team=team,
        opponent=opponent,
        scheduled_at=datetime(2026, 1, 1, 18, 0, tzinfo=timezone.utc),
        status=GameStatus.SCHEDULED,
    )
    db_session.add(game)
    db_session.commit()
    db_session.refresh(game)
    return game


def _game_payload(**overrides: object) -> dict:
    payload = {
        "opponent_name": "Maccabi Test",
        "scheduled_at": datetime(2026, 1, 1, 18, 0, tzinfo=timezone.utc).isoformat(),
        "is_home": True,
    }
    payload.update(overrides)
    return payload


def test_create_game_as_admin_creates_new_opponent(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)

    response = admin_client.post(f"/teams/{team.id}/games", json=_game_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["opponent"]["name"] == "Maccabi Test"

    list_response = admin_client.get(f"/teams/{team.id}/games")
    opponents = {game["opponent"]["name"] for game in list_response.json()}
    assert opponents == {"Maccabi Test"}


def test_create_game_reuses_existing_opponent_by_name(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)

    first = admin_client.post(f"/teams/{team.id}/games", json=_game_payload())
    second = admin_client.post(f"/teams/{team.id}/games", json=_game_payload())

    assert first.json()["opponent"]["id"] == second.json()["opponent"]["id"]


def test_create_game_requires_admin(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)

    response = client.post(f"/teams/{team.id}/games", json=_game_payload())

    assert response.status_code == 401


def test_create_game_unknown_team_returns_404(admin_client: TestClient) -> None:
    response = admin_client.post("/teams/999999/games", json=_game_payload())

    assert response.status_code == 404


def test_list_games_is_public(client: TestClient, admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    admin_client.post(f"/teams/{team.id}/games", json=_game_payload())

    response = client.get(f"/teams/{team.id}/games")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_game_by_id_is_public(client: TestClient, admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()

    response = client.get(f"/teams/{team.id}/games/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_game_scoped_to_wrong_team_is_404(
    client: TestClient, admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session, "Gush Ball A")
    other_team = _make_team(db_session, "Gush Ball B")
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()

    response = client.get(f"/teams/{other_team.id}/games/{created['id']}")

    assert response.status_code == 404


def test_patch_game_requires_admin(client: TestClient, db_session: Session) -> None:
    # Seed via ORM directly (not via admin_client) so `client` stays an
    # unauthenticated session — admin_client logs in on the *same* TestClient
    # instance that `client` resolves to, so using both fixtures in one test
    # would make "plain client" already authenticated.
    team = _make_team(db_session)
    game = _make_game(db_session, team)

    response = client.patch(f"/teams/{team.id}/games/{game.id}", json={"status": "final"})

    assert response.status_code == 401


def test_patch_game_updates_score_status_and_opponent(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()
    original_opponent_id = created["opponent"]["id"]

    response = admin_client.patch(
        f"/teams/{team.id}/games/{created['id']}",
        json={
            "status": "final",
            "team_score": 88,
            "opponent_score": 75,
            "opponent_name": "Brand New Opponent",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "final"
    assert body["team_score"] == 88
    assert body["opponent_score"] == 75
    assert body["opponent"]["name"] == "Brand New Opponent"
    assert body["opponent"]["id"] != original_opponent_id


def test_delete_game_requires_admin(client: TestClient, db_session: Session) -> None:
    # Same reasoning as test_patch_game_requires_admin: seed via ORM so
    # `client` isn't implicitly authenticated by a shared admin_client session.
    team = _make_team(db_session)
    game = _make_game(db_session, team)

    response = client.delete(f"/teams/{team.id}/games/{game.id}")

    assert response.status_code == 401


def test_delete_game_removes_it(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()

    delete_response = admin_client.delete(f"/teams/{team.id}/games/{created['id']}")
    assert delete_response.status_code == 204

    get_response = admin_client.get(f"/teams/{team.id}/games/{created['id']}")
    assert get_response.status_code == 404
