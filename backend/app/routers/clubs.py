from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin, RequireAnyAdmin, check_club_scope
from app.models import Club
from app.routers.teams import About, ClubName, IbasketballUrl, Name, TitledImage, Url500

router = APIRouter(prefix="/clubs", tags=["clubs"])


AboutTitle = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class ClubAboutLink(BaseModel):
    label: ClubName
    label_en: Name | None = None
    url: Url500


class ClubOfficial(BaseModel):
    name: ClubName
    position: ClubName
    image_url: Url500 | None = None
    about: About | None = None


class ClubOut(BaseModel):
    # ponytail: about rides on the list; split to GET /clubs/{id} if the list payload grows
    id: int
    name: str
    name_en: str | None
    ibasketball_url: str | None
    about_title: str | None
    about_title_en: str | None
    about: str | None
    about_en: str | None
    about_images: list[TitledImage]
    about_links: list[ClubAboutLink]
    officials: list[ClubOfficial]

    model_config = {"from_attributes": True}


class ClubUpdate(BaseModel):
    name: ClubName = None  # omitted = unchanged; null -> 422 (NOT NULL column)
    name_en: Name | None = None
    ibasketball_url: IbasketballUrl | None = None


class ClubAboutUpdate(BaseModel):
    """The whole about block: an omitted field resets to empty."""

    about_title: AboutTitle | None = None
    about_title_en: AboutTitle | None = None
    about: About | None = None
    about_en: About | None = None
    about_images: list[TitledImage] = Field(default=[], max_length=20)
    about_links: list[ClubAboutLink] = Field(default=[], max_length=20)
    officials: list[ClubOfficial] = Field(default=[], max_length=50)


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


@router.put("/{club_id}/about", response_model=ClubOut)
def update_club_about(club_id: int, payload: ClubAboutUpdate, admin: RequireAnyAdmin, db: DbSession) -> Club:
    club = db.get(Club, club_id)
    if club is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Club {club_id} not found")
    check_club_scope(db, admin, club.name)
    for field, value in payload.model_dump(mode="json").items():  # json mode: HttpUrl -> str; lists are reassigned
        setattr(club, field, value)
    db.commit()
    return club
