"""CRUD for a team's four content resources (links/videos/images/posts).

The four tables stay separate (see CLAUDE.md), but their routes are identical apart from the
schemas, so they're registered once per resource by `_add_crud_routes` below.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, HttpUrl
from sqlalchemy.orm import Session

from app.db import Base
from app.deps import DbSession, RequireAdmin, get_team_or_404
from app.models import TeamImage, TeamLink, TeamPost, TeamVideo

router = APIRouter(tags=["content"])


class TeamLinkCreate(BaseModel):
    label: str
    label_en: str | None = None
    url: HttpUrl


class TeamLinkUpdate(BaseModel):
    label: str | None = None
    label_en: str | None = None
    url: HttpUrl | None = None


class TeamLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    label: str
    label_en: str | None
    url: str


# Videos and images share one shape.
class TitledUrlCreate(BaseModel):
    title: str
    title_en: str | None = None
    url: HttpUrl
    player_ids: list[int] = []


class TitledUrlUpdate(BaseModel):
    title: str | None = None
    title_en: str | None = None
    url: HttpUrl | None = None
    player_ids: list[int] = []


class TitledUrlOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    url: str
    player_ids: list[int]


class TeamPostCreate(BaseModel):
    title: str
    title_en: str | None = None
    body: str
    body_en: str | None = None


class TeamPostUpdate(BaseModel):
    title: str | None = None
    title_en: str | None = None
    body: str | None = None
    body_en: str | None = None


class TeamPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    body: str
    body_en: str | None


def _to_columns(data: dict) -> dict:
    # HttpUrl doesn't map to a String column; store as plain str.
    if data.get("url") is not None:
        data["url"] = str(data["url"])
    return data


def _check_player_ids(team, data: dict) -> None:
    # team.players includes soft-deleted rows, so already-tagged removed players stay valid.
    if not set(data.get("player_ids", [])) <= {p.id for p in team.players}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown player_ids"
        )


def _add_crud_routes(
    resource: str,
    model: type[Base],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    out_schema: type[BaseModel],
    not_found: str,
) -> None:
    path = f"/teams/{{team_id}}/{resource}"

    def get_item_or_404(db: Session, team_id: int, item_id: int):
        item = db.get(model, item_id)
        if item is None or item.team_id != team_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
        return item

    @router.post(path, response_model=out_schema, status_code=status.HTTP_201_CREATED)
    def create(team_id: int, payload: create_schema, db: DbSession, _admin_id: RequireAdmin):
        data = payload.model_dump()
        _check_player_ids(get_team_or_404(db, team_id), data)
        item = model(team_id=team_id, **_to_columns(data))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.get(path, response_model=list[out_schema])
    def list_items(team_id: int, db: DbSession):
        return list(getattr(get_team_or_404(db, team_id), resource))

    @router.patch(path + "/{item_id}", response_model=out_schema)
    def update(
        team_id: int, item_id: int, payload: update_schema, db: DbSession, _admin_id: RequireAdmin
    ):
        item = get_item_or_404(db, team_id, item_id)
        data = payload.model_dump(exclude_unset=True)
        _check_player_ids(get_team_or_404(db, team_id), data)
        if "url" in data and data["url"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="url cannot be null"
            )
        for field, value in _to_columns(data).items():
            setattr(item, field, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete(path + "/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete(team_id: int, item_id: int, db: DbSession, _admin_id: RequireAdmin) -> None:
        db.delete(get_item_or_404(db, team_id, item_id))
        db.commit()


_add_crud_routes("links", TeamLink, TeamLinkCreate, TeamLinkUpdate, TeamLinkOut, "Link not found")
_add_crud_routes(
    "videos", TeamVideo, TitledUrlCreate, TitledUrlUpdate, TitledUrlOut, "Video not found"
)
_add_crud_routes(
    "images", TeamImage, TitledUrlCreate, TitledUrlUpdate, TitledUrlOut, "Image not found"
)
_add_crud_routes("posts", TeamPost, TeamPostCreate, TeamPostUpdate, TeamPostOut, "Post not found")
