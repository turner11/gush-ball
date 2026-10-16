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
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import AfterValidator, BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import (
    DbSession,
    OptionalUser,
    RequireUser,
    admin_clubs,
    admin_team_ids,
    can_view_stats,
    check_not_last_full_admin,
    client_ip,
    is_admin,
    self_editable_player_ids,
)
from app.models import AdminUser, FavoriteTeam, Membership, Player, TeamRequest
from app.security import Email, Username, hash_password, password_fingerprint, verify_password

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


class SignupRequest(BaseModel):
    username: Username
    email: Email
    password: str = Field(min_length=8, max_length=128)


_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\ufeff"))


def _clean_name(name: str | None) -> str:
    """Zero-width characters dropped, whitespace collapsed: a name made only of them becomes empty."""
    return " ".join((name or "").translate(_ZERO_WIDTH).split())


def _non_empty(value: str) -> str:
    if not value:
        raise ValueError("display_name is empty after removing zero-width characters")
    return value


class UpdateMeRequest(BaseModel):
    display_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
        AfterValidator(lambda v: _non_empty(_clean_name(v))),
    ]


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(max_length=512)


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
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts"
            )
        for key in keys:
            _attempts.setdefault(key, []).append(now)


def _start_session(request: Request, admin: AdminUser) -> None:
    request.session["admin_id"] = admin.id
    request.session["pw"] = password_fingerprint(admin.password_hash)
    request.session["sv"] = admin.session_version


def _session_user(db: Session, user: AdminUser) -> dict[str, Any]:
    admin = is_admin(db, user)
    team_ids = admin_team_ids(db, user) if admin else []
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id).order_by(Membership.id))
    player_ids = self_editable_player_ids(db, user)
    out: dict[str, Any] = {
        "username": user.username,
        "display_name": user.display_name,
        "is_admin": admin,
        "can_view_stats": can_view_stats(db, user),
        # ponytail: the lone team only drives the UI's single-team shortcuts; team_ids is the real scope
        "team_id": team_ids[0] if team_ids is not None and len(team_ids) == 1 else None,
        "team_ids": team_ids,
        "clubs": admin_clubs(db, user),
        "player_ids": player_ids,
        "player_team_ids": sorted(set(db.scalars(select(Player.team_id).where(Player.id.in_(player_ids))))),
        "favorite_team_ids": list(
            db.scalars(select(FavoriteTeam.team_id).where(FavoriteTeam.user_id == user.id).order_by(FavoriteTeam.team_id))
        ),
        "memberships": [{"id": m.id, "team_id": m.team_id, "club": m.club, "role": m.role} for m in memberships],
        "team_requests": [
            {"id": r.id, "name": r.name, "status": r.status}
            for r in db.scalars(select(TeamRequest).where(TeamRequest.user_id == user.id).order_by(TeamRequest.id.desc()))
        ],
    }
    if admin:  # the live-stats links are admin-only, so fans and players never receive them
        out |= {"stats_app_url": settings.stats_url, "stats_template_url": settings.stats_template_url}
    return out


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: DbSession) -> dict[str, Any]:
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
    return _session_user(db, admin)


@router.post("/logout")
def logout(request: Request, user: OptionalUser, db: DbSession) -> dict[str, bool]:
    if user is not None:
        user.session_version += 1  # revokes copies of the cookie, not just this browser's
        db.commit()
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(user: RequireUser, db: DbSession) -> dict[str, Any]:
    return _session_user(db, user)


@router.patch("/me")
def update_me(payload: UpdateMeRequest, user: RequireUser, db: DbSession) -> dict[str, Any]:
    user.display_name = payload.display_name
    db.commit()
    return _session_user(db, user)


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, request: Request, user: RequireUser, db: DbSession) -> dict[str, bool]:
    _reserve_attempt([f"pw-change:{user.id}"])  # a stolen cookie must not brute-force the current password
    if not verify_password(payload.current_password, user.password_hash):
        # 400, not 401: apiFetch treats 401 as "logged out"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "הסיסמה הנוכחית שגויה")
    with _lock:
        _attempts.pop(f"pw-change:{user.id}", None)
    user.password_hash = hash_password(payload.new_password)
    user.session_version += 1  # revokes every other session
    db.commit()
    _start_session(request, user)  # this browser stays signed in
    log.info("password changed user_id=%s ip=%s", user.id, client_ip(request))
    return {"ok": True}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(request: Request, user: RequireUser, db: DbSession) -> None:
    check_not_last_full_admin(db, user)
    user_id = user.id
    db.delete(user)  # memberships cascade; players.user_id is SET NULL by the FK
    db.commit()
    request.session.clear()
    log.info("account deleted user_id=%s ip=%s", user_id, client_ip(request))


# ---- password reset ----

_reset_tokens = URLSafeTimedSerializer(settings.session_secret, salt="password-reset")
_RESET_MAX_AGE = 3600


def _require_email_delivery() -> None:
    """In prod (https) a reset/verify link must never fall back to the logs, so refuse before minting a token."""
    if not settings.smtp_host and settings.public_url.startswith("https://"):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "שליחת אימייל אינה מוגדרת")


def _send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        # Dev-only: the body (a live link) is logged only off https; prod drops it.
        if settings.public_url.startswith("https://"):
            log.warning("SMTP not configured, email dropped")
        else:
            log.warning("email to %s (SMTP not configured): %s", to, body)
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(body)
    # ponytail: STARTTLS (587) only; add SMTP_SSL if a provider needs 465
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _send_reset_email(to: str, link: str) -> None:
    _send_email(
        to,
        "איפוס סיסמה",
        f"לאיפוס הסיסמה היכנסו לקישור (תקף לשעה אחת):\n{link}\n\nאם לא ביקשתם לאפס את הסיסמה, התעלמו מהודעה זו.",
    )


def _send_verify_email(to: str, link: str) -> None:
    _send_email(
        to,
        "אימות כתובת אימייל",
        f"לאימות כתובת האימייל היכנסו לקישור (תקף לשעה אחת):\n{link}\n\nאם לא נרשמתם, התעלמו מהודעה זו.",
    )


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: DbSession, background: BackgroundTasks
) -> dict[str, bool]:
    _require_email_delivery()
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


# ---- password signup (the email is stored only once its emailed link is used) ----

# Own salt: a verify token can never be replayed at /reset-password, nor a reset token here.
_verify_tokens = URLSafeTimedSerializer(settings.session_secret, salt="verify-email")


@router.post("/signup")
def signup(
    payload: SignupRequest, request: Request, db: DbSession, background: BackgroundTasks
) -> dict[str, Any]:
    _require_email_delivery()
    ip = client_ip(request)
    _reserve_attempt([f"signup-ip:{ip}"])  # own prefix: signup spam never locks out login
    if db.scalar(select(AdminUser.id).where(AdminUser.username == payload.username)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "שם המשתמש כבר קיים")
    # ponytail: a same-instant duplicate username hits the unique index as a 500; catch IntegrityError if it matters
    user = AdminUser(username=payload.username, email=None, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    token = _verify_tokens.dumps([user.id, payload.email])
    background.add_task(_send_verify_email, payload.email, f"{settings.public_url}/admin/verify-email?token={token}")
    log.info("signup (password) user_id=%s ip=%s", user.id, ip)
    _start_session(request, user)
    return _session_user(db, user)


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, request: Request, db: DbSession, user: RequireUser) -> dict[str, bool]:
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    try:
        user_id, email = _verify_tokens.loads(payload.token, max_age=_RESET_MAX_AGE)
    except (BadSignature, TypeError, ValueError):
        raise invalid from None
    # Only the account that asked for the address may confirm it: a victim clicking an attacker's link must not bind their inbox.
    if user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong account")
    if user.email is not None:  # already verified: the link is single-use
        raise invalid
    # Revealing a taken address is fine here: the caller has proven they own the inbox.
    if db.scalar(select(AdminUser.id).where(AdminUser.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "האימייל כבר קיים")
    # ponytail: a same-instant duplicate hits the unique index as a 500, as in teams.create_team_admin
    user.email = email
    db.commit()
    log.info("email verified user_id=%s ip=%s", user.id, client_ip(request))
    return {"ok": True}


# ---- Google sign-in (OIDC code flow + PKCE; a verified email logs in its account, an unknown one signs up a rights-less player) ----

_GOOGLE_FAIL = "/admin/login?error=google"
_GOOGLE_POPUP_OK = "/admin/login?google_popup=ok"
_GOOGLE_POPUP_FAIL = "/admin/login?google_popup=error"


def _google_enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def _google_redirect_uri() -> str:
    # The path the browser sees: Caddy (and the dev vite proxy) strip /api.
    return f"{settings.public_url}/api/auth/google/callback"


def _google_identity(code: str, verifier: str) -> tuple[str, str | None] | None:
    """(verified lowercase email, display name or None) from the id_token, or None if anything is off."""
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
            name = claims.get("name")
            return claims["email"].lower(), name if isinstance(name, str) else None
    except (httpx.HTTPError, KeyError, IndexError, ValueError, AttributeError, TypeError):
        pass
    return None


@router.get("/options")
def options() -> dict[str, bool]:
    return {"google": _google_enabled()}


@router.get("/google/login")
def google_login(request: Request, popup: bool = False) -> RedirectResponse:
    if not _google_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    request.session["google_oauth"] = {"state": state, "verifier": verifier, "popup": popup}
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": _google_redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}", status.HTTP_302_FOUND)


_FALLBACK_USERNAME = "שחקן"
_USERNAME_MAX = 70
_DISPLAY_NAME_MAX = 64  # same cap as PATCH /auth/me


def _signup_username(db: Session, name: str | None) -> str:
    """The Google display name, never the email: admins see usernames. Numeric suffix when taken."""
    base = _clean_name(name)[:_USERNAME_MAX].rstrip()
    if not base or "@" in base:  # "@" in a username would make password login look it up as an email
        base = _FALLBACK_USERNAME
    candidate, n = base, 1
    while db.scalar(select(AdminUser.id).where(AdminUser.username == candidate)) is not None:
        n += 1
        candidate = f"{base} {n}"
    return candidate


@router.get("/google/callback")
def google_callback(
    request: Request, db: DbSession, code: str | None = None, state: str | None = None
) -> RedirectResponse:
    if not _google_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    saved = request.session.pop("google_oauth", None)  # pop: the state is single-use
    popup = bool(saved and saved.get("popup"))
    identity = None
    if saved and code and state and secrets.compare_digest(state.encode(), saved["state"].encode()):
        identity = _google_identity(code, saved["verifier"])
    # Fixed redirect targets, no next= parameter: nothing for an open redirect to hang on.
    if identity is None:
        log.warning("google login rejected (bad state or claims) ip=%s", client_ip(request))
        return RedirectResponse(_GOOGLE_POPUP_FAIL if popup else _GOOGLE_FAIL, status.HTTP_302_FOUND)
    email, name = identity
    user = db.scalar(select(AdminUser).where(AdminUser.email == email))
    if user is None:  # signup: no memberships, not a full admin, unusable password (a reset link can set one)
        username = _signup_username(db, name)
        # Same "@" rule as the username (an email-shaped name leaks the address); a duplicate name stays shared.
        display_name = _clean_name(name)[:_DISPLAY_NAME_MAX].rstrip()
        if not display_name or "@" in display_name:
            display_name = username
        user = AdminUser(
            username=username,
            display_name=display_name,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)
        db.commit()
        log.info("signup (google) user_id=%s ip=%s", user.id, client_ip(request))
    _start_session(request, user)
    log.info("login ok (google) user_id=%s ip=%s", user.id, client_ip(request))
    if popup:
        return RedirectResponse(_GOOGLE_POPUP_OK, status.HTTP_302_FOUND)
    return RedirectResponse("/admin" if is_admin(db, user) else "/join", status.HTTP_302_FOUND)
