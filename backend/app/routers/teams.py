import re
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import AfterValidator, AnyUrl, BaseModel, HttpUrl, StringConstraints, UrlConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import DbSession, RequireAdmin, RequireTeamAdmin, get_team_or_404
from app.models import AdminUser, Team
from app.security import hash_password

router = APIRouter(prefix="/teams", tags=["teams"])

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
# Match the backing DB column widths (see app/models/team.py) so an oversized
# value is a clean 422 instead of a raw DB error.
Name = Annotated[str, StringConstraints(max_length=120)]
Address = Annotated[str, StringConstraints(max_length=300)]
Background = Literal["hoop-1", "hoop-2"]  # bundled presets in frontend/public/backgrounds
Url500 = Annotated[HttpUrl, UrlConstraints(max_length=500)]


def _require_ibasketball(url: HttpUrl) -> HttpUrl:
    # The scraper fetches these server-side, so pin them to the real source (SSRF).
    if url.scheme != "https" or url.host not in {"ibasketball.co.il", "www.ibasketball.co.il"}:
        raise ValueError("must be an https://ibasketball.co.il URL")
    return url


IbasketballUrl = Annotated[Url500, AfterValidator(_require_ibasketball)]


class TeamUpdate(BaseModel):
    name: Name | None = None
    name_en: Name | None = None
    primary_color: HexColor | None = None
    secondary_color: HexColor | None = None
    logo_url: Url500 | None = None
    background: Background | None = None
    home_court_address: Address | None = None
    facebook_url: Url500 | None = None
    instagram_url: Url500 | None = None
    youtube_url: Url500 | None = None
    tiktok_url: Url500 | None = None
    twitter_url: Url500 | None = None
    ibasketball_team_url: IbasketballUrl | None = None
    ibasketball_league_url: IbasketballUrl | None = None


class TeamCreate(TeamUpdate):
    name: Name  # required on create, unlike every other field


class TeamOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    name_en: str | None
    slug: str
    primary_color: str | None
    secondary_color: str | None
    logo_url: str | None
    background: str
    home_court_address: str | None
    facebook_url: str | None
    instagram_url: str | None
    youtube_url: str | None
    tiktok_url: str | None
    twitter_url: str | None
    ibasketball_team_url: str | None
    ibasketball_league_url: str | None


class AdminCreate(BaseModel):
    username: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    password: Annotated[str, StringConstraints(min_length=8)]


class AdminOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    username: str


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


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TeamOut)
def create_team(payload: TeamCreate, _admin_id: RequireAdmin, db: DbSession) -> Team:
    data = _stringify_urls(payload.model_dump(exclude_none=True))
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
    return get_team_or_404(db, team_id)


@router.patch("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, payload: TeamUpdate, _admin_id: RequireTeamAdmin, db: DbSession) -> Team:
    team = get_team_or_404(db, team_id)
    updates = _stringify_urls(payload.model_dump(exclude_unset=True))
    if updates.get("background") is None:
        updates.pop("background", None)  # column is NOT NULL
    for field, value in updates.items():
        setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(team_id: int, _admin_id: RequireAdmin, db: DbSession) -> None:
    team = get_team_or_404(db, team_id)
    db.delete(team)
    db.commit()


@router.get("/{team_id}/admins", response_model=list[AdminOut])
def list_team_admins(team_id: int, _admin_id: RequireAdmin, db: DbSession) -> list[AdminUser]:
    get_team_or_404(db, team_id)
    return list(db.scalars(select(AdminUser).where(AdminUser.team_id == team_id).order_by(AdminUser.id)))


@router.post("/{team_id}/admins", status_code=status.HTTP_201_CREATED, response_model=AdminOut)
def create_team_admin(team_id: int, payload: AdminCreate, _admin_id: RequireAdmin, db: DbSession) -> AdminUser:
    get_team_or_404(db, team_id)
    if db.scalar(select(AdminUser).where(AdminUser.username == payload.username)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "שם המשתמש כבר קיים")
    # ponytail: a same-instant duplicate hits the unique index as a 500; catch IntegrityError if it ever matters
    admin = AdminUser(username=payload.username, password_hash=hash_password(payload.password), team_id=team_id)
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@router.delete("/{team_id}/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team_admin(team_id: int, admin_id: int, _admin_id: RequireAdmin, db: DbSession) -> None:
    # Filtering on team_id keeps full admins (team_id NULL) and other teams' admins unreachable.
    admin = db.scalar(select(AdminUser).where(AdminUser.id == admin_id, AdminUser.team_id == team_id))
    if admin is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    db.delete(admin)
    db.commit()
