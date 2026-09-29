import threading
import time

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin
from app.models import AdminUser
from app.security import hash_password, verify_password

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


def _client_ip(request: Request) -> str:
    # ponytail: XFF trusted only because the backend isn't publicly exposed (prod compose
    # publishes only `web`); Caddy overwrites the header, so the rightmost entry is the real peer.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


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
def login(payload: LoginRequest, request: Request, db: DbSession) -> dict[str, str]:
    keys = [f"ip:{_client_ip(request)}", f"user:{payload.username}"]
    _reserve_attempt(keys)
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    ok = verify_password(payload.password, admin.password_hash if admin else _DUMMY_HASH)
    if admin is None or not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    with _lock:
        for key in keys:
            _attempts.pop(key, None)
    request.session["admin_id"] = admin.id
    return {"username": admin.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(admin_id: RequireAdmin, db: DbSession) -> dict[str, str]:
    admin = db.get(AdminUser, admin_id)
    return {"username": admin.username}
