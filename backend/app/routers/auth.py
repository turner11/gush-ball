import base64
import hashlib
import json
import logging
import secrets
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import settings
from app.deps import DbSession, RequireAnyAdmin, client_ip
from app.models import AdminUser
from app.security import hash_password, password_fingerprint, verify_password

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str = Field(max_length=254)  # username or email
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=512)
    password: str = Field(min_length=8, max_length=128)


# ponytail: in-memory, single-worker only, resets on restart; keys for never-revisited usernames
# aren't evicted, but only admitted requests create keys: <= _MAX_ATTEMPTS new usernames per IP
# per window (throttled requests store nothing), and usernames are length-capped. Move to Redis/DB if >1 worker.
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 15 * 60
_attempts: dict[str, list[float]] = {}
_lock = threading.Lock()  # login is a plain def -> real threadpool threads, unlike sync.py
# Same bcrypt cost as real hashes, so unknown usernames take as long as wrong passwords.
_DUMMY_HASH = hash_password("not-a-real-password")


def _reserve_attempt(keys: list[str]) -> None:
    """Raise 429 if any key is over the limit, else record an attempt on all keys."""
    now = time.monotonic()
    with _lock:
        for key in keys:
            recent = [t for t in _attempts.get(key, []) if now - t < _WINDOW_SECONDS]
            if recent:
                _attempts[key] = recent
            else:
                _attempts.pop(key, None)  # never store empty lists (throttled spray would leak)
        if any(len(_attempts.get(key, [])) >= _MAX_ATTEMPTS for key in keys):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts"
            )
        for key in keys:
            _attempts.setdefault(key, []).append(now)


def _start_session(request: Request, admin: AdminUser) -> None:
    request.session["admin_id"] = admin.id
    request.session["pw"] = password_fingerprint(admin.password_hash)


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: DbSession) -> dict[str, str | int | None]:
    ip = client_ip(request)
    ident = payload.username.strip()
    # An "@" means email (stored lowercase), otherwise username: keeps the lookup unambiguous.
    column, ident = (AdminUser.email, ident.lower()) if "@" in ident else (AdminUser.username, ident)
    keys = [f"ip:{ip}", f"user:{ident}"]
    _reserve_attempt(keys)
    admin = db.scalar(select(AdminUser).where(column == ident))
    ok = verify_password(payload.password, admin.password_hash if admin else _DUMMY_HASH)
    if admin is None or not ok:
        log.warning("login failed username=%r ip=%s", ident, ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    with _lock:
        for key in keys:
            _attempts.pop(key, None)
    log.info("login ok username=%r ip=%s", ident, ip)
    _start_session(request, admin)
    return {"username": admin.username, "team_id": admin.team_id}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(admin: RequireAnyAdmin) -> dict[str, str | int | None]:
    return {"username": admin.username, "team_id": admin.team_id}


# ---- password reset ----

_reset_tokens = URLSafeTimedSerializer(settings.session_secret, salt="password-reset")
_RESET_MAX_AGE = 3600


def _send_reset_email(to: str, link: str) -> None:
    if not settings.smtp_host:
        # Dev-only: no SMTP configured, so the link goes to the log (admin-only in prod).
        log.warning("password reset link for %s (SMTP not configured): %s", to, link)
        return
    msg = EmailMessage()
    msg["Subject"] = "איפוס סיסמה"
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(
        f"לאיפוס הסיסמה היכנסו לקישור (תקף לשעה אחת):\n{link}\n\nאם לא ביקשתם לאפס את הסיסמה, התעלמו מהודעה זו."
    )
    # ponytail: STARTTLS (587) only; add SMTP_SSL if a provider needs 465
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: DbSession, background: BackgroundTasks
) -> dict[str, bool]:
    ip = client_ip(request)
    email = payload.email.strip().lower()
    # Separate key prefixes: reset spam must never lock out logins.
    _reserve_attempt([f"reset-ip:{ip}", f"reset:{email}"])
    admin = db.scalar(select(AdminUser).where(AdminUser.email == email))
    if admin is not None:
        token = _reset_tokens.dumps([admin.id, password_fingerprint(admin.password_hash)])
        # Sent after the response so known and unknown emails take the same time.
        background.add_task(_send_reset_email, email, f"{settings.public_url}/admin/reset-password?token={token}")
    log.info("password reset requested ip=%s", ip)
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request, db: DbSession) -> dict[str, bool]:
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    try:
        admin_id, fingerprint = _reset_tokens.loads(payload.token, max_age=_RESET_MAX_AGE)
    except (BadSignature, TypeError, ValueError):
        raise invalid from None
    admin = db.get(AdminUser, admin_id)
    # The fingerprint changes with the password: that makes the token single-use.
    if admin is None or not secrets.compare_digest(str(fingerprint).encode(), password_fingerprint(admin.password_hash).encode()):
        raise invalid
    admin.password_hash = hash_password(payload.password)
    db.commit()
    log.info("password reset ok username=%r ip=%s", admin.username, client_ip(request))
    return {"ok": True}


# ---- Google sign-in (OIDC code flow + PKCE; logs in an existing admin by verified email, no signup) ----

_GOOGLE_FAIL = "/admin/login?error=google"


def _google_enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def _google_redirect_uri() -> str:
    # The path the browser sees: Caddy (and the dev vite proxy) strip /api.
    return f"{settings.public_url}/api/auth/google/callback"


def _google_verified_email(code: str, verifier: str) -> str | None:
    try:
        resp = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": _google_redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
            timeout=10,
        )
        resp.raise_for_status()
        segment = resp.json()["id_token"].split(".")[1]
        # ponytail: no JWKS signature check. The id_token comes straight from Google's token endpoint over
        # TLS, authenticated with our client secret (OIDC Core 3.1.3.7 step 6). Add one if it ever arrives
        # via the browser.
        claims = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))
        if (
            claims["iss"] in {"https://accounts.google.com", "accounts.google.com"}
            and claims["aud"] == settings.google_client_id
            and claims["exp"] > time.time()
            and claims["email_verified"] is True
        ):
            return claims["email"].lower()
    except (httpx.HTTPError, KeyError, IndexError, ValueError, AttributeError, TypeError):
        pass
    return None


@router.get("/options")
def options() -> dict[str, bool]:
    return {"google": _google_enabled()}


@router.get("/google/login")
def google_login(request: Request) -> RedirectResponse:
    if not _google_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    request.session["google_oauth"] = {"state": state, "verifier": verifier}
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": _google_redirect_uri(),
            "response_type": "code",
            "scope": "openid email",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}", status.HTTP_302_FOUND)


@router.get("/google/callback")
def google_callback(
    request: Request, db: DbSession, code: str | None = None, state: str | None = None
) -> RedirectResponse:
    if not _google_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    saved = request.session.pop("google_oauth", None)  # pop: the state is single-use
    email = None
    admin = None
    if saved and code and state and secrets.compare_digest(state.encode(), saved["state"].encode()):
        email = _google_verified_email(code, saved["verifier"])
        admin = db.scalar(select(AdminUser).where(AdminUser.email == email)) if email else None
    # Fixed redirect targets, no next= parameter: nothing for an open redirect to hang on.
    if admin is None:
        log.warning("google login rejected email=%r ip=%s", email, client_ip(request))
        return RedirectResponse(_GOOGLE_FAIL, status.HTTP_302_FOUND)
    _start_session(request, admin)
    log.info("login ok (google) username=%r ip=%s", admin.username, client_ip(request))
    return RedirectResponse("/admin", status.HTTP_302_FOUND)
