import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AdminUser
from app.routers import auth
from app.security import hash_password, verify_password

GOOD = {"username": "admin", "password": "password123"}


def _bad(username: str = "admin") -> dict[str, str]:
    return {"username": username, "password": "wrong"}


@pytest.fixture(autouse=True)
def _clear_attempts():
    auth._attempts.clear()
    yield
    auth._attempts.clear()


@pytest.fixture()
def seeded(client: TestClient, db_session: Session) -> TestClient:
    db_session.add(AdminUser(username="admin", password_hash=hash_password("password123")))
    db_session.commit()
    return client


def test_login_locks_out_ip_after_max_failures(seeded: TestClient) -> None:
    for _ in range(auth._MAX_ATTEMPTS):
        assert seeded.post("/auth/login", json=_bad()).status_code == 401
    assert seeded.post("/auth/login", json=GOOD).status_code == 429


def test_login_lockout_is_per_ip(seeded: TestClient) -> None:
    h1 = {"X-Forwarded-For": "1.1.1.1"}
    for i in range(auth._MAX_ATTEMPTS):
        assert seeded.post("/auth/login", json=_bad(f"nobody{i}"), headers=h1).status_code == 401
    assert seeded.post("/auth/login", json=GOOD, headers=h1).status_code == 429
    assert seeded.post("/auth/login", json=GOOD, headers={"X-Forwarded-For": "2.2.2.2"}).status_code == 200


def test_login_lockout_is_per_username(seeded: TestClient) -> None:
    for i in range(auth._MAX_ATTEMPTS):
        headers = {"X-Forwarded-For": f"9.9.9.{i}"}
        assert seeded.post("/auth/login", json=_bad(), headers=headers).status_code == 401
    response = seeded.post("/auth/login", json=GOOD, headers={"X-Forwarded-For": "8.8.8.8"})
    assert response.status_code == 429


def test_login_lockout_expires_after_window(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    for _ in range(auth._MAX_ATTEMPTS):
        seeded.post("/auth/login", json=_bad())
    later = auth.time.monotonic() + auth._WINDOW_SECONDS + 1
    monkeypatch.setattr(auth.time, "monotonic", lambda: later)
    assert seeded.post("/auth/login", json=GOOD).status_code == 200


def test_successful_login_clears_failures(seeded: TestClient) -> None:
    for _ in range(auth._MAX_ATTEMPTS - 1):
        assert seeded.post("/auth/login", json=_bad()).status_code == 401
    assert seeded.post("/auth/login", json=GOOD).status_code == 200
    for _ in range(auth._MAX_ATTEMPTS - 1):
        assert seeded.post("/auth/login", json=_bad()).status_code == 401


def test_unknown_user_still_runs_bcrypt(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def spy(password: str, password_hash: str) -> bool:
        calls.append(password_hash)
        return verify_password(password, password_hash)

    monkeypatch.setattr(auth, "verify_password", spy)
    assert seeded.post("/auth/login", json=_bad("nobody")).status_code == 401
    assert calls == [auth._DUMMY_HASH]


def test_throttled_requests_with_new_usernames_do_not_grow_attempts(seeded: TestClient) -> None:
    for i in range(auth._MAX_ATTEMPTS + 20):
        seeded.post("/auth/login", json=_bad(f"spray{i}"))
    assert len(auth._attempts) == auth._MAX_ATTEMPTS + 1  # 1 ip key + one per admitted username


def test_deleted_admin_session_is_rejected(seeded: TestClient, db_session: Session) -> None:
    assert seeded.post("/auth/login", json=GOOD).status_code == 200
    db_session.delete(db_session.query(AdminUser).one())
    db_session.commit()
    assert seeded.get("/auth/me").status_code == 401
    assert seeded.post("/teams", json={"name": "Ghost"}).status_code == 401


def test_session_expires_after_max_age(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from itsdangerous.timed import TimestampSigner

    assert seeded.post("/auth/login", json=GOOD).status_code == 200
    assert seeded.get("/auth/me").status_code == 200
    monkeypatch.setattr(TimestampSigner, "get_timestamp", lambda self: int(time.time()) + 12 * 3600 + 1)
    assert seeded.get("/auth/me").status_code == 401
