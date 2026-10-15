import logging

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app import scrape_league_teams
from app.deps import DbSession
from app.models import League

router = APIRouter(prefix="/leagues", tags=["leagues"])
log = logging.getLogger(__name__)


class LeagueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ibasketball_id: int
    name: str
    url: str


class LeagueTeamOut(BaseModel):
    name: str
    logo_url: str | None
    ibasketball_team_url: str
    team_id: int | None


class LeagueTeamsOut(BaseModel):
    league: LeagueOut
    teams: list[LeagueTeamOut]


@router.get("", response_model=list[LeagueOut])
def list_leagues(db: DbSession) -> list[League]:
    return list(db.scalars(select(League).order_by(League.name)))


@router.get("/{ibasketball_id}/teams", response_model=LeagueTeamsOut)
def league_teams(ibasketball_id: int, db: DbSession) -> dict:
    league = db.scalar(select(League).where(League.ibasketball_id == ibasketball_id))
    if league is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"League {ibasketball_id} not found")
    try:
        teams = scrape_league_teams.league_teams(db, ibasketball_id)
    except httpx.HTTPError:
        log.exception("Fetching teams of league %s failed", ibasketball_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "ibasketball unreachable") from None
    return {"league": league, "teams": teams}
