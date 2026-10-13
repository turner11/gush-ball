import base64
import hashlib
import json
import logging
import ssl
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AdminUser, Membership, Team
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
        AdminUser(username="admin", email="admin@example.com", password_hash=hash_password("password123"), is_full_admin=True)
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

        def starttls(self, context=None):
            calls.append("starttls")
            assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname

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


def _start_google(c: TestClient, popup: bool = False) -> dict[str, list[str]]:
    r = c.get("/auth/google/login", params={"popup": "1"} if popup else None, follow_redirects=False)
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
    assert q["scope"] == ["openid email profile"]
    assert q["redirect_uri"] == [settings.public_url + "/api/auth/google/callback"]


def test_google_callback_logs_in_allowlisted_admin(seeded: TestClient, google) -> None:
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == "/admin"
    assert seeded.get("/auth/me").status_code == 200
    verifier = google["posted"][0]["code_verifier"]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == q["code_challenge"][0]


def test_google_popup_callback_lands_on_popup_page(seeded: TestClient, google) -> None:
    q = _start_google(seeded, popup=True)
    assert _callback(seeded, q["state"][0]).headers["location"] == "/admin/login?google_popup=ok"
    assert seeded.get("/auth/me").status_code == 200
    seeded.post("/auth/logout")
    google["claims"] = _claims(email="stranger@example.com", email_verified=False)
    q = _start_google(seeded, popup=True)
    assert _callback(seeded, q["state"][0]).headers["location"] == "/admin/login?google_popup=error"
    assert seeded.get("/auth/me").status_code == 401


def test_google_callback_keeps_team_scope(client: TestClient, db_session: Session, google) -> None:
    team = Team(name="T", slug="t")
    db_session.add(team)
    db_session.flush()
    user = AdminUser(username="tadmin", email="admin@example.com", password_hash=hash_password("x"))
    db_session.add(user)
    db_session.flush()
    db_session.add(Membership(user_id=user.id, team_id=team.id, role="admin"))
    db_session.commit()
    q = _start_google(client)
    assert _callback(client, q["state"][0]).headers["location"] == "/admin"
    assert client.get("/auth/me").json()["team_id"] == team.id


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
        {"email_verified": False},
        {"aud": "other"},
        {"iss": "https://evil.example"},
        {"exp": 1},
    ],
)
def test_google_callback_rejects_bad_claims(seeded: TestClient, google, db_session: Session, over: dict) -> None:
    google["claims"] = _claims(**over)
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == FAIL
    assert seeded.get("/auth/me").status_code == 401
    assert db_session.scalar(select(func.count(AdminUser.id))) == 1  # no account created


def test_google_callback_handles_token_endpoint_error(seeded: TestClient, google) -> None:
    google["error"] = httpx.ConnectError("boom")
    q = _start_google(seeded)
    r = _callback(seeded, q["state"][0])
    assert r.status_code == 302 and r.headers["location"] == FAIL


def test_login_and_me_return_stats_urls(seeded: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth.settings, "stats_url", "https://app.streamlit.app")
    monkeypatch.setattr(auth.settings, "stats_template_url", "https://docs.google.com/spreadsheets/d/T/edit")
    assert seeded.get("/auth/me").status_code == 401
    expected = {
        "stats_app_url": "https://app.streamlit.app",
        "stats_template_url": "https://docs.google.com/spreadsheets/d/T/edit",
    }

    login = seeded.post("/auth/login", json=GOOD).json()
    me = seeded.get("/auth/me").json()

    for body in (login, me):
        assert {k: body[k] for k in expected} == expected


def _signup(c: TestClient, google, **claims):
    google["claims"] = _claims(**claims)
    return _callback(c, _start_google(c)["state"][0])


def test_google_signup_creates_rightsless_account(client: TestClient, db_session: Session, google) -> None:
    r = _signup(client, google, email="New@Example.com", name="Dana Cohen")
    assert r.status_code == 302 and r.headers["location"] == "/join"
    user = db_session.scalar(select(AdminUser))
    assert user.email == "new@example.com" and user.is_full_admin is False
    assert db_session.scalar(select(func.count(Membership.id))) == 0
    me = client.get("/auth/me").json()
    assert me["is_admin"] is False and me["team_ids"] == [] and me["memberships"] == []
    assert "stats_app_url" not in me
    assert client.post("/uploads", files={"file": ("a.png", b"x", "image/png")}).status_code == 403
    client.post("/auth/logout")
    assert _signup(client, google, email="new@example.com", name="Dana Cohen").headers["location"] == "/join"
    assert db_session.scalar(select(func.count(AdminUser.id))) == 1


@pytest.mark.parametrize(
    ("name", "expected"),
    [("Dana Cohen", "Dana Cohen"), (None, "שחקן"), ("  ", "שחקן"), ("dana@example.com", "שחקן")],
)
def test_google_signup_username_is_never_the_email(
    client: TestClient, db_session: Session, google, name: str | None, expected: str
) -> None:
    _signup(client, google, email="dana@example.com", **({} if name is None else {"name": name}))
    assert db_session.scalar(select(AdminUser.username)) == expected


def test_google_signup_cut_name_has_no_trailing_space(client: TestClient, db_session: Session, google) -> None:
    _signup(client, google, email="a@example.com", name="x" * 69 + " y")  # the cut lands right after the space
    assert db_session.scalar(select(AdminUser.username)) == "x" * 69


def test_google_signup_long_name_is_capped_and_duplicates_get_a_suffix(
    client: TestClient, db_session: Session, google
) -> None:
    _signup(client, google, email="a@example.com", name="x" * 100)
    _signup(client, google, email="b@example.com", name="Dana Cohen")
    _signup(client, google, email="c@example.com", name="Dana  Cohen")
    names = list(db_session.scalars(select(AdminUser.username).order_by(AdminUser.id)))
    assert len(names[0]) <= 80
    assert names[1:] == ["Dana Cohen", "Dana Cohen 2"]
    assert all("@" not in n for n in names)


# ---- password signup ----


@pytest.fixture()
def verify_sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(auth, "_send_verify_email", lambda to, link: calls.append((to, link)))
    return calls


NEW = {"username": "dana", "email": "New@Example.com", "password": "password123"}


def _pw_signup(c: TestClient, ip: str = "6.6.6.6", **over):
    return c.post("/auth/signup", json=NEW | over, headers={"X-Forwarded-For": ip})


def test_password_signup_creates_rightsless_account_without_email(
    client: TestClient, db_session: Session, verify_sent
) -> None:
    r = _pw_signup(client)
    assert r.status_code == 200
    body = r.json()
    assert body["is_admin"] is False and body["memberships"] == [] and "stats_app_url" not in body
    user = db_session.scalar(select(AdminUser))
    assert user.email is None and user.is_full_admin is False
    assert db_session.scalar(select(func.count(Membership.id))) == 0
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/logout")
    assert client.post("/auth/login", json={"username": "dana", "password": "password123"}).status_code == 200


def test_password_signup_emails_verify_link_to_lowercased_address(client: TestClient, verify_sent) -> None:
    _pw_signup(client)
    assert len(verify_sent) == 1
    to, link = verify_sent[0]
    assert to == "new@example.com"
    assert link.startswith(f"{settings.public_url}/admin/verify-email?token=")


def test_unverified_signup_email_is_not_a_google_or_reset_key(
    client: TestClient, db_session: Session, verify_sent, sent, google
) -> None:
    _pw_signup(client, email="victim@example.com")
    client.post("/auth/logout")
    assert _forgot(client, "victim@example.com").status_code == 200
    assert sent == []
    r = _signup(client, google, email="victim@example.com", name="Other")
    assert r.headers["location"] == "/join"
    assert db_session.scalar(select(func.count(AdminUser.id))) == 2
    assert client.get("/auth/me").json()["username"] != "dana"


def test_verify_email_stores_email_once(client: TestClient, db_session: Session, verify_sent) -> None:
    _pw_signup(client)
    token = _token(verify_sent)
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    assert db_session.scalar(select(AdminUser.email)) == "new@example.com"
    client.post("/auth/logout")
    assert client.post("/auth/login", json={"username": "new@example.com", "password": "password123"}).status_code == 200
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 400
    # salt separation: a verify token is no reset token
    assert client.post("/auth/reset-password", json={"token": token, "password": "newpassword1"}).status_code == 400


def test_verify_email_rejects_expired_or_tampered_token(
    client: TestClient, verify_sent, monkeypatch: pytest.MonkeyPatch
) -> None:
    from itsdangerous.timed import TimestampSigner

    _pw_signup(client)
    token = _token(verify_sent)
    assert client.post("/auth/verify-email", json={"token": token + "x"}).status_code == 400
    monkeypatch.setattr(TimestampSigner, "get_timestamp", lambda self: int(time.time()) + 3601)
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 400


def test_verify_email_rejects_address_taken_meanwhile(seeded: TestClient, db_session: Session, verify_sent) -> None:
    assert _pw_signup(seeded, email="admin@example.com").status_code == 200
    token = _token(verify_sent)
    assert seeded.post("/auth/verify-email", json={"token": token}).status_code == 409
    assert db_session.scalar(select(AdminUser.email).where(AdminUser.username == "dana")) is None


@pytest.mark.parametrize(
    ("over", "status_code"),
    [
        ({"username": "a@b"}, 422),
        ({"username": "admin"}, 409),
        ({"password": "short"}, 422),
        ({"email": "nope"}, 422),
        ({"username": "  "}, 422),
    ],
)
def test_password_signup_validation(seeded: TestClient, db_session: Session, verify_sent, over, status_code) -> None:
    r = _pw_signup(seeded, **over)
    assert r.status_code == status_code
    if status_code == 409:
        assert r.json()["detail"] == "שם המשתמש כבר קיים"
    assert db_session.scalar(select(func.count(AdminUser.id))) == 1
    assert verify_sent == []


def test_password_signup_rate_limited_per_ip_without_touching_login(seeded: TestClient, verify_sent) -> None:
    for i in range(auth._MAX_ATTEMPTS):
        assert _pw_signup(seeded, username=f"u{i}").status_code == 200
    assert _pw_signup(seeded, username="late").status_code == 429
    assert seeded.post("/auth/login", json=GOOD, headers={"X-Forwarded-For": "6.6.6.6"}).status_code == 200


def _prod_without_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth.settings, "public_url", "https://example.org")
    monkeypatch.setattr(auth.settings, "smtp_host", "")


def test_forgot_password_503_in_prod_without_smtp(
    seeded: TestClient, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _prod_without_smtp(monkeypatch)
    caplog.set_level("WARNING", logger="app.routers.auth")
    assert _forgot(seeded).status_code == 503
    assert _forgot(seeded, "nobody@example.com").status_code == 503
    assert "token=" not in caplog.text


def test_signup_503_in_prod_without_smtp(
    client: TestClient, db_session: Session, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    _prod_without_smtp(monkeypatch)
    caplog.set_level("WARNING", logger="app.routers.auth")
    assert _pw_signup(client).status_code == 503
    assert db_session.scalars(select(AdminUser)).all() == []
    assert "token=" not in caplog.text


def test_forgot_password_sends_in_prod_with_smtp(seeded: TestClient, sent, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth.settings, "public_url", "https://example.org")
    monkeypatch.setattr(auth.settings, "smtp_host", "smtp.test")
    assert _forgot(seeded).status_code == 200
    assert len(sent) == 1
