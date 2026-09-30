from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.deps import DbSession, RequireAdmin, get_team_or_404
from app.models import Game, GameStatus, get_or_create_opponent

router = APIRouter(prefix="/teams/{team_id}/games", tags=["games"])


class GameCreate(BaseModel):
    opponent_name: str
    scheduled_at: datetime
    is_home: bool = True
    status: GameStatus = GameStatus.SCHEDULED
    team_score: int | None = None
    opponent_score: int | None = None
    description: str | None = None


class GameUpdate(BaseModel):
    opponent_name: str | None = None
    scheduled_at: datetime | None = None
    is_home: bool | None = None
    status: GameStatus | None = None
    team_score: int | None = None
    opponent_score: int | None = None
    description: str | None = None


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
    opponent: OpponentRead


class AdminGameRead(GameRead):
    """GameRead plus scrape-review bookkeeping — admin-only routes only.

    Public routes (list_games, get_game) must not leak these to anonymous
    callers; see GameRead above.
    """

    is_scraped: bool
    needs_review: bool
    is_manually_overridden: bool
    scrape_suggestion: dict | None


def _get_game_or_404(db: Session, team_id: int, game_id: int) -> Game:
    game = db.scalar(select(Game).where(Game.id == game_id, Game.team_id == team_id))
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game


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
    _admin_id: RequireAdmin,
) -> Game:
    get_team_or_404(db, team_id)
    game = Game(team_id=team_id)
    _apply_game_updates(db, game, payload.model_dump())
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


@router.get("", response_model=list[GameRead])
def list_games(team_id: int, db: DbSession) -> list[Game]:
    get_team_or_404(db, team_id)
    return list(
        db.scalars(
            select(Game).where(Game.team_id == team_id, Game.needs_review.is_(False))
        )
    )


@router.get("/pending-review", response_model=list[AdminGameRead])
def list_pending_review_games(
    team_id: int,
    db: DbSession,
    _admin_id: RequireAdmin,
) -> list[Game]:
    get_team_or_404(db, team_id)
    return list(
        db.scalars(
            select(Game).where(
                Game.team_id == team_id,
                or_(
                    Game.needs_review.is_(True),
                    (Game.scrape_suggestion.is_not(None) & Game.scrape_suggestion_dismissed.is_(False)),
                ),
            )
        )
    )


@router.get("/{game_id}", response_model=GameRead)
def get_game(team_id: int, game_id: int, db: DbSession) -> Game:
    return _get_game_or_404(db, team_id, game_id)


@router.patch("/{game_id}", response_model=AdminGameRead)
def update_game(
    team_id: int,
    game_id: int,
    payload: GameUpdate,
    db: DbSession,
    _admin_id: RequireAdmin,
) -> Game:
    game = _get_game_or_404(db, team_id, game_id)
    updates = payload.model_dump(exclude_unset=True)
    has_changes = bool(updates)
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
    _admin_id: RequireAdmin,
) -> Game:
    game = _get_game_or_404(db, team_id, game_id)
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
    _admin_id: RequireAdmin,
) -> Game:
    game = _get_game_or_404(db, team_id, game_id)
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
    _admin_id: RequireAdmin,
) -> Game:
    game = _get_game_or_404(db, team_id, game_id)
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
    _admin_id: RequireAdmin,
) -> None:
    game = _get_game_or_404(db, team_id, game_id)
    db.delete(game)
    db.commit()
