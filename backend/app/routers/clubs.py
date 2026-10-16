from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin
from app.models import Club
from app.routers.teams import ClubName, IbasketballUrl, Name

router = APIRouter(prefix="/clubs", tags=["clubs"])


class ClubOut(BaseModel):
    id: int
    name: str
    name_en: str | None
    ibasketball_url: str | None

    model_config = {"from_attributes": True}


class ClubUpdate(BaseModel):
    name: ClubName = None  # omitted = unchanged; null -> 422 (NOT NULL column)
    name_en: Name | None = None
    ibasketball_url: IbasketballUrl | None = None


@router.get("", response_model=list[ClubOut])
def list_clubs(db: DbSession) -> list[Club]:
    return list(db.scalars(select(Club).order_by(Club.name)))


@router.patch("/{club_id}", response_model=ClubOut)
def update_club(club_id: int, payload: ClubUpdate, _admin_id: RequireAdmin, db: DbSession) -> Club:
    club = db.get(Club, club_id)
    if club is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Club {club_id} not found")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("ibasketball_url"):
        updates["ibasketball_url"] = str(updates["ibasketball_url"])
    for field, value in updates.items():
        # a null is never "taken": IS NULL would collide with every other club that has none
        taken = None if value is None else db.scalar(select(Club.id).where(getattr(Club, field) == value, Club.id != club_id))
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Club {field} {value!r} is already used by club {taken}")
        setattr(club, field, value)
    db.commit()
    return club
