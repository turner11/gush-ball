"""CRUD for a team's five content resources (links/videos/images/posts/plays).

The tables stay separate (see CLAUDE.md), but their routes are identical apart from the
schemas, so they're registered once per resource by `_add_crud_routes` below. Plays' list is
member-only (#439); the other four lists are public.
"""

from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, HttpUrl, model_validator
from sqlalchemy.orm import Session

from app.db import Base
from app.deps import DbSession, RequireTeamAdmin, get_team_or_404, require_team_member
from app.models import TeamImage, TeamLink, TeamPlay, TeamPost, TeamVideo

router = APIRouter(tags=["content"])


class TeamLinkCreate(BaseModel):
    label: str
    label_en: str | None = None
    url: HttpUrl


class TeamLinkUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    label: str = None
    label_en: str | None = None
    url: HttpUrl = None


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
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    url: HttpUrl = None
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
    pinned: bool = False


class TeamPostUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    body: str = None
    body_en: str | None = None
    pinned: bool = None


class TeamPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    body: str
    body_en: str | None
    pinned: bool


class TeamPlayCreate(BaseModel):
    title: str
    title_en: str | None = None
    notes: str | None = None
    file_url: HttpUrl | None = None
    url: HttpUrl | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self):
        if (self.file_url is None) == (self.url is None):
            raise ValueError("Provide exactly one of file_url or url")
        return self


class TeamPlayUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    notes: str | None = None
    file_url: HttpUrl | None = None
    url: HttpUrl | None = None

    @model_validator(mode="after")
    def _swap_source(self):
        sent = {"file_url", "url"} & self.model_fields_set
        if len(sent) == 2:
            if (self.file_url is None) == (self.url is None):
                raise ValueError("Provide exactly one of file_url or url")
        elif sent:
            (field,) = sent
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null on its own; send the other source instead")
            # Setting the other source on one PATCH clears this one; assigning marks it as set.
            setattr(self, "url" if field == "file_url" else "file_url", None)
        return self


class TeamPlayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    notes: str | None
    file_url: str | None
    url: str | None
    sort_order: int | None


def _to_columns(data: dict) -> dict:
    # HttpUrl doesn't map to a String column; store as plain str.
    for key in ("url", "file_url"):
        if data.get(key) is not None:
            data[key] = str(data[key])
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
    *,
    read_dependencies: Sequence = (),
) -> None:
    path = f"/teams/{{team_id}}/{resource}"

    def get_item_or_404(db: Session, team_id: int, item_id: int):
        item = db.get(model, item_id)
        if item is None or item.team_id != team_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
        return item

    @router.post(path, response_model=out_schema, status_code=status.HTTP_201_CREATED)
    def create(team_id: int, payload: create_schema, db: DbSession, _admin_id: RequireTeamAdmin):
        data = payload.model_dump()
        _check_player_ids(get_team_or_404(db, team_id), data)
        item = model(team_id=team_id, **_to_columns(data))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.get(path, response_model=list[out_schema], dependencies=list(read_dependencies))
    def list_items(team_id: int, db: DbSession):
        return list(getattr(get_team_or_404(db, team_id), resource))

    @router.patch(path + "/{item_id}", response_model=out_schema)
    def update(
        team_id: int, item_id: int, payload: update_schema, db: DbSession, _admin_id: RequireTeamAdmin
    ):
        item = get_item_or_404(db, team_id, item_id)
        data = payload.model_dump(exclude_unset=True)
        _check_player_ids(get_team_or_404(db, team_id), data)
        for field, value in _to_columns(data).items():
            setattr(item, field, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete(path + "/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete(team_id: int, item_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> None:
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
_add_crud_routes(
    "plays",
    TeamPlay,
    TeamPlayCreate,
    TeamPlayUpdate,
    TeamPlayOut,
    "Play not found",
    read_dependencies=[Depends(require_team_member)],
)


@router.put("/teams/{team_id}/plays/order", response_model=list[TeamPlayOut])
def reorder_plays(team_id: int, ids: list[int], db: DbSession, _admin_id: RequireTeamAdmin):
    team = get_team_or_404(db, team_id)
    if sorted(ids) != sorted(p.id for p in team.plays):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ids must be exactly this team's plays"
        )
    by_id = {p.id: p for p in team.plays}
    for index, play_id in enumerate(ids):
        by_id[play_id].sort_order = index
    db.commit()
    db.refresh(team)
    return list(team.plays)
