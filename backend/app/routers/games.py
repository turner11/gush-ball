from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Game, GameStatus, Opponent, Team

router = APIRouter(prefix="/teams/{team_id}/games", tags=["games"])

DbSession = Annotated[Session, Depends(get_db)]


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


def _get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def _get_or_create_opponent(db: Session, name: str) -> Opponent:
    name = name.strip()
    opponent = db.scalar(select(Opponent).where(Opponent.name == name))
    if opponent is None:
        opponent = Opponent(name=name)
        db.add(opponent)
        db.flush()
    return opponent


def _get_game_or_404(db: Session, team_id: int, game_id: int) -> Game:
    game = db.scalar(select(Game).where(Game.id == game_id, Game.team_id == team_id))
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GameRead)
def create_game(
    team_id: int,
    payload: GameCreate,
    db: DbSession,
    _admin_id: Annotated[int, Depends(require_admin)],
) -> Game:
    _get_team_or_404(db, team_id)
    opponent = _get_or_create_opponent(db, payload.opponent_name)
    game = Game(
        team_id=team_id,
        opponent=opponent,
        is_home=payload.is_home,
        scheduled_at=payload.scheduled_at,
        status=payload.status,
        team_score=payload.team_score,
        opponent_score=payload.opponent_score,
        description=payload.description,
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


@router.get("", response_model=list[GameRead])
def list_games(team_id: int, db: DbSession) -> list[Game]:
    _get_team_or_404(db, team_id)
    return list(
        db.scalars(
            select(Game).where(Game.team_id == team_id, Game.needs_review.is_(False))
        )
    )


@router.get("/{game_id}", response_model=GameRead)
def get_game(team_id: int, game_id: int, db: DbSession) -> Game:
    return _get_game_or_404(db, team_id, game_id)


@router.patch("/{game_id}", response_model=GameRead)
def update_game(
    team_id: int,
    game_id: int,
    payload: GameUpdate,
    db: DbSession,
    _admin_id: Annotated[int, Depends(require_admin)],
) -> Game:
    game = _get_game_or_404(db, team_id, game_id)
    updates = payload.model_dump(exclude_unset=True)
    opponent_name = updates.pop("opponent_name", None)
    if opponent_name is not None:
        game.opponent = _get_or_create_opponent(db, opponent_name)
    for field, value in updates.items():
        setattr(game, field, value)
    db.commit()
    db.refresh(game)
    return game


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(
    team_id: int,
    game_id: int,
    db: DbSession,
    _admin_id: Annotated[int, Depends(require_admin)],
) -> None:
    game = _get_game_or_404(db, team_id, game_id)
    db.delete(game)
    db.commit()
