import re
from datetime import date, datetime, time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.deps import (
    DbSession,
    OptionalUser,
    RequireTeamAdmin,
    can_write_team,
    get_game_or_404,
    get_team_or_404,
)
from app.models import Game, GameStatus, get_or_create_opponent

router = APIRouter(prefix="/teams/{team_id}/games", tags=["games"])
club_router = APIRouter(prefix="/games", tags=["games"])
MAX_CLUB_WINDOW_DAYS = 31

OpponentName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class GameCreate(BaseModel):
    opponent_name: OpponentName
    scheduled_at: datetime
    is_home: bool = True
    status: GameStatus = GameStatus.SCHEDULED
    team_score: int | None = None
    opponent_score: int | None = None
    description: str | None = None


class GameUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    opponent_name: OpponentName = None
    scheduled_at: datetime = None
    is_home: bool = None
    status: GameStatus = None
    team_score: int | None = None
    opponent_score: int | None = None
    description: str | None = None
    stats_url: str | None = None


def sheet_url(value: str) -> str:
    """A Google Sheets URL as-is, or a bare sheet ID expanded to its canonical URL. Pins the host (SSRF, #264)."""
    v = value.strip()
    if re.fullmatch(r"[\w-]+", v, re.ASCII):
        return f"https://docs.google.com/spreadsheets/d/{v}"
    if re.fullmatch(r"https://docs\.google\.com/spreadsheets/d/[\w-]+(?:[/?#].*)?", v, re.ASCII):
        return v
    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Not a Google Sheet link or sheet ID: {v}"
    )


class OpponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_en: str | None
    logo_url: str | None
    source_url: str | None
    address: str | None


class GameRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    is_home: bool
    scheduled_at: datetime
    status: GameStatus
    team_score: int | None
    opponent_score: int | None
    description: str | None
    has_stats: bool
    stats_url: str | None
    opponent: OpponentRead


class AdminGameRead(GameRead):
    """GameRead plus scrape-review bookkeeping — admin-only routes only.

    Public routes (list_games, get_game) must not leak these to anonymous
    callers; see GameRead above. They also blank `stats_url` for non-writers (#249).
    """

    is_scraped: bool
    needs_review: bool
    is_manually_overridden: bool
    scrape_suggestion: dict | None


def _public_game(game: Game, show_sheet: bool) -> GameRead:
    out = GameRead.model_validate(game)
    if not show_sheet:  # stats_url links the raw Google Sheet, so it is admin-only (#249)
        out.stats_url = None
    return out


def _apply_game_updates(db: Session, game: Game, updates: dict) -> None:
    """Applies a field-name-keyed dict of GameCreate/GameUpdate values onto `game`.

    Shared by create, PATCH and suggestion-accept (#16), which all need the
    same "opponent_name -> opponent row, rest via setattr" apply step.
    """
    opponent_name = updates.pop("opponent_name", None)
    if opponent_name is not None:
        game.opponent = get_or_create_opponent(db, opponent_name)
    for field, value in updates.items():
        setattr(game, field, value)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GameRead)
def create_game(
    team_id: int,
    payload: GameCreate,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> Game:
    get_team_or_404(db, team_id)
    game = Game(team_id=team_id)
    _apply_game_updates(db, game, payload.model_dump())
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


@router.get("", response_model=list[GameRead])
def list_games(team_id: int, db: DbSession, user: OptionalUser) -> list[GameRead]:
    get_team_or_404(db, team_id)
    show = can_write_team(db, user, team_id)
    games = db.scalars(select(Game).where(Game.team_id == team_id, Game.needs_review.is_(False)))
    return [_public_game(g, show) for g in games]


@club_router.get("", response_model=list[GameRead])
def list_club_games(
    db: DbSession, from_: Annotated[date, Query(alias="from")], to: date
) -> list[GameRead]:
    """Approved games of every team with from <= day <= to (scheduled_at is naive Israel wall-clock time)."""
    if to < from_ or (to - from_).days > MAX_CLUB_WINDOW_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"from={from_} to={to}: 'to' must not precede 'from' and the span is at most {MAX_CLUB_WINDOW_DAYS} days",
        )
    games = db.scalars(
        select(Game)
        .options(selectinload(Game.opponent))
        .where(
            Game.needs_review.is_(False),
            Game.scheduled_at >= datetime.combine(from_, time.min),
            Game.scheduled_at <= datetime.combine(to, time.max),
        )
    )
    return [_public_game(g, False) for g in games]


@router.get("/pending-review", response_model=list[AdminGameRead])
def list_pending_review_games(
    team_id: int,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> list[Game]:
    get_team_or_404(db, team_id)
    return list(
        db.scalars(
            select(Game).where(
                Game.team_id == team_id,
                or_(
                    Game.needs_review.is_(True),
                    (
                        Game.scrape_suggestion.is_not(None)
                        & Game.scrape_suggestion_dismissed.is_(False)
                    ),
                ),
            )
        )
    )


@router.get("/{game_id}", response_model=GameRead)
def get_game(team_id: int, game_id: int, db: DbSession, user: OptionalUser) -> GameRead:
    game = get_game_or_404(db, team_id, game_id)
    show = can_write_team(db, user, team_id)
    if game.needs_review and not show:  # unapproved scraped game, hidden like in list_games
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return _public_game(game, show)


@router.patch("/{game_id}", response_model=AdminGameRead)
def update_game(
    team_id: int,
    game_id: int,
    payload: GameUpdate,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> Game:
    game = get_game_or_404(db, team_id, game_id)
    updates = payload.model_dump(exclude_unset=True)
    # stats_url is admin bookkeeping, not a scrape field: editing it never flags an override.
    has_changes = bool(updates.keys() - {"stats_url"})
    if "stats_url" in updates:
        updates["stats_url"] = sheet_url(updates["stats_url"]) if updates["stats_url"] else None
    _apply_game_updates(db, game, updates)
    if has_changes:
        game.is_manually_overridden = True
        game.needs_review = False
        # #16: the admin's new values may no longer match a pending suggestion
        # (or may match it exactly, e.g. "90 -> 90") — clear it so the next
        # scrape recomputes the diff against the edit instead of the stale one.
        game.scrape_suggestion = None
        game.scrape_suggestion_dismissed = False
    db.commit()
    db.refresh(game)
    return game


@router.post("/{game_id}/approve", response_model=AdminGameRead)
def approve_game(
    team_id: int,
    game_id: int,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> Game:
    game = get_game_or_404(db, team_id, game_id)
    game.needs_review = False
    game.is_scraped = True
    db.commit()
    db.refresh(game)
    return game


@router.post("/{game_id}/suggestion/accept", response_model=AdminGameRead)
def accept_game_suggestion(
    team_id: int,
    game_id: int,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> Game:
    game = get_game_or_404(db, team_id, game_id)
    if game.scrape_suggestion is None or game.scrape_suggestion_dismissed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No pending suggestion")
    updates = GameUpdate.model_validate(game.scrape_suggestion).model_dump(exclude_unset=True)
    _apply_game_updates(db, game, updates)
    game.scrape_suggestion = None
    game.scrape_suggestion_dismissed = False
    game.is_manually_overridden = False
    db.commit()
    db.refresh(game)
    return game


@router.post("/{game_id}/suggestion/reject", response_model=AdminGameRead)
def reject_game_suggestion(
    team_id: int,
    game_id: int,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> Game:
    game = get_game_or_404(db, team_id, game_id)
    if game.scrape_suggestion is None or game.scrape_suggestion_dismissed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No pending suggestion")
    game.scrape_suggestion_dismissed = True
    db.commit()
    db.refresh(game)
    return game


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(
    team_id: int,
    game_id: int,
    db: DbSession,
    _admin_id: RequireTeamAdmin,
) -> None:
    game = get_game_or_404(db, team_id, game_id)
    db.delete(game)
    db.commit()
