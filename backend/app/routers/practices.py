from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select

from app.deps import DbSession, RequireTeamAdmin, RequireTeamMember, get_team_or_404
from app.models import Practice
from app.routers.calendar import ISRAEL

router = APIRouter(prefix="/teams/{team_id}/practices", tags=["practices"])

_MAX_SERIES_DAYS = 366  # caps the rows one request can create
Duration = Annotated[int, Field(ge=15, le=480)]
Location = Annotated[str | None, Field(max_length=300)]


class PracticeCreate(BaseModel):
    starts_at: datetime
    duration_minutes: Duration = 90
    location: Location = None
    notes: str | None = None
    cancelled: bool = False
    repeat_weekly_until: date | None = None


class PracticeUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL columns)
    starts_at: datetime = None
    duration_minutes: Duration = None
    location: Location = None
    notes: str | None = None
    cancelled: bool = None


class PracticeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    starts_at: datetime
    duration_minutes: int
    location: str | None
    notes: str | None
    cancelled: bool


def _practice_or_404(db: DbSession, team_id: int, practice_id: int) -> Practice:
    practice = db.get(Practice, practice_id)
    if practice is None or practice.team_id != team_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Practice {practice_id} not found")
    return practice


@router.get("", response_model=list[PracticeRead])
def list_practices(team_id: int, db: DbSession, _member: RequireTeamMember) -> list[Practice]:
    get_team_or_404(db, team_id)
    return list(db.scalars(select(Practice).where(Practice.team_id == team_id).order_by(Practice.starts_at)))


@router.post("", status_code=status.HTTP_201_CREATED, response_model=list[PracticeRead])
def create_practices(team_id: int, payload: PracticeCreate, db: DbSession, _admin_id: RequireTeamAdmin) -> list[Practice]:
    get_team_or_404(db, team_id)
    until = payload.repeat_weekly_until or payload.starts_at.date()
    if until < payload.starts_at.date() or (until - payload.starts_at.date()).days > _MAX_SERIES_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"repeat_weekly_until {until} must be on or after {payload.starts_at.date()} and within {_MAX_SERIES_DAYS} days",
        )
    fields = payload.model_dump(exclude={"starts_at", "repeat_weekly_until"})
    rows: list[Practice] = []
    at = payload.starts_at
    while at.date() <= until:  # naive wall-clock + 7 days keeps 18:00 at 18:00 across DST
        rows.append(Practice(team_id=team_id, starts_at=at, **fields))
        at += timedelta(days=7)
    db.add_all(rows)
    db.commit()
    return rows


@router.patch("/{practice_id}", response_model=PracticeRead)
def update_practice(
    team_id: int, practice_id: int, payload: PracticeUpdate, db: DbSession, _admin_id: RequireTeamAdmin
) -> Practice:
    practice = _practice_or_404(db, team_id, practice_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(practice, field, value)
    db.commit()
    return practice


# Declared before /{practice_id}, or "upcoming" is parsed as the int id and 422s.
@router.delete("/upcoming", status_code=status.HTTP_204_NO_CONTENT)
def delete_upcoming_practices(team_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> Response:
    now = datetime.now(ISRAEL).replace(tzinfo=None)
    db.execute(delete(Practice).where(Practice.team_id == team_id, Practice.starts_at >= now))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{practice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_practice(team_id: int, practice_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> Response:
    db.delete(_practice_or_404(db, team_id, practice_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
