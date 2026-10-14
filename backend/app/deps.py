import logging
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import Select, exists, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminUser, Game, Membership, Team
from app.security import password_fingerprint

DbSession = Annotated[Session, Depends(get_db)]

log = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    # ponytail: XFF trusted only because the backend isn't publicly exposed (prod compose
    # publishes only `web`); Caddy sets it to `{client_ip}`, the real client resolved through
    # `trusted_proxies` (the Coolify proxy), so the single rightmost entry is the client.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def optional_user(request: Request, db: DbSession) -> AdminUser | None:
    """The logged-in account (admin or not), or None for an anonymous visitor."""
    user_id = request.session.get("admin_id")
    user = db.get(AdminUser, user_id) if user_id is not None else None
    if (
        user is None
        or request.session.get("pw") != password_fingerprint(user.password_hash)
        or request.session.get("sv") != user.session_version
    ):
        return None
    return user


OptionalUser = Annotated[AdminUser | None, Depends(optional_user)]


def current_user(user: OptionalUser) -> AdminUser:
    """Any logged-in account, with or without admin rights. Raises 401 if no valid session exists."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


RequireUser = Annotated[AdminUser, Depends(current_user)]


def is_admin(db: Session, user: AdminUser) -> bool:
    if user.is_full_admin:
        return True
    return db.scalar(select(exists().where(Membership.user_id == user.id, Membership.role == "admin"))) is True


def current_admin(request: Request, user: RequireUser, db: DbSession) -> AdminUser:
    """Dependency for admin routes: a logged-in user holding an admin grant, else 403 (a player is not an admin)."""
    if not is_admin(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        log.info("admin write admin_id=%s %s %s", user.id, request.method, request.url.path)
    return user


RequireAnyAdmin = Annotated[AdminUser, Depends(current_admin)]


def _admin_club_names(user_id: int) -> Select:
    return select(Membership.club).where(
        Membership.user_id == user_id, Membership.role == "admin", Membership.club.is_not(None)
    )


def admin_clubs(db: Session, user: AdminUser) -> list[str]:
    return list(db.scalars(_admin_club_names(user.id)))


def admin_team_ids(db: Session, user: AdminUser) -> list[int] | None:
    """Team ids the user may write: None = every team (full admin), [] = none."""
    if user.is_full_admin:
        return None
    direct = select(Membership.team_id).where(
        Membership.user_id == user.id, Membership.role == "admin", Membership.team_id.is_not(None)
    )
    # NULL guards: `Team.club IN (...)` never matches a NULL club, and the subqueries drop NULL rows, so a
    # clubless team can't leak to club admins (the `club == None` trap from #242).
    club_teams = Team.club.in_(_admin_club_names(user.id))
    return list(db.scalars(select(Team.id).where(or_(Team.id.in_(direct), club_teams))))


def can_write_team(db: Session, user: AdminUser | None, team_id: int) -> bool:
    """The single place the scope rule lives: team admins touch their team, club admins their club's teams."""
    if user is None:
        return False
    scope = admin_team_ids(db, user)
    return scope is None or team_id in scope


def check_team_scope(db: Session, admin: AdminUser, team_id: int) -> None:
    if not can_write_team(db, admin, team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this team")


def check_admin_grant(db: Session, admin: AdminUser, team: Team, scope: Literal["team", "club"]) -> None:
    """Who may grant or revoke admin on `team`: a full admin always; a club admin only team-scope grants on
    teams of their own club. Never club grants, never outside the club."""
    if admin.is_full_admin:
        return
    if scope == "team" and team.club is not None and team.club in admin_clubs(db, admin):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to manage admins for this team")


def check_membership_scope(db: Session, admin: AdminUser, row: Membership) -> None:
    """Who may approve a request or remove a request/member: a team's by whoever may write that team, a club's by a full admin only."""
    if row.team_id is not None:
        check_team_scope(db, admin, row.team_id)
    elif not admin.is_full_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a full admin can manage club memberships")


def require_admin(admin: RequireAnyAdmin) -> int:
    """Full admin only. Fail-closed default for every route not explicitly opened to scoped admins."""
    if not admin.is_full_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Full admin required")
    return admin.id


RequireAdmin = Annotated[int, Depends(require_admin)]


def require_team_admin(team_id: int, admin: RequireAnyAdmin, db: DbSession) -> int:
    """Full admin, or an admin whose scope covers `team_id` (taken from the route's path param)."""
    check_team_scope(db, admin, team_id)
    return admin.id


RequireTeamAdmin = Annotated[int, Depends(require_team_admin)]


def can_view_stats(db: Session, user: AdminUser) -> bool:
    """Stats are for full admins and anyone holding an approved (member/admin) grant on any team or club (#249)."""
    if user.is_full_admin:
        return True
    approved = Membership.user_id == user.id, Membership.role.in_(("member", "admin"))
    return db.scalar(select(exists().where(*approved))) is True


def require_stats_viewer(user: RequireUser, db: DbSession) -> AdminUser:
    if not can_view_stats(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Stats are for approved members")
    return user


RequireStatsViewer = Annotated[AdminUser, Depends(require_stats_viewer)]


def get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def get_game_or_404(db: Session, team_id: int, game_id: int) -> Game:
    game = db.scalar(select(Game).where(Game.id == game_id, Game.team_id == team_id))
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game
