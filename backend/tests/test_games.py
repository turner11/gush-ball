from datetime import UTC, datetime

import bbstats
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import Game, GameScorer, GameStatus, Opponent, Player, Team


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
        scheduled_at=datetime(2026, 1, 1, 18, 0, tzinfo=UTC),
        status=GameStatus.SCHEDULED,
    )
    db_session.add(game)
    db_session.commit()
    db_session.refresh(game)
    return game


def _game_payload(**overrides: object) -> dict:
    payload = {
        "opponent_name": "Maccabi Test",
        "scheduled_at": datetime(2026, 1, 1, 18, 0, tzinfo=UTC).isoformat(),
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


def test_game_read_exposes_opponent_address(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.opponent.address = "Herzl 1, Tel Aviv"
    db_session.commit()

    response = client.get(f"/teams/{team.id}/games")

    assert response.json()[0]["opponent"]["address"] == "Herzl 1, Tel Aviv"


def test_list_games_hides_games_needing_review(
    client: TestClient, admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    admin_client.post(f"/teams/{team.id}/games", json=_game_payload())
    pending = _make_game(db_session, team)
    pending.needs_review = True
    db_session.commit()

    response = client.get(f"/teams/{team.id}/games")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_and_get_game_do_not_expose_review_flags(
    client: TestClient, admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()

    list_body = client.get(f"/teams/{team.id}/games").json()
    get_body = client.get(f"/teams/{team.id}/games/{created['id']}").json()

    hidden_fields = {"is_scraped", "needs_review", "is_manually_overridden", "scrape_suggestion"}
    assert hidden_fields.isdisjoint(list_body[0])
    assert hidden_fields.isdisjoint(get_body)


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


def test_patch_game_sets_manually_overridden_and_clears_needs_review(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.needs_review = True
    db_session.commit()

    response = admin_client.patch(f"/teams/{team.id}/games/{game.id}", json={"status": "final"})

    assert response.status_code == 200
    body = response.json()
    assert body["is_manually_overridden"] is True
    assert body["needs_review"] is False


def test_patch_game_on_already_live_game_still_sets_overridden(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    created = admin_client.post(f"/teams/{team.id}/games", json=_game_payload()).json()

    response = admin_client.patch(
        f"/teams/{team.id}/games/{created['id']}", json={"status": "final"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_manually_overridden"] is True
    assert body["needs_review"] is False


def test_approve_game_clears_needs_review_without_setting_override(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.is_scraped = True
    game.needs_review = True
    game.is_manually_overridden = False
    db_session.commit()

    response = admin_client.post(f"/teams/{team.id}/games/{game.id}/approve")

    assert response.status_code == 200
    body = response.json()
    assert body["needs_review"] is False
    assert body["is_scraped"] is True
    assert body["is_manually_overridden"] is False


def test_approve_game_requires_admin(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)

    response = client.post(f"/teams/{team.id}/games/{game.id}/approve")

    assert response.status_code == 401


def test_approve_game_unknown_game_returns_404(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)

    response = admin_client.post(f"/teams/{team.id}/games/999999/approve")

    assert response.status_code == 404


def test_list_pending_review_games_returns_only_needs_review(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    admin_client.post(f"/teams/{team.id}/games", json=_game_payload())
    pending = _make_game(db_session, team)
    pending.needs_review = True
    db_session.commit()

    response = admin_client.get(f"/teams/{team.id}/games/pending-review")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == pending.id


def test_list_pending_review_games_requires_admin(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)

    response = client.get(f"/teams/{team.id}/games/pending-review")

    assert response.status_code == 401


def test_list_pending_review_includes_games_with_active_suggestion(
    admin_client: TestClient, client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    active = _make_game(db_session, team)
    active.is_manually_overridden = True
    active.scrape_suggestion = {"team_score": 90}
    active.scrape_suggestion_dismissed = False
    dismissed = _make_game(db_session, team)
    dismissed.is_manually_overridden = True
    dismissed.scrape_suggestion = {"team_score": 80}
    dismissed.scrape_suggestion_dismissed = True
    db_session.commit()

    response = admin_client.get(f"/teams/{team.id}/games/pending-review")

    assert response.status_code == 200
    body = response.json()
    ids = {g["id"] for g in body}
    assert ids == {active.id}
    assert body[0]["scrape_suggestion"] == {"team_score": 90}

    # The suggestion-bearing game is still live on the public site.
    public_response = client.get(f"/teams/{team.id}/games")
    assert active.id in {g["id"] for g in public_response.json()}


def test_accept_suggestion_applies_values_and_clears_override(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.is_manually_overridden = True
    game.scrape_suggestion = {
        "team_score": 90,
        "status": "final",
        "scheduled_at": "2026-02-02T20:00:00",
        "opponent_name": "New Opp",
    }
    game.scrape_suggestion_dismissed = False
    db_session.commit()

    response = admin_client.post(f"/teams/{team.id}/games/{game.id}/suggestion/accept")

    assert response.status_code == 200
    body = response.json()
    assert body["team_score"] == 90
    assert body["status"] == "final"
    assert body["scheduled_at"] == "2026-02-02T20:00:00"
    assert body["opponent"]["name"] == "New Opp"
    assert body["scrape_suggestion"] is None
    assert body["is_manually_overridden"] is False

    pending = admin_client.get(f"/teams/{team.id}/games/pending-review").json()
    assert game.id not in {g["id"] for g in pending}


def test_reject_suggestion_keeps_values_and_dismisses(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.is_manually_overridden = True
    game.team_score = 12
    game.scrape_suggestion = {"team_score": 90}
    game.scrape_suggestion_dismissed = False
    db_session.commit()

    response = admin_client.post(f"/teams/{team.id}/games/{game.id}/suggestion/reject")

    assert response.status_code == 200
    body = response.json()
    assert body["team_score"] == 12
    assert body["scrape_suggestion"] == {"team_score": 90}
    assert body["is_manually_overridden"] is True

    db_session.refresh(game)
    assert game.scrape_suggestion_dismissed is True

    pending = admin_client.get(f"/teams/{team.id}/games/pending-review").json()
    assert game.id not in {g["id"] for g in pending}


def test_suggestion_endpoints_require_admin(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)

    accept_response = client.post(f"/teams/{team.id}/games/{game.id}/suggestion/accept")
    reject_response = client.post(f"/teams/{team.id}/games/{game.id}/suggestion/reject")

    assert accept_response.status_code == 401
    assert reject_response.status_code == 401


def test_accept_suggestion_without_suggestion_returns_409(
    admin_client: TestClient, db_session: Session
) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)

    accept_response = admin_client.post(f"/teams/{team.id}/games/{game.id}/suggestion/accept")
    reject_response = admin_client.post(f"/teams/{team.id}/games/{game.id}/suggestion/reject")

    assert accept_response.status_code == 409
    assert reject_response.status_code == 409


def test_patch_while_suggestion_pending_clears_it(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.is_manually_overridden = True
    game.team_score = 12
    game.scrape_suggestion = {"team_score": 90}
    game.scrape_suggestion_dismissed = False
    db_session.commit()

    response = admin_client.patch(
        f"/teams/{team.id}/games/{game.id}", json=_game_payload(is_home=False)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scrape_suggestion"] is None

    db_session.refresh(game)
    assert game.scrape_suggestion is None
    assert game.scrape_suggestion_dismissed is False

    accept_response = admin_client.post(f"/teams/{team.id}/games/{game.id}/suggestion/accept")
    assert accept_response.status_code == 409


def _patch_stats_url(admin_client: TestClient, game: Game, value: object):
    return admin_client.patch(f"/teams/{game.team_id}/games/{game.id}", json={"stats_url": value})


def test_patch_stats_url_null_unlinks_without_override(admin_client: TestClient, db_session: Session) -> None:
    game = _make_game(db_session, _make_team(db_session))
    game.stats_url = "https://docs.google.com/spreadsheets/d/X"
    db_session.commit()

    r = _patch_stats_url(admin_client, game, None)

    assert r.status_code == 200
    assert r.json()["stats_url"] is None
    db_session.refresh(game)
    assert game.stats_url is None
    assert game.is_manually_overridden is False


def test_patch_stats_url_expands_bare_sheet_id(admin_client: TestClient, db_session: Session) -> None:
    game = _make_game(db_session, _make_team(db_session))

    r = _patch_stats_url(admin_client, game, "abc_123")

    assert r.status_code == 200
    assert r.json()["stats_url"] == "https://docs.google.com/spreadsheets/d/abc_123"


@pytest.mark.parametrize(
    "bad",
    [
        "http://169.254.169.254/latest/meta-data",
        "http://db:5432",
        "https://evil.com/spreadsheets/d/X",
        "https://docs.google.com.evil.com/spreadsheets/d/X",
        "https://docs.google.com@evil.com/spreadsheets/d/X",
        "http://docs.google.com/spreadsheets/d/X",
        "https://docs.google.com/forms/d/X",
    ],
)
def test_patch_stats_url_rejects_non_google_hosts(admin_client: TestClient, db_session: Session, bad: str) -> None:
    game = _make_game(db_session, _make_team(db_session))

    r = _patch_stats_url(admin_client, game, bad)

    assert r.status_code == 422
    db_session.refresh(game)
    assert game.stats_url is None


def test_patch_stats_url_rejects_non_url(admin_client: TestClient, db_session: Session) -> None:
    game = _make_game(db_session, _make_team(db_session))

    r = _patch_stats_url(admin_client, game, "not a url")

    assert r.status_code == 422
    db_session.refresh(game)
    assert game.stats_url is None


def test_patch_stats_url_keeps_gid(admin_client: TestClient, db_session: Session) -> None:
    game = _make_game(db_session, _make_team(db_session))
    url = "https://docs.google.com/spreadsheets/d/X/edit?gid=123#gid=123"

    r = _patch_stats_url(admin_client, game, url)

    assert r.json()["stats_url"] == url
    assert bbstats.to_csv_url(url).endswith("&gid=123")


@pytest.mark.parametrize("field", ["opponent_name", "scheduled_at", "is_home", "status"])
def test_patch_game_null_required_field_rejected(
    admin_client: TestClient, db_session: Session, field: str
) -> None:
    game = _make_game(db_session, _make_team(db_session))

    response = admin_client.patch(f"/teams/{game.team_id}/games/{game.id}", json={field: None})
    assert response.status_code == 422

    db_session.expire_all()
    assert db_session.get(Game, game.id).is_manually_overridden is False


@pytest.mark.parametrize("name", ["", "   "])
def test_create_game_blank_opponent_name_rejected(
    admin_client: TestClient, db_session: Session, name: str
) -> None:
    team = _make_team(db_session)

    response = admin_client.post(f"/teams/{team.id}/games", json=_game_payload(opponent_name=name))
    assert response.status_code == 422
    assert db_session.query(Opponent).count() == 0


def test_get_game_needing_review_is_hidden_from_public(
    admin_client: TestClient, db_session: Session
) -> None:
    game = _make_game(db_session, _make_team(db_session))
    game.needs_review = True
    db_session.commit()
    url = f"/teams/{game.team_id}/games/{game.id}"

    assert admin_client.get(url).status_code == 200
    assert TestClient(app).get(url).status_code == 404


def test_club_games_returns_window_across_teams(client: TestClient, db_session: Session) -> None:
    team_a = _make_team(db_session, "Gush Ball A")
    team_b = _make_team(db_session, "Gush Ball B")
    times = {
        "before": datetime(2026, 3, 9, 23, 59),
        "from": datetime(2026, 3, 10, 0, 0),
        "to": datetime(2026, 3, 17, 23, 0),
        "after": datetime(2026, 3, 18, 0, 0),
    }
    games = {}
    for key, team in (("before", team_a), ("from", team_a), ("to", team_b), ("after", team_b)):
        games[key] = _make_game(db_session, team)
        games[key].scheduled_at = times[key]
        games[key].stats_url = "https://docs.google.com/spreadsheets/d/secret"
    db_session.commit()

    response = client.get("/games", params={"from": "2026-03-10", "to": "2026-03-17"})

    assert response.status_code == 200
    body = response.json()
    assert {g["id"] for g in body} == {games["from"].id, games["to"].id}
    assert {g["team_id"] for g in body} == {team_a.id, team_b.id}
    for row in body:
        assert row["stats_url"] is None
        assert "needs_review" not in row
        assert "is_scraped" not in row


def test_club_games_skips_review_pending(client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    game.scheduled_at = datetime(2026, 3, 12, 18, 0)
    game.needs_review = True
    db_session.commit()

    response = client.get("/games", params={"from": "2026-03-10", "to": "2026-03-17"})

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-03-10", "to": "9999-12-31"},
        {"from": "2026-03-17", "to": "2026-03-10"},
        {"from": "2026-01-01", "to": "2026-03-10"},
    ],
)
def test_club_games_rejects_bad_range(client: TestClient, params: dict[str, str]) -> None:
    response = client.get("/games", params=params)

    assert response.status_code == 422
    assert params["from"] in response.json()["detail"]
    assert params["to"] in response.json()["detail"]


def _make_player(db_session: Session, team: Team, name: str, jersey: int | None = None) -> Player:
    player = Player(team=team, name=name, jersey_number=jersey)
    db_session.add(player)
    db_session.commit()
    return player


def test_put_scorers_replaces_list_and_get_game_returns_them_sorted(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    p1 = _make_player(db_session, team, "Alef", 7)
    p2 = _make_player(db_session, team, "Bet", 9)
    url = f"/teams/{team.id}/games/{game.id}"
    assert admin_client.get(url).json()["scorers"] == []

    put = admin_client.put(f"{url}/scorers", json=[{"player_id": p1.id, "points": 10}, {"player_id": p2.id, "points": 22}])

    assert put.status_code == 200
    expected = [
        {"player_id": p2.id, "name": "Bet", "jersey_number": 9, "points": 22},
        {"player_id": p1.id, "name": "Alef", "jersey_number": 7, "points": 10},
    ]
    assert put.json() == expected
    assert admin_client.get(url).json()["scorers"] == expected

    # re-saving the same player must not collide with the unique constraint
    again = admin_client.put(f"{url}/scorers", json=[{"player_id": p1.id, "points": 5}])
    assert again.status_code == 200
    assert [(s["player_id"], s["points"]) for s in again.json()] == [(p1.id, 5)]


def test_put_scorers_does_not_flag_manual_override(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    player = _make_player(db_session, team, "Alef")

    admin_client.put(f"/teams/{team.id}/games/{game.id}/scorers", json=[{"player_id": player.id, "points": 2}])

    db_session.refresh(game)
    assert game.is_manually_overridden is False


def test_put_scorers_rejects_player_from_another_team(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    stranger = _make_player(db_session, _make_team(db_session, "Other Team"), "Stranger")

    response = admin_client.put(
        f"/teams/{team.id}/games/{game.id}/scorers", json=[{"player_id": stranger.id, "points": 2}]
    )

    assert response.status_code == 422
    assert str(stranger.id) in response.json()["detail"]


def test_put_scorers_rejects_duplicate_player_and_negative_points(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    player = _make_player(db_session, team, "Alef")
    url = f"/teams/{team.id}/games/{game.id}/scorers"

    dup = admin_client.put(url, json=[{"player_id": player.id, "points": 2}, {"player_id": player.id, "points": 3}])
    negative = admin_client.put(url, json=[{"player_id": player.id, "points": -1}])

    assert dup.status_code == 422
    assert negative.status_code == 422


def test_put_scorers_scope(
    client: TestClient, team_admin_client: TestClient, own_team: Team, other_team: Team, db_session: Session
) -> None:
    own_game = _make_game(db_session, own_team)
    other_game = _make_game(db_session, other_team)
    player = _make_player(db_session, own_team, "Alef")
    body = [{"player_id": player.id, "points": 4}]

    assert team_admin_client.put(f"/teams/{other_team.id}/games/{other_game.id}/scorers", json=[]).status_code == 403
    assert team_admin_client.put(f"/teams/{own_team.id}/games/{own_game.id}/scorers", json=body).status_code == 200
    client.post("/auth/logout")
    assert client.put(f"/teams/{own_team.id}/games/{own_game.id}/scorers", json=body).status_code == 401


def test_delete_game_deletes_its_scorers(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    player = _make_player(db_session, team, "Alef")
    admin_client.put(f"/teams/{team.id}/games/{game.id}/scorers", json=[{"player_id": player.id, "points": 2}])

    assert admin_client.delete(f"/teams/{team.id}/games/{game.id}").status_code == 204

    assert db_session.scalars(select(GameScorer)).all() == []


def test_put_media_replaces_lists_and_get_game_returns_them(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    url = f"/teams/{team.id}/games/{game.id}"
    body = {
        "videos": [
            {"url": "https://www.youtube.com/watch?v=abc", "title": "Highlights"},
            {"url": "https://veo.co/m/1", "title": "Full game", "title_en": "Full"},
        ],
        "images": [{"url": "https://cdn.example.com/a.jpg"}],
    }
    expected = {
        "videos": [
            {"url": "https://www.youtube.com/watch?v=abc", "title": "Highlights", "title_en": None},
            {"url": "https://veo.co/m/1", "title": "Full game", "title_en": "Full"},
        ],
        "images": [{"url": "https://cdn.example.com/a.jpg", "title": None, "title_en": None}],
    }

    put = admin_client.put(f"{url}/media", json=body)

    assert put.status_code == 200
    assert put.json() == expected
    detail = admin_client.get(url).json()
    assert (detail["videos"], detail["images"]) == (expected["videos"], expected["images"])

    again = admin_client.put(f"{url}/media", json={"images": []})
    assert again.json() == {"videos": [], "images": []}


def test_put_media_does_not_flag_manual_override(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    before = game.needs_review

    admin_client.put(
        f"/teams/{team.id}/games/{game.id}/media", json={"images": [{"url": "https://cdn.example.com/a.jpg"}]}
    )

    db_session.refresh(game)
    assert game.is_manually_overridden is False
    assert game.needs_review == before


def test_put_media_rejects_bad_url_and_missing_video_title(admin_client: TestClient, db_session: Session) -> None:
    team = _make_team(db_session)
    game = _make_game(db_session, team)
    url = f"/teams/{team.id}/games/{game.id}/media"
    image = {"url": "https://cdn.example.com/a.jpg"}

    bad_url = admin_client.put(url, json={"videos": [{"url": "javascript:alert(1)", "title": "x"}]})
    no_title = admin_client.put(url, json={"videos": [{"url": "https://veo.co/m/1", "title": ""}]})
    too_many = admin_client.put(url, json={"images": [image] * 21})

    assert (bad_url.status_code, no_title.status_code, too_many.status_code) == (422, 422, 422)


def test_put_media_scope(
    client: TestClient, team_admin_client: TestClient, own_team: Team, other_team: Team, db_session: Session
) -> None:
    own_game = _make_game(db_session, own_team)
    other_game = _make_game(db_session, other_team)

    assert team_admin_client.put(f"/teams/{other_team.id}/games/{other_game.id}/media", json={}).status_code == 403
    assert team_admin_client.put(f"/teams/{own_team.id}/games/{own_game.id}/media", json={}).status_code == 200
    client.post("/auth/logout")
    assert client.put(f"/teams/{own_team.id}/games/{own_game.id}/media", json={}).status_code == 401
