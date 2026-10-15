"""Ask to add an ibasketball team that is not on the site yet (#351).

A signed-in user requests a team from its league page. A club admin of the team's club (read from its ibasketball
page) or a full admin approves; approval creates the `Team` through the club-import path, makes the requester its
admin and starts a one-team sync. An approver's own request is approved at once."""

import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app import scrape_club, scrape_games, scrape_league_teams
from app.deps import (
    DbSession,
    RequireAnyAdmin,
    RequireUser,
    admin_clubs,
    can_approve_team_request,
    is_admin,
)
from app.models import AdminUser, League, Membership, Team, TeamRequest
from app.routers import sync, teams
from app.routers.memberships import mask_email

router = APIRouter(prefix="/team-requests", tags=["team-requests"])
log = logging.getLogger(__name__)

MAX_PENDING = 3  # per user, so a requester can't make us fetch team pages without limit
ON_SITE = "הקבוצה כבר באתר"
ALREADY_REQUESTED = "הקבוצה כבר התבקשה וממתינה לאישור"
EMAIL_REQUIRED = "כדי לבקש קבוצה צריך כתובת אימייל מאומתת. אמתו אותה בקישור שנשלח אליכם בהרשמה, או התחברו עם Google"
TOO_MANY = f"יש לך כבר {MAX_PENDING} בקשות ממתינות. אפשר לבקש קבוצה נוספת אחרי שאחת מהן תטופל"


class TeamRequestIn(BaseModel):
    league_id: int
    ibasketball_team_url: str


class TeamRequestCreated(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    status: str


class TeamRequestOut(BaseModel):
    id: int
    name: str
    logo_url: str | None
    ibasketball_team_url: str
    league_name: str | None
    club: str | None
    username: str
    display_name: str
    email_hint: str | None


def _on_site(db: DbSession, url: str) -> bool:
    code = scrape_club._team_code(url)
    urls = db.scalars(select(Team.ibasketball_team_url).where(Team.ibasketball_team_url.is_not(None)))
    return any(scrape_club._team_code(u) == code for u in urls)


def _approve(db: DbSession, row: TeamRequest) -> Team:
    """Creates the team and makes the requester its admin. The caller commits."""
    if _on_site(db, row.ibasketball_team_url):
        raise HTTPException(status.HTTP_409_CONFLICT, ON_SITE)
    named = [{"name": row.name}]
    scrape_club._suggest_names(named, set(db.scalars(select(Team.name))))  # same " 2" dedupe as the club import
    team = teams.new_team(
        db,
        {
            "name": named[0]["name"],
            "logo_url": row.logo_url,
            "ibasketball_team_url": row.ibasketball_team_url,
            "ibasketball_league_url": row.ibasketball_league_url,
            "club": row.club,
        },
    )
    db.flush()
    db.add(Membership(user_id=row.user_id, team_id=team.id, role="admin"))
    row.status = "approved"
    return team


def _start_sync(background_tasks: BackgroundTasks, team: Team) -> None:
    if not sync.start_sync(background_tasks, [team.id]):
        log.info("Sync already running; team %s syncs on the next run", team.id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TeamRequestCreated)
def request_team(
    payload: TeamRequestIn, user: RequireUser, db: DbSession, background_tasks: BackgroundTasks
) -> TeamRequest:
    # first, so a rejected request is never stored or fetched; admins already passed the #270 gate (and may lack an email)
    if user.email is None and not is_admin(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, EMAIL_REQUIRED)
    league = db.scalar(select(League).where(League.ibasketball_id == payload.league_id))
    if league is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"League {payload.league_id} not found")
    try:
        feed = scrape_league_teams.league_teams(db, payload.league_id)
    except httpx.HTTPError:
        log.exception("Fetching teams of league %s failed", payload.league_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "ibasketball unreachable") from None
    # name, logo and url come from the server-side feed, never the body (the url is fetched later: SSRF)
    code = scrape_club._team_code(payload.ibasketball_team_url)
    entry = next((r for r in feed if code and scrape_club._team_code(r["ibasketball_team_url"]) == code), None)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Team {payload.ibasketball_team_url} not in league {payload.league_id}")
    if entry["team_id"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, ON_SITE)
    # ponytail: pre-check for a clean 409; a concurrent double-submit hits the unique index (500), harmless
    if entry["requested"]:
        raise HTTPException(status.HTTP_409_CONFLICT, ALREADY_REQUESTED)
    pending = db.scalars(select(TeamRequest.id).where(TeamRequest.user_id == user.id, TeamRequest.status == "pending"))
    if not user.is_full_admin and len(pending.all()) >= MAX_PENDING:  # before the fetch: the cap is what bounds it
        raise HTTPException(status.HTTP_409_CONFLICT, TOO_MANY)
    club = scrape_games.team_page_club(db, entry["ibasketball_team_url"])
    auto = can_approve_team_request(db, user, club)
    logo = entry["logo_url"]
    row = TeamRequest(
        user_id=user.id,
        name=entry["name"][:120],
        logo_url=logo if logo and len(logo) <= scrape_club.LOGO_MAX else None,
        ibasketball_team_url=entry["ibasketball_team_url"],
        ibasketball_league_url=league.url,
        club=club,
    )
    db.add(row)
    team = _approve(db, row) if auto else None
    db.commit()
    if team is not None:
        _start_sync(background_tasks, team)
    return row


@router.get("", response_model=list[TeamRequestOut])
def list_pending(admin: RequireAnyAdmin, db: DbSession) -> list[TeamRequestOut]:
    query = (
        select(TeamRequest, AdminUser, League.name)
        .join(AdminUser, AdminUser.id == TeamRequest.user_id)
        .outerjoin(League, League.url == TeamRequest.ibasketball_league_url)
        .where(TeamRequest.status == "pending")
        .order_by(TeamRequest.id)
    )
    if not admin.is_full_admin:  # a NULL club never matches
        query = query.where(TeamRequest.club.in_(admin_clubs(db, admin)))
    return [
        TeamRequestOut(
            id=r.id,
            name=r.name,
            logo_url=r.logo_url,
            ibasketball_team_url=r.ibasketball_team_url,
            league_name=league_name,
            club=r.club,
            username=u.username,
            display_name=u.display_name,
            email_hint=mask_email(u.email),
        )
        for r, u, league_name in db.execute(query)
    ]


def _pending_in_scope(db: DbSession, admin: AdminUser, request_id: int) -> TeamRequest:
    row = db.get(TeamRequest, request_id)
    if row is None or row.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Team request {request_id} not found")
    if not can_approve_team_request(db, admin, row.club):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for this team request")
    return row


@router.post("/{request_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve(request_id: int, admin: RequireAnyAdmin, db: DbSession, background_tasks: BackgroundTasks) -> Response:
    team = _approve(db, _pending_in_scope(db, admin, request_id))
    db.commit()
    _start_sync(background_tasks, team)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject(request_id: int, admin: RequireAnyAdmin, db: DbSession) -> Response:
    _pending_in_scope(db, admin, request_id).status = "rejected"
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
