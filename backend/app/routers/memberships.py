from typing import Self

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import exists, select

from app.deps import (
    DbSession,
    RequireAnyAdmin,
    RequireUser,
    admin_team_ids,
    check_membership_scope,
    get_team_or_404,
)
from app.models import AdminUser, Membership, Team

router = APIRouter(prefix="/memberships", tags=["memberships"])


class JoinIn(BaseModel):
    team_id: int | None = None
    club: str | None = Field(None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def exactly_one_scope(self) -> Self:
        if (self.team_id is None) == (self.club is None):
            raise ValueError("Send exactly one of team_id or club")
        return self


class MembershipOut(BaseModel):
    id: int
    team_id: int | None
    club: str | None
    role: str


class PendingOut(BaseModel):  # no email: approvers identify a player by name only
    id: int
    username: str
    team_id: int | None
    team_name: str | None
    club: str | None


@router.post("", status_code=status.HTTP_201_CREATED, response_model=MembershipOut)
def request_to_join(payload: JoinIn, user: RequireUser, db: DbSession) -> Membership:
    if payload.team_id is not None:
        get_team_or_404(db, payload.team_id)
    elif not db.scalar(select(exists().where(Team.club == payload.club))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    scope = (
        Membership.team_id == payload.team_id
        if payload.team_id is not None
        else Membership.club == payload.club
    )
    # ponytail: pre-check for a clean 409; a concurrent double-submit hits the unique constraint (500), harmless
    if db.scalar(select(Membership.id).where(Membership.user_id == user.id, scope)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "כבר קיימת בקשה או חברות")
    row = Membership(
        user_id=user.id, team_id=payload.team_id, club=payload.club, role="pending"
    )  # never from the body
    db.add(row)
    db.commit()
    return row


@router.get("", response_model=list[PendingOut])
def list_pending(admin: RequireAnyAdmin, db: DbSession) -> list[PendingOut]:
    query = (
        select(Membership.id, AdminUser.username, Membership.team_id, Team.name, Membership.club)
        .join(AdminUser, AdminUser.id == Membership.user_id)
        .outerjoin(Team, Team.id == Membership.team_id)
        .where(Membership.role == "pending")
        .order_by(Membership.id)
    )
    scope = admin_team_ids(db, admin)
    if scope is not None:  # club requests are excluded by construction: their team_id is NULL
        query = query.where(Membership.team_id.in_(scope))
    return [
        PendingOut(id=i, username=u, team_id=t, team_name=n, club=c)
        for i, u, t, n, c in db.execute(query)
    ]


def _pending_in_scope(db: DbSession, admin: AdminUser, membership_id: int) -> Membership:
    row = db.get(Membership, membership_id)
    if row is None or row.role != "pending":  # never touches member/admin grants
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Pending request {membership_id} not found")
    check_membership_scope(db, admin, row)
    return row


@router.post("/{membership_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve(membership_id: int, admin: RequireAnyAdmin, db: DbSession) -> Response:
    _pending_in_scope(db, admin, membership_id).role = "member"
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def reject(membership_id: int, admin: RequireAnyAdmin, db: DbSession) -> Response:
    db.delete(_pending_in_scope(db, admin, membership_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
