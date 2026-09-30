from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, HttpUrl
from sqlalchemy.orm import Session

from app.deps import DbSession, RequireAdmin, get_team_or_404
from app.models import Player, PlayerImage

router = APIRouter(tags=["players"])

class PlayerCreate(BaseModel):
    name: str
    name_en: str | None = None
    jersey_number: int | None = None


class PlayerUpdate(BaseModel):
    name: str | None = None
    name_en: str | None = None
    jersey_number: int | None = None


class PlayerImageCreate(BaseModel):
    url: HttpUrl


class PlayerImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    player_id: int
    url: str


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    name: str
    name_en: str | None
    jersey_number: int | None
    images: list[PlayerImageOut]


def _get_team_player_or_404(db: Session, team_id: int, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


def _get_player_or_404(db: Session, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


@router.post(
    "/teams/{team_id}/players", response_model=PlayerOut, status_code=status.HTTP_201_CREATED
)
def create_player(
    team_id: int, payload: PlayerCreate, db: DbSession, _admin_id: RequireAdmin
) -> Player:
    get_team_or_404(db, team_id)
    player = Player(team_id=team_id, **payload.model_dump())
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.get("/teams/{team_id}/players", response_model=list[PlayerOut])
def list_players(team_id: int, db: DbSession) -> list[Player]:
    team = get_team_or_404(db, team_id)
    return [p for p in team.players if p.deleted_at is None]


@router.patch("/teams/{team_id}/players/{player_id}", response_model=PlayerOut)
def update_player(
    team_id: int,
    player_id: int,
    payload: PlayerUpdate,
    db: DbSession,
    _admin_id: RequireAdmin,
) -> Player:
    player = _get_team_player_or_404(db, team_id, player_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(player, field, value)
    db.commit()
    db.refresh(player)
    return player


@router.delete("/teams/{team_id}/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    team_id: int, player_id: int, db: DbSession, _admin_id: RequireAdmin
) -> None:
    player = _get_team_player_or_404(db, team_id, player_id)
    player.deleted_at = datetime.now(UTC)
    db.commit()


@router.get("/teams/{team_id}/players/deleted", response_model=list[PlayerOut])
def list_deleted_players(team_id: int, db: DbSession, _admin_id: RequireAdmin) -> list[Player]:
    team = get_team_or_404(db, team_id)
    return [p for p in team.players if p.deleted_at is not None]


@router.post("/teams/{team_id}/players/{player_id}/restore", response_model=PlayerOut)
def restore_player(team_id: int, player_id: int, db: DbSession, _admin_id: RequireAdmin) -> Player:
    player = _get_team_player_or_404(db, team_id, player_id)
    player.deleted_at = None
    db.commit()
    db.refresh(player)
    return player


@router.get("/players/{player_id}", response_model=PlayerOut)
def get_player(player_id: int, db: DbSession) -> Player:
    player = _get_player_or_404(db, player_id)
    if player.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


@router.post(
    "/players/{player_id}/images",
    response_model=PlayerImageOut,
    status_code=status.HTTP_201_CREATED,
)
def add_player_image(
    player_id: int, payload: PlayerImageCreate, db: DbSession, _admin_id: RequireAdmin
) -> PlayerImage:
    _get_player_or_404(db, player_id)
    image = PlayerImage(player_id=player_id, url=str(payload.url))
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.delete(
    "/players/{player_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_player_image(
    player_id: int, image_id: int, db: DbSession, _admin_id: RequireAdmin
) -> None:
    image = db.get(PlayerImage, image_id)
    if image is None or image.player_id != player_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    db.delete(image)
    db.commit()
