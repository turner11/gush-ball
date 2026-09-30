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


def current_admin(request: Request, db: DbSession) -> AdminUser:
    """Dependency for admin routes. Raises 401 if no admin session exists."""
    admin_id = request.session.get("admin_id")
    admin = db.get(AdminUser, admin_id) if admin_id is not None else None
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        log.info("admin write admin_id=%s %s %s", admin_id, request.method, request.url.path)
    return admin


RequireAnyAdmin = Annotated[AdminUser, Depends(current_admin)]


def check_team_scope(admin: AdminUser, team_id: int) -> None:
    """The single place the team-scope rule lives: a team admin may only touch their own team."""
    if admin.team_id is not None and admin.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this team")


def require_admin(admin: RequireAnyAdmin) -> int:
    """Full admin only. Fail-closed default for every route not explicitly opened to team admins."""
    if admin.team_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Full admin required")
    return admin.id


RequireAdmin = Annotated[int, Depends(require_admin)]


def require_team_admin(team_id: int, admin: RequireAnyAdmin) -> int:
    """Full admin, or the admin of `team_id` (taken from the route's path param)."""
    check_team_scope(admin, team_id)
    return admin.id


RequireTeamAdmin = Annotated[int, Depends(require_team_admin)]


def get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team
