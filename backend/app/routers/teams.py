import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import AnyUrl, BaseModel, StringConstraints, UrlConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Team

router = APIRouter(prefix="/teams", tags=["teams"])

DbSession = Annotated[Session, Depends(get_db)]
AdminId = Annotated[int, Depends(require_admin)]

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
# Match the backing DB column widths (see app/models/team.py) so an oversized
# value is a clean 422 instead of a raw DB error.
Name = Annotated[str, StringConstraints(max_length=120)]
Address = Annotated[str, StringConstraints(max_length=300)]
Url500 = Annotated[AnyUrl, UrlConstraints(max_length=500)]


class _TeamFields(BaseModel):
    name: Name | None = None
    name_en: Name | None = None
    primary_color: HexColor | None = None
    secondary_color: HexColor | None = None
    logo_url: Url500 | None = None
    home_court_address: Address | None = None
    facebook_url: Url500 | None = None
    instagram_url: Url500 | None = None
    youtube_url: Url500 | None = None
    tiktok_url: Url500 | None = None
    twitter_url: Url500 | None = None
    ibasketball_team_url: Url500 | None = None
    ibasketball_league_url: Url500 | None = None


class TeamCreate(_TeamFields):
    name: Name  # required on create, unlike every other field


class TeamUpdate(_TeamFields):
    pass


class TeamOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    name_en: str | None
    slug: str
    primary_color: str | None
    secondary_color: str | None
    logo_url: str | None
    home_court_address: str | None
    facebook_url: str | None
    instagram_url: str | None
    youtube_url: str | None
    tiktok_url: str | None
    twitter_url: str | None
    ibasketball_team_url: str | None
    ibasketball_league_url: str | None


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "team"


def _unique_slug(db: Session, base: str) -> str:
    slug = base
    suffix = 1
    while db.scalar(select(Team).where(Team.slug == slug)) is not None:
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


def _stringify_urls(data: dict) -> dict:
    """Pydantic's AnyUrl doesn't map to SQLAlchemy's String column; store as plain str."""
    return {k: (str(v) if isinstance(v, AnyUrl) else v) for k, v in data.items()}


def _get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TeamOut)
def create_team(payload: TeamCreate, _admin_id: AdminId, db: DbSession) -> Team:
    data = _stringify_urls(payload.model_dump())
    team = Team(**data, slug=_unique_slug(db, _slugify(payload.name)))
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.get("", response_model=list[TeamOut])
def list_teams(db: DbSession) -> list[Team]:
    return list(db.scalars(select(Team)).all())


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: DbSession) -> Team:
    return _get_team_or_404(db, team_id)


@router.patch("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, payload: TeamUpdate, _admin_id: AdminId, db: DbSession) -> Team:
    team = _get_team_or_404(db, team_id)
    updates = _stringify_urls(payload.model_dump(exclude_unset=True))
    for field, value in updates.items():
        setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(team_id: int, _admin_id: AdminId, db: DbSession) -> Response:
    team = _get_team_or_404(db, team_id)
    db.delete(team)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
