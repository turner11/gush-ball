import logging
import threading
import time

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DbSession, RequireAnyAdmin, client_ip
from app.models import AdminUser
from app.security import hash_password, verify_password

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str


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


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: DbSession) -> dict[str, str | int | None]:
    ip = client_ip(request)
    keys = [f"ip:{ip}", f"user:{payload.username}"]
    _reserve_attempt(keys)
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    ok = verify_password(payload.password, admin.password_hash if admin else _DUMMY_HASH)
    if admin is None or not ok:
        log.warning("login failed username=%r ip=%s", payload.username, ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    with _lock:
        for key in keys:
            _attempts.pop(key, None)
    log.info("login ok username=%r ip=%s", payload.username, ip)
    request.session["admin_id"] = admin.id
    return {"username": admin.username, "team_id": admin.team_id}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(admin: RequireAnyAdmin) -> dict[str, str | int | None]:
    return {"username": admin.username, "team_id": admin.team_id}
