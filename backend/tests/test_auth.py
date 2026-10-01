import base64
import hashlib
import json
import logging
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
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
    db_session.add(
        AdminUser(username="admin", email="admin@example.com", password_hash=hash_password("password123"))
    )
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


def test_login_success_is_logged(seeded: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        seeded.post("/auth/login", json=GOOD, headers={"X-Forwarded-For": "3.3.3.3"})
    assert any("login ok" in r.getMessage() and "admin" in r.getMessage() and "3.3.3.3" in r.getMessage()
               for r in caplog.records)


def test_login_failure_is_logged(seeded: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        seeded.post("/auth/login", json=_bad(), headers={"X-Forwarded-For": "4.4.4.4"})
    recs = [r for r in caplog.records if "login failed" in r.getMessage()]
    assert recs and recs[0].levelno == logging.WARNING
    assert "admin" in recs[0].getMessage() and "4.4.4.4" in recs[0].getMessage()
    assert "wrong" not in caplog.text


def test_admin_write_is_logged(admin_client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        admin_client.delete("/teams/999999?x=secret")
    msgs = [r.getMessage() for r in caplog.records if "admin write" in r.getMessage()]
    assert msgs and "DELETE" in msgs[0] and "/teams/999999" in msgs[0] and "secret" not in msgs[0]


def test_admin_read_not_logged(admin_client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        admin_client.get("/auth/me")
    assert "admin write" not in caplog.text


# ---- login by email ----


def test_login_by_email_is_case_insensitive(seeded: TestClient) -> None:
    r = seeded.post("/auth/login", json={"username": "Admin@Example.COM", "password": "password123"})
    assert r.status_code == 200


def test_login_email_case_variants_share_lockout(seeded: TestClient) -> None:
    variants = ["admin@example.com", "ADMIN@example.com", "Admin@Example.com", "admin@EXAMPLE.com", "ADMIN@EXAMPLE.COM"]
    for i, email in enumerate(variants[: auth._MAX_ATTEMPTS]):
        headers = {"X-Forwarded-For": f"7.7.7.{i}"}
        assert seeded.post("/auth/login", json={"username": email, "password": "x"}, headers=headers).status_code == 401
    good = {"username": "Admin@example.com", "password": "password123"}
    assert seeded.post("/auth/login", json=good, headers={"X-Forwarded-For": "7.7.7.99"}).status_code == 429


# ---- forgot / reset password ----


@pytest.fixture()
def sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(auth, "_send_reset_email", lambda to, link: calls.append((to, link)))
    return calls


def _token(sent: list[tuple[str, str]]) -> str:
    return parse_qs(urlparse(sent[-1][1]).query)["token"][0]


def _forgot(c: TestClient, email: str = "admin@example.com", ip: str = "5.5.5.5"):
    return c.post("/auth/forgot-password", json={"email": email}, headers={"X-Forwarded-For": ip})


def test_forgot_password_same_response_for_known_and_unknown_email(seeded: TestClient, sent) -> None:
    known = _forgot(seeded, "Admin@Example.com")
    unknown = _forgot(seeded, "nobody@example.com")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert [to for to, _ in sent] == ["admin@example.com"]


def test_forgot_password_is_rate_limited_without_touching_login(seeded: TestClient, sent) -> None:
    for i in range(auth._MAX_ATTEMPTS):
        assert _forgot(seeded, ip=f"6.6.6.{i}").status_code == 200
    assert _forgot(seeded, ip="6.6.6.200").status_code == 429
    assert seeded.post("/auth/login", json=GOOD, headers={"X-Forwarded-For": "6.6.6.0"}).status_code == 200


def test_reset_link_uses_public_url_not_host_header(seeded: TestClient, sent) -> None:
    seeded.post("/auth/forgot-password", json={"email": "admin@example.com"}, headers={"Host": "evil.example"})
    assert sent[0][1].startswith(f"{settings.public_url}/admin/reset-password?token=")


def test_reset_password_changes_password(seeded: TestClient, sent) -> None:
    _forgot(seeded)
    r = seeded.post("/auth/reset-password", json={"token": _token(sent), "password": "newpassword1"})
    assert r.status_code == 200
    assert seeded.post("/auth/login", json={"username": "admin", "password": "newpassword1"}).status_code == 200
    assert seeded.post("/auth/login", json=GOOD).status_code == 401


def test_reset_token_is_single_use(seeded: TestClient, sent) -> None:
    _forgot(seeded)
    body = {"token": _token(sent), "password": "newpassword1"}
    assert seeded.post("/auth/reset-password", json=body).status_code == 200
    assert seeded.post("/auth/reset-password", json=body).status_code == 400


def test_reset_token_expires_after_an_hour(seeded: TestClient, sent, monkeypatch: pytest.MonkeyPatch) -> None:
    from itsdangerous.timed import TimestampSigner

    _forgot(seeded)
    monkeypatch.setattr(TimestampSigner, "get_timestamp", lambda self: int(time.time()) + 3601)
    r = seeded.post("/auth/reset-password", json={"token": _token(sent), "password": "newpassword1"})
    assert r.status_code == 400


def test_reset_rejects_tampered_token(seeded: TestClient, sent) -> None:
    _forgot(seeded)
    r = seeded.post("/auth/reset-password", json={"token": _token(sent) + "x", "password": "newpassword1"})
    assert r.status_code == 400


def test_reset_rejects_short_password(seeded: TestClient, sent) -> None:
    _forgot(seeded)
    assert seeded.post("/auth/reset-password", json={"token": _token(sent), "password": "short"}).status_code == 422


def test_password_reset_logs_out_existing_sessions(seeded: TestClient, sent) -> None:
    assert seeded.post("/auth/login", json=GOOD).status_code == 200
    assert seeded.get("/auth/me").status_code == 200
    _forgot(seeded)
    assert seeded.post("/auth/reset-password", json={"token": _token(sent), "password": "newpassword1"}).status_code == 200
    assert seeded.get("/auth/me").status_code == 401


def test_reset_email_uses_starttls(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    bodies: list[str] = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            calls.append(f"connect {host}:{port}")

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            calls.append("starttls")

        def login(self, user, password):
            calls.append("login")

        def send_message(self, msg):
            calls.append("send")
            bodies.append(msg.get_content())

    monkeypatch.setattr(auth.settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(auth.smtplib, "SMTP", FakeSMTP)
    auth._send_reset_email("a@x", "link")
    assert calls.index("starttls") < calls.index("send")
    assert "link" in bodies[0]


# ---- Google ----


def _claims(**over) -> dict:
    return {
        "iss": "https://accounts.google.com",
        "aud": "cid",
        "exp": time.time() + 600,
        "email": "admin@example.com",
        "email_verified": True,
    } | over


@pytest.fixture()
def google(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(auth.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth.settings, "google_client_secret", "secret")
    state = {"claims": _claims(), "posted": [], "error": None}

    def fake_post(url, data=None, timeout=None):
        state["posted"].append(data)
        if state["error"]:
            raise state["error"]
        payload = base64.urlsafe_b64encode(json.dumps(state["claims"]).encode()).rstrip(b"=").decode()
        req = httpx.Request("POST", url)
        return httpx.Response(200, json={"id_token": f"h.{payload}.s"}, request=req)

    monkeypatch.setattr(auth.httpx, "post", fake_post)
    return state


def _start_google(c: TestClient) -> dict[str, list[str]]:
    r = c.get("/auth/google/login", follow_redirects=False)
    assert r.status_code == 302
    return parse_qs(urlparse(r.headers["location"]).query)


def _callback(c: TestClient, state: str, code: str = "code"):
    return c.get("/auth/google/callback", params={"code": code, "state": state}, follow_redirects=False)


FAIL = "/admin/login?error=google"


def test_google_disabled_without_config(seeded: TestClient) -> None:
    assert seeded.get("/auth/options").json() == {"google": False}
    assert seeded.get("/auth/google/login", follow_redirects=False).status_code == 404
    assert seeded.get("/auth/google/callback", follow_redirects=False).status_code == 404


def test_google_login_redirects_with_state_and_pkce(seeded: TestClient, google) -> None:
    assert seeded.get("/auth/options").json() == {"google": True}
    r = seeded.get("/auth/google/login", follow_redirects=False)
    assert r.status_code == 302
    assert urlparse(r.headers["location"]).netloc == "accounts.google.com"
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["state"] and q["code_challenge_method"] == ["S256"]
    assert q["scope"] == ["openid email"]
    assert q["redirect_uri"] == [settings.public_url + "/api/auth/google/callback"]


def test_google_callback_logs_in_allowlisted_admin(seeded: TestClient, google) -> None:
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == "/admin"
    assert seeded.get("/auth/me").status_code == 200
    verifier = google["posted"][0]["code_verifier"]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == q["code_challenge"][0]


def test_google_callback_rejects_bad_state(seeded: TestClient, google) -> None:
    q = _start_google(seeded)
    r = _callback(seeded, "wrong")
    assert r.status_code == 302 and r.headers["location"] == FAIL
    assert google["posted"] == []
    assert seeded.get("/auth/me").status_code == 401
    # state is single-use: the failed attempt consumed it, so the right state now fails too
    assert _callback(seeded, q["state"][0]).headers["location"] == FAIL
    # and a replay after a successful login fails
    q = _start_google(seeded)
    assert _callback(seeded, q["state"][0]).headers["location"] == "/admin"
    assert _callback(seeded, q["state"][0]).headers["location"] == FAIL


@pytest.mark.parametrize(
    "over",
    [
        {"email": "stranger@example.com"},
        {"email_verified": False},
        {"aud": "other"},
        {"iss": "https://evil.example"},
        {"exp": 1},
    ],
)
def test_google_callback_rejects_bad_claims(seeded: TestClient, google, over: dict) -> None:
    google["claims"] = _claims(**over)
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == FAIL
    assert seeded.get("/auth/me").status_code == 401


def test_google_callback_handles_token_endpoint_error(seeded: TestClient, google) -> None:
    google["error"] = httpx.ConnectError("boom")
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == FAIL
