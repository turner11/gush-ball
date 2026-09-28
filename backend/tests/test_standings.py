from fastapi.testclient import TestClient


def _row(**overrides: object) -> dict:
    data = {
        "league_name": "Liga A",
        "team_name": "Team A",
        "rank": 1,
        "played": 10,
        "won": 8,
        "lost": 2,
        "points_for": 800,
        "points_against": 700,
        "points": 16,
    }
    data.update(overrides)
    return data


def _create_row(admin_client: TestClient, **overrides: object) -> dict:
    response = admin_client.post("/standings", json=_row(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_standing_row_requires_admin(client: TestClient) -> None:
    response = client.post("/standings", json=_row())
    assert response.status_code == 401


def test_create_standing_row_as_admin_creates_row(admin_client: TestClient) -> None:
    created = _create_row(admin_client)
    assert created["league_name"] == "Liga A"
    assert created["team_name"] == "Team A"
    assert created["rank"] == 1
    assert created["played"] == 10
    assert created["won"] == 8
    assert created["lost"] == 2
    assert created["points_for"] == 800
    assert created["points_against"] == 700
    assert created["points"] == 16


def test_create_duplicate_league_and_team_returns_409(admin_client: TestClient) -> None:
    _create_row(admin_client)
    response = admin_client.post("/standings", json=_row())
    assert response.status_code == 409


def test_list_standing_rows_is_public(admin_client: TestClient, client: TestClient) -> None:
    _create_row(admin_client)
    response = client.get("/standings")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_standing_rows_filters_by_league_name(admin_client: TestClient, client: TestClient) -> None:
    _create_row(admin_client, league_name="Liga A", team_name="Team A")
    _create_row(admin_client, league_name="Liga B", team_name="Team B")

    response = client.get("/standings", params={"league_name": "Liga A"})
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["league_name"] == "Liga A"


def test_list_standing_rows_ordered_by_rank(admin_client: TestClient, client: TestClient) -> None:
    _create_row(admin_client, league_name="Liga A", team_name="Team C", rank=3)
    _create_row(admin_client, league_name="Liga A", team_name="Team A", rank=1)
    _create_row(admin_client, league_name="Liga A", team_name="Team B", rank=2)

    response = client.get("/standings")
    assert response.status_code == 200
    ranks = [row["rank"] for row in response.json()]
    assert ranks == [1, 2, 3]


def test_get_standing_row_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get("/standings/999999")
    assert response.status_code == 404


def test_patch_standing_row_requires_admin(client: TestClient) -> None:
    # admin_client and client share one underlying TestClient (see conftest.py), so this
    # only checks the auth gate against a non-logged-in client, same as test_teams.py.
    response = client.patch("/standings/1", json={"won": 9})
    assert response.status_code == 401


def test_patch_standing_row_updates_fields(admin_client: TestClient) -> None:
    created = _create_row(admin_client)
    response = admin_client.patch(f"/standings/{created['id']}", json={"won": 9, "points": 18})
    assert response.status_code == 200
    updated = response.json()
    assert updated["won"] == 9
    assert updated["points"] == 18
    assert updated["lost"] == 2  # untouched fields keep their value


def test_patch_standing_row_to_duplicate_key_returns_409(admin_client: TestClient) -> None:
    first = _create_row(admin_client, league_name="Liga A", team_name="Team A")
    second = _create_row(admin_client, league_name="Liga A", team_name="Team B")

    response = admin_client.patch(
        f"/standings/{second['id']}", json={"team_name": first["team_name"]}
    )
    assert response.status_code == 409


def test_delete_standing_row_requires_admin(client: TestClient) -> None:
    response = client.delete("/standings/1")
    assert response.status_code == 401


def test_delete_standing_row_removes_it(admin_client: TestClient, client: TestClient) -> None:
    created = _create_row(admin_client)

    delete_response = admin_client.delete(f"/standings/{created['id']}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/standings/{created['id']}")
    assert get_response.status_code == 404
