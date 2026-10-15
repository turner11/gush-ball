from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin
from app.models import Club
from app.routers.teams import ClubName, IbasketballUrl

router = APIRouter(prefix="/clubs", tags=["clubs"])


class ClubOut(BaseModel):
    id: int
    name: str
    ibasketball_url: str | None

    model_config = {"from_attributes": True}


class ClubUpdate(BaseModel):
    name: ClubName | None = None
    ibasketball_url: IbasketballUrl | None = None


@router.get("", response_model=list[ClubOut])
def list_clubs(_admin_id: RequireAdmin, db: DbSession) -> list[Club]:
    return list(db.scalars(select(Club).order_by(Club.name)))


@router.patch("/{club_id}", response_model=ClubOut)
def update_club(club_id: int, payload: ClubUpdate, _admin_id: RequireAdmin, db: DbSession) -> Club:
    club = db.get(Club, club_id)
    if club is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Club {club_id} not found")
    updates = payload.model_dump(exclude_none=True)
    if "ibasketball_url" in updates:
        updates["ibasketball_url"] = str(updates["ibasketball_url"])
    for field, value in updates.items():
        taken = db.scalar(select(Club.id).where(getattr(Club, field) == value, Club.id != club_id))
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Club {field} {value!r} is already used by club {taken}")
        setattr(club, field, value)
    db.commit()
    return club
