import logging
import re
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import AfterValidator, AnyUrl, BaseModel, HttpUrl, StringConstraints, UrlConstraints
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import scrape_club
from app.db import SessionLocal
from app.deps import (
    DbSession,
    RequireAdmin,
    RequireAnyAdmin,
    admin_clubs,
    check_admin_grant,
    check_team_scope,
    get_team_or_404,
)
from app.models import AdminUser, Membership, Team
from app.security import hash_password

router = APIRouter(prefix="/teams", tags=["teams"])
log = logging.getLogger(__name__)

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
# Match the backing DB column widths (see app/models/team.py) so an oversized
# value is a clean 422 instead of a raw DB error.
Name = Annotated[str, StringConstraints(max_length=120)]
ClubName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
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
    club: ClubName | None = None
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
    club: str | None
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


class ClubPreviewIn(BaseModel):
    club_url: IbasketballUrl


class ClubTeamOut(BaseModel):
    name: str
    ibasketball_team_url: str
    ibasketball_league_url: str | None
    league_name: str | None
    home_court_address: str | None
    logo_url: str | None


class ClubPreviewStatusOut(BaseModel):
    running: bool
    rows: list[ClubTeamOut] | None = None
    error: Literal["unreachable", "not_a_club", "failed"] | None = None


class AdminCreate(BaseModel):
    # no "@": login routes any identifier containing "@" to the email lookup
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[^@]+$")]
    password: Annotated[str, StringConstraints(min_length=8)]
    # lowercase: login, forgot-password and the Google callback all look emails up lowercase
    email: Annotated[
        str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")
    ] | None = None
    scope: Literal["team", "club"] = "team"


class AdminOut(BaseModel):
    id: int
    username: str
    email: str | None
    club: str | None  # set for a club-scope grant


class AssignIn(BaseModel):
    scope: Literal["team", "club"] = "team"


class AssignableUserOut(BaseModel):
    id: int
    username: str
    team_ids: list[int]  # teams they admin directly


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


# Same pattern as routers/sync.py: the scrape sleeps (crawl delay), so it runs in a BackgroundTask,
# guarded by a module-level flag (safe because club_preview is `async def` on one uvicorn worker).
# ponytail: in-memory single result, lost on restart; one scan at a time across admins.
_preview_running = False
_preview_last: dict | None = None


def _run_club_preview(club_url: str) -> None:
    global _preview_running, _preview_last
    try:
        with SessionLocal() as db:
            _preview_last = {"rows": scrape_club.preview_club_teams(db, club_url)}
    except httpx.HTTPError:
        log.exception("Club preview fetch failed: %s", club_url)
        _preview_last = {"error": "unreachable"}
    except ValueError:
        log.exception("No teams on club page: %s", club_url)
        _preview_last = {"error": "not_a_club"}
    except Exception:
        log.exception("Club preview crashed: %s", club_url)
        _preview_last = {"error": "failed"}
    finally:
        _preview_running = False


@router.post("/club-preview", status_code=status.HTTP_202_ACCEPTED)
async def club_preview(
    payload: ClubPreviewIn, _admin_id: RequireAdmin, background_tasks: BackgroundTasks
) -> dict[str, str]:
    global _preview_running, _preview_last
    if _preview_running:
        raise HTTPException(status.HTTP_409_CONFLICT, "Club preview already running")
    _preview_running = True
    _preview_last = None
    background_tasks.add_task(_run_club_preview, str(payload.club_url))
    return {"status": "started"}


@router.get("/club-preview/status", response_model=ClubPreviewStatusOut)
async def club_preview_status(_admin_id: RequireAdmin) -> ClubPreviewStatusOut:
    return ClubPreviewStatusOut(running=_preview_running, **(_preview_last or {}))


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


@router.get("/assignable-users", response_model=list[AssignableUserOut])  # before /{team_id}
def list_assignable_users(admin: RequireAnyAdmin, db: DbSession) -> list[AssignableUserOut]:
    """Candidates for "assign admin". No emails: club admins must not see other clubs' contact details."""
    if not (admin.is_full_admin or admin_clubs(db, admin)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to manage admins")
    users = db.execute(select(AdminUser.id, AdminUser.username).where(AdminUser.is_full_admin.is_(False)).order_by(AdminUser.username)).all()
    direct: dict[int, list[int]] = {}
    for user_id, team_id in db.execute(
        select(Membership.user_id, Membership.team_id).where(Membership.role == "admin", Membership.team_id.is_not(None))
    ):
        direct.setdefault(user_id, []).append(team_id)
    return [AssignableUserOut(id=i, username=u, team_ids=direct.get(i, [])) for i, u in users]


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: DbSession) -> Team:
    return get_team_or_404(db, team_id)


@router.patch("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, payload: TeamUpdate, admin: RequireAnyAdmin, db: DbSession) -> Team:
    check_team_scope(db, admin, team_id)
    team = get_team_or_404(db, team_id)
    updates = _stringify_urls(payload.model_dump(exclude_unset=True))
    if "club" in updates and updates["club"] != team.club and not admin.is_full_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a full admin can change a team's club")
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
def list_team_admins(team_id: int, admin: RequireAnyAdmin, db: DbSession) -> list[AdminOut]:
    team = get_team_or_404(db, team_id)
    check_admin_grant(db, admin, team, "team")
    # Guarded: `club == None` would match every team-scope row (club IS NULL).
    scope = Membership.team_id == team.id if team.club is None else or_(Membership.team_id == team.id, Membership.club == team.club)
    rows = db.execute(
        select(AdminUser.id, AdminUser.username, AdminUser.email, Membership.club)
        .join(Membership, Membership.user_id == AdminUser.id)
        .where(Membership.role == "admin", scope)
        .order_by(AdminUser.id)
    )
    return [AdminOut(id=i, username=u, email=e, club=c) for i, u, e, c in rows]


@router.post("/{team_id}/admins", status_code=status.HTTP_201_CREATED, response_model=AdminOut)
def create_team_admin(team_id: int, payload: AdminCreate, _admin_id: RequireAdmin, db: DbSession) -> AdminOut:
    team = get_team_or_404(db, team_id)
    if payload.scope == "club" and team.club is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "לקבוצה אין מועדון")
    if db.scalar(select(AdminUser).where(AdminUser.username == payload.username)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "שם המשתמש כבר קיים")
    if payload.email and db.scalar(select(AdminUser).where(AdminUser.email == payload.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "האימייל כבר קיים")
    # ponytail: a same-instant duplicate hits the unique index as a 500; catch IntegrityError if it ever matters
    user = AdminUser(username=payload.username, email=payload.email, password_hash=hash_password(payload.password))
    club = team.club if payload.scope == "club" else None
    user.memberships.append(Membership(team_id=team_id if club is None else None, club=club, role="admin"))
    db.add(user)
    db.commit()
    return AdminOut(id=user.id, username=user.username, email=user.email, club=club)


def _grant_filter(user_id: int, team: Team, scope: str):
    if scope == "club":
        return Membership.user_id == user_id, Membership.club == team.club
    return Membership.user_id == user_id, Membership.team_id == team.id


@router.delete("/{team_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team_admin(
    team_id: int, user_id: int, admin: RequireAnyAdmin, db: DbSession, scope: Literal["team", "club"] = "team"
) -> None:
    """Revokes one admin grant. The account and its other grants stay. Full admins have no rows: unreachable."""
    team = get_team_or_404(db, team_id)
    check_admin_grant(db, admin, team, scope)
    if scope == "club" and team.club is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    grant = db.scalar(select(Membership).where(*_grant_filter(user_id, team, scope), Membership.role == "admin"))
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    db.delete(grant)
    db.commit()


@router.put("/{team_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def assign_team_admin(
    team_id: int, user_id: int, admin: RequireAnyAdmin, db: DbSession, payload: AssignIn | None = None
) -> None:
    """Make an existing account an admin of this team (or its club). Adds a grant; other grants stay."""
    scope = payload.scope if payload else "team"
    team = get_team_or_404(db, team_id)
    check_admin_grant(db, admin, team, scope)
    if scope == "club" and team.club is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "לקבוצה אין מועדון")
    # is_full_admin false keeps full admins unreachable: this can never create or demote a full admin.
    user = db.scalar(select(AdminUser).where(AdminUser.id == user_id, AdminUser.is_full_admin.is_(False)))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    grant = db.scalar(select(Membership).where(*_grant_filter(user_id, team, scope)))
    if grant is None:
        grant = Membership(user_id=user_id, team_id=team.id if scope == "team" else None, club=team.club if scope == "club" else None)
        db.add(grant)
    grant.role = "admin"
    db.commit()
