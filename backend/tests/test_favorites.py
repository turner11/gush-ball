from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminUser, FavoriteTeam, Team
from app.security import hash_password


def _login_player(client: TestClient, db_session: Session, username: str) -> None:
    db_session.add(AdminUser(username=username, password_hash=hash_password("password123")))
    db_session.commit()
    assert client.post("/auth/login", json={"username": username, "password": "password123"}).status_code == 200


def _favorites(client: TestClient) -> list[int]:
    return client.get("/auth/me").json()["favorite_team_ids"]


def test_anonymous_cannot_favorite(client: TestClient, own_team: Team) -> None:
    assert client.put(f"/me/favorites/{own_team.id}").status_code == 401
    assert client.delete(f"/me/favorites/{own_team.id}").status_code == 401


def test_add_and_remove_are_idempotent(client: TestClient, db_session: Session, own_team: Team) -> None:
    _login_player(client, db_session, "fan")
    for _ in range(2):
        assert client.put(f"/me/favorites/{own_team.id}").status_code == 204
    assert _favorites(client) == [own_team.id]
    for _ in range(2):
        assert client.delete(f"/me/favorites/{own_team.id}").status_code == 204
    assert _favorites(client) == []


def test_user_sees_only_own_favorites(client: TestClient, db_session: Session, own_team: Team) -> None:
    _login_player(client, db_session, "a")
    assert client.put(f"/me/favorites/{own_team.id}").status_code == 204
    client.post("/auth/logout")
    _login_player(client, db_session, "b")
    assert _favorites(client) == []
    assert db_session.scalars(select(FavoriteTeam)).all() != []


def test_unknown_team_is_404_with_id(client: TestClient, db_session: Session) -> None:
    _login_player(client, db_session, "fan")
    response = client.put("/me/favorites/999")
    assert response.status_code == 404
    assert "999" in response.json()["detail"]


def test_favorite_fks_cascade() -> None:
    for column in FavoriteTeam.__table__.columns:
        assert {fk.ondelete for fk in column.foreign_keys} == {"CASCADE"}
