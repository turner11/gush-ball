from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminUser, Team


DbSession = Annotated[Session, Depends(get_db)]


def require_admin(request: Request, db: DbSession) -> int:
    """Dependency for admin-only routes. Raises 401 if no admin session exists."""
    admin_id = request.session.get("admin_id")
    if admin_id is None or db.get(AdminUser, admin_id) is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return admin_id


RequireAdmin = Annotated[int, Depends(require_admin)]


def get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team
