import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminUser, Team

DbSession = Annotated[Session, Depends(get_db)]

log = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    # ponytail: XFF trusted only because the backend isn't publicly exposed (prod compose
    # publishes only `web`); Caddy overwrites the header, so the rightmost entry is the real peer.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def require_admin(request: Request, db: DbSession) -> int:
    """Dependency for admin-only routes. Raises 401 if no admin session exists."""
    admin_id = request.session.get("admin_id")
    if admin_id is None or db.get(AdminUser, admin_id) is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        log.info("admin write admin_id=%s %s %s", admin_id, request.method, request.url.path)
    return admin_id


RequireAdmin = Annotated[int, Depends(require_admin)]


def get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team
