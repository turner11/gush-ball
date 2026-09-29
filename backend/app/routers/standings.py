from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import DbSession, RequireAdmin
from app.models import StandingRow

router = APIRouter(prefix="/standings", tags=["standings"])

# Match the backing DB column widths (see app/models/standing_row.py).
Name = Annotated[str, StringConstraints(max_length=120)]
NonNegativeInt = Annotated[int, Field(ge=0)]


class StandingRowCreate(BaseModel):
    league_name: Name
    team_name: Name
    rank: NonNegativeInt
    played: NonNegativeInt
    won: NonNegativeInt
    lost: NonNegativeInt
    points_for: NonNegativeInt
    points_against: NonNegativeInt
    points: NonNegativeInt


class StandingRowUpdate(BaseModel):
    league_name: Name | None = None
    team_name: Name | None = None
    rank: NonNegativeInt | None = None
    played: NonNegativeInt | None = None
    won: NonNegativeInt | None = None
    lost: NonNegativeInt | None = None
    points_for: NonNegativeInt | None = None
    points_against: NonNegativeInt | None = None
    points: NonNegativeInt | None = None


class StandingRowOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    league_name: str
    team_name: str
    rank: int
    played: int
    won: int
    lost: int
    points_for: int
    points_against: int
    points: int
    source_url: str | None = None


def _get_row_or_404(db: Session, row_id: int) -> StandingRow:
    row = db.get(StandingRow, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Standing row not found")
    return row


def _find_by_key(db: Session, league_name: str, team_name: str) -> StandingRow | None:
    return db.scalar(
        select(StandingRow).where(
            StandingRow.league_name == league_name, StandingRow.team_name == team_name
        )
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=StandingRowOut)
def create_standing_row(payload: StandingRowCreate, _admin_id: RequireAdmin, db: DbSession) -> StandingRow:
    if _find_by_key(db, payload.league_name, payload.team_name) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A standing row for this league and team already exists",
        )
    row = StandingRow(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[StandingRowOut])
def list_standing_rows(db: DbSession, league_name: str | None = None) -> list[StandingRow]:
    query = select(StandingRow)
    if league_name is not None:
        query = query.where(StandingRow.league_name == league_name)
    query = query.order_by(StandingRow.league_name, StandingRow.rank)
    return list(db.scalars(query).all())


@router.get("/{row_id}", response_model=StandingRowOut)
def get_standing_row(row_id: int, db: DbSession) -> StandingRow:
    return _get_row_or_404(db, row_id)


@router.patch("/{row_id}", response_model=StandingRowOut)
def update_standing_row(
    row_id: int, payload: StandingRowUpdate, _admin_id: RequireAdmin, db: DbSession
) -> StandingRow:
    row = _get_row_or_404(db, row_id)
    updates = payload.model_dump(exclude_unset=True)

    new_league_name = updates.get("league_name", row.league_name)
    new_team_name = updates.get("team_name", row.team_name)
    if (new_league_name, new_team_name) != (row.league_name, row.team_name):
        existing = _find_by_key(db, new_league_name, new_team_name)
        if existing is not None and existing.id != row.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A standing row for this league and team already exists",
            )

    for field, value in updates.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_standing_row(row_id: int, _admin_id: RequireAdmin, db: DbSession) -> None:
    row = _get_row_or_404(db, row_id)
    db.delete(row)
    db.commit()
