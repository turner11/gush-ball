import csv
import logging
from io import StringIO
from typing import Annotated, Literal
from urllib.error import HTTPError

import pandas as pd
from bbstats import fetch_csv, get_snapshots_df, get_stats_from_raw_data
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from app.deps import (
    DbSession,
    RequireStatsViewer,
    RequireTeamAdmin,
    get_game_or_404,
    get_team_or_404,
)
from app.models import Game, LineupSnapshot
from app.routers.games import sheet_url

log = logging.getLogger(__name__)
router = APIRouter(tags=["lineups"])

STATS_HEADERS = ("#1", "#2", "#3", "#4", "#5", "Points", "Points Against", "Quarter", "Time Left")
EXPECTED_HEADERS = ",".join(STATS_HEADERS)
# Digits and ':' only: also keeps CSV formula injection out of the export.
StatsCell = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5, pattern=r"^[0-9:]*$")]
StatsRows = Annotated[list[Annotated[list[StatsCell], Field(min_length=9, max_length=9)]], Field(max_length=300)]


class StatsSource(BaseModel):
    url: str | None = None


class StatsLoadOut(BaseModel):
    stats_url: str | None
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


def _rows_to_csv(rows: list[list[str]]) -> str:
    out = StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(STATS_HEADERS)
    writer.writerows(rows)
    return out.getvalue()


def _snapshots_from_csv(text: str) -> list[LineupSnapshot]:
    try:
        df = get_snapshots_df(pd.read_csv(StringIO(text)))
    except KeyError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Stats sheet is missing column {exc}. Expected headers: {EXPECTED_HEADERS}",
        ) from exc
    except ValueError as exc:  # bbstats: time over the quarter, bad int; the message names the value
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid stats data: {exc}") from exc
    except Exception as exc:
        log.exception("stats parse failed")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Failed to load stats sheet.") from exc
    # Explicit casts: numpy scalars don't serialize to JSON.
    return [
        LineupSnapshot(
            players=[int(p) for p in r.players],
            elapsed=float(r.elapsed),
            offense_diff=int(r.offense_diff),
            defence_diff=int(r.defence_diff),
        )
        for r in df.itertuples()
    ]


@router.post("/teams/{team_id}/games/{game_id}/stats", response_model=StatsLoadOut)
def load_game_stats(
    team_id: int, game_id: int, payload: StatsSource, db: DbSession, _admin: RequireTeamAdmin
) -> StatsLoadOut:
    # Deliberately not PATCH /games/{id}: that would set is_manually_overridden and divert
    # the next scrape into the review queue.
    game = get_game_or_404(db, team_id, game_id)
    raw = payload.url or game.stats_url
    if not raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No stats URL")
    url = sheet_url(raw)  # also re-validates a stored URL (#264)
    try:
        text = fetch_csv(url)
    except HTTPError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Can't open the stats sheet. Share it as 'anyone with the link' (viewer).",
        ) from exc
    except Exception as exc:
        log.exception("stats sheet fetch failed for game %s (%s)", game_id, url)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Failed to load stats sheet.") from exc
    game.lineup_snapshots = _snapshots_from_csv(text)
    game.stats_rows = []  # the sheet now owns this game's data
    game.stats_url = url
    db.commit()
    return StatsLoadOut(stats_url=url, snapshots=len(game.lineup_snapshots))


@router.delete("/teams/{team_id}/games/{game_id}/stats", status_code=status.HTTP_204_NO_CONTENT)
def delete_game_stats(team_id: int, game_id: int, db: DbSession, _admin: RequireTeamAdmin) -> None:
    # Keeps stats_url so the sheet stays linked; not a PATCH, so no override flag (see load_game_stats).
    game = get_game_or_404(db, team_id, game_id)
    game.lineup_snapshots = []
    game.stats_rows = []
    db.commit()


@router.get("/teams/{team_id}/games/{game_id}/stats/rows", response_model=list[list[str]])
def get_stats_rows(team_id: int, game_id: int, db: DbSession, _admin: RequireTeamAdmin) -> list[list[str]]:
    return get_game_or_404(db, team_id, game_id).stats_rows


@router.put("/teams/{team_id}/games/{game_id}/stats/rows", response_model=StatsLoadOut)
def put_stats_rows(
    team_id: int, game_id: int, rows: StatsRows, db: DbSession, _admin: RequireTeamAdmin
) -> StatsLoadOut:
    # Not PATCH /games, so no override flag (see load_game_stats). Parse first: a bad row changes nothing.
    game = get_game_or_404(db, team_id, game_id)
    for i, row in enumerate(rows, 1):
        for name, cell in zip(STATS_HEADERS, row, strict=True):
            if not cell:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Row {i}: '{name}' is empty")
    game.lineup_snapshots = _snapshots_from_csv(_rows_to_csv(rows))
    game.stats_rows = rows
    db.commit()
    return StatsLoadOut(stats_url=game.stats_url, snapshots=len(game.lineup_snapshots))


@router.get("/teams/{team_id}/games/{game_id}/stats.csv")
def export_stats_csv(team_id: int, game_id: int, db: DbSession, _admin: RequireTeamAdmin) -> Response:
    game = get_game_or_404(db, team_id, game_id)
    return Response(
        _rows_to_csv(game.stats_rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="game-{game_id}-stats.csv"'},
    )


@router.get("/teams/{team_id}/lineups", response_model=list[LineupOut])
def list_lineups(
    team_id: int,
    db: DbSession,
    _viewer: RequireStatsViewer,
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
        get_game_or_404(db, team_id, game_id)
        query = query.where(LineupSnapshot.game_id == game_id)
    rows = db.scalars(query).all()
    if not rows:
        return []
    df = pd.DataFrame(
        [
            {
                # bbstats' combinations are order-sensitive: unsorted rosters yield duplicate lineups (#593)
                "players": sorted(r.players),
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
