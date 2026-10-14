import logging

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin, check_not_last_full_admin
from app.models import AdminUser, Membership, Team

router = APIRouter(prefix="/users", tags=["users"])
log = logging.getLogger(__name__)


class UserMembershipOut(BaseModel):
    team_id: int | None
    team_name: str | None
    club: str | None
    role: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    email: str | None
    memberships: list[UserMembershipOut]


@router.get("", response_model=list[UserOut])
def list_users(_admin_id: RequireAdmin, db: DbSession) -> list[UserOut]:
    # ponytail: no server-side search/pagination; add ?q= when the list passes a few hundred
    users = db.execute(
        select(AdminUser.id, AdminUser.username, AdminUser.display_name, AdminUser.email).order_by(AdminUser.username)
    ).all()
    grants: dict[int, list[UserMembershipOut]] = {}
    rows = db.execute(
        select(Membership.user_id, Membership.team_id, Team.name, Membership.club, Membership.role)
        .outerjoin(Team, Team.id == Membership.team_id)
        .order_by(Membership.id)
    )
    for user_id, team_id, team_name, club, role in rows:
        grants.setdefault(user_id, []).append(UserMembershipOut(team_id=team_id, team_name=team_name, club=club, role=role))
    return [
        UserOut(id=i, username=u, display_name=d, email=e, memberships=grants.get(i, [])) for i, u, d, e in users
    ]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin_id: RequireAdmin, db: DbSession) -> Response:
    user = db.get(AdminUser, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User {user_id} not found")
    if user_id == admin_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "לא ניתן למחוק את החשבון שלך")
    check_not_last_full_admin(db, user)
    db.delete(user)
    db.commit()
    log.info("deleted user id=%s username=%s by admin_id=%s", user_id, user.username, admin_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
