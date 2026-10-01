from typing import Literal

import pandas as pd
from bbstats import get_snapshots_df, get_stats_from_raw_data
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DbSession, RequireTeamAdmin, get_team_or_404
from app.models import Game, LineupSnapshot
from app.routers.games import _get_game_or_404

router = APIRouter(tags=["lineups"])


class StatsSource(BaseModel):
    url: str | None = Field(default=None, pattern=r"^https?://")


class StatsLoadOut(BaseModel):
    stats_url: str
    snapshots: int


class LineupOut(BaseModel):
    players: list[int]
    minutes: float
    score_diff: int
    offense_diff: int
    defence_diff: int
    score_pm: float
    offense_pm: float
    defence_pm: float


@router.post("/teams/{team_id}/games/{game_id}/stats", response_model=StatsLoadOut)
def load_game_stats(
    team_id: int, game_id: int, payload: StatsSource, db: DbSession, _admin: RequireTeamAdmin
) -> StatsLoadOut:
    # Deliberately not PATCH /games/{id}: that would set is_manually_overridden and divert
    # the next scrape into the review queue.
    game = _get_game_or_404(db, team_id, game_id)
    url = payload.url or game.stats_url
    if not url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No stats URL")
    try:
        df = get_snapshots_df(url)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to load stats sheet (must be shared 'anyone with the link'): {exc}",
        ) from exc
    # Explicit casts: numpy scalars don't serialize to JSON.
    game.lineup_snapshots = [
        LineupSnapshot(
            players=[int(p) for p in r.players],
            elapsed=float(r.elapsed),
            offense_diff=int(r.offense_diff),
            defence_diff=int(r.defence_diff),
        )
        for r in df.itertuples()
    ]
    game.stats_url = url
    db.commit()
    return StatsLoadOut(stats_url=url, snapshots=len(game.lineup_snapshots))


@router.get("/teams/{team_id}/lineups", response_model=list[LineupOut])
def list_lineups(
    team_id: int,
    db: DbSession,
    size: int = Query(5, ge=1, le=5),
    sort: Literal["top", "offense", "defense"] = "top",
    game_id: int | None = None,
) -> list[LineupOut]:
    get_team_or_404(db, team_id)
    query = (
        select(LineupSnapshot)
        .join(Game)
        .where(Game.team_id == team_id, Game.needs_review.is_(False))
    )
    if game_id is not None:
        _get_game_or_404(db, team_id, game_id)
        query = query.where(LineupSnapshot.game_id == game_id)
    rows = db.scalars(query).all()
    if not rows:
        return []
    df = pd.DataFrame(
        [
            {
                "players": r.players,
                "elapsed": r.elapsed,
                "offense_diff": r.offense_diff,
                "defence_diff": r.defence_diff,
            }
            for r in rows
        ]
    )
    # ponytail: computed per request over all the team's (or one game's) snapshots; cache or vectorize if a season makes this slow
    stats = get_stats_from_raw_data(df, size, sort)
    return [
        LineupOut(
            players=[int(p) for p in r.players],
            minutes=float(r.elapsed),
            score_diff=int(r.score_diff),
            offense_diff=int(r.offense_diff),
            defence_diff=int(r.defence_diff),
            score_pm=float(r.score_pm),
            offense_pm=float(r.offense_pm),
            defence_pm=float(r.defence_pm),
        )
        for r in stats.itertuples()
    ]
