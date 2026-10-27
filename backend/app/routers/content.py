"""CRUD for a team's five content resources (links/videos/images/posts/plays), plus a club's posts and images.

The tables stay separate (see CLAUDE.md), but their routes are identical apart from the
schemas, so they're registered once per resource by `_add_crud_routes` below. Plays' list is
member-only (#439); the other lists are public. Posts and plays are reorderable via `PUT .../order`.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from html import unescape
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    HttpUrl,
    StringConstraints,
    model_validator,
)
from sqlalchemy.orm import Session

from app.db import Base
from app.deps import (
    DbSession,
    get_club_or_404,
    get_team_or_404,
    require_club_admin,
    require_team_admin,
    require_team_member,
)
from app.models import ClubImage, ClubPost, TeamImage, TeamLink, TeamPlay, TeamPost, TeamVideo

router = APIRouter(tags=["content"])


@dataclass(frozen=True)
class _Owner:
    """What a content row belongs to: routes live at /{prefix}s/{prefix_id}/<resource>."""

    prefix: str
    get_or_404: Callable
    require_admin: Callable

    @property
    def fk(self) -> str:
        return f"{self.prefix}_id"


TEAM = _Owner("team", get_team_or_404, require_team_admin)
CLUB = _Owner("club", get_club_or_404, require_club_admin)


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


class TeamImageCreate(TitledUrlCreate):
    hidden_from_home: bool = False


class TeamImageUpdate(TitledUrlUpdate):
    hidden_from_home: bool = None  # null -> 422, like TeamPostUpdate.pinned


class TeamImageOut(TitledUrlOut):
    hidden_from_home: bool
    created_at: datetime | None


PostBody = Annotated[str, StringConstraints(max_length=20000)]
Notes = Annotated[str, StringConstraints(max_length=2000)]

_IFRAME_SRC = re.compile(r"""<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)


def _iframe_src(value):
    """Embed code pasted as a play link: keep only the iframe src (never store markup)."""
    if not isinstance(value, str) or not value.strip().startswith("<"):
        return value
    match = _IFRAME_SRC.search(value)
    if not match:
        raise ValueError("Paste a link or an <iframe> embed code")
    return unescape(match.group(1) or match.group(2))


PlayUrl = Annotated[HttpUrl, BeforeValidator(_iframe_src)]


# Team and club posts share their schemas; `sort_order` is only ever set via `PUT .../order`.
class PostCreate(BaseModel):
    title: str
    title_en: str | None = None
    body: PostBody
    body_en: PostBody | None = None
    pinned: bool = False


class PostUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    body: PostBody = None
    body_en: PostBody | None = None
    pinned: bool = None


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    title_en: str | None
    body: str
    body_en: str | None
    pinned: bool


class TeamPostCreate(PostCreate):
    game_id: int | None = None
    image_url: HttpUrl | None = None
    expires_on: date | None = None


class TeamPostUpdate(PostUpdate):
    game_id: int | None = None  # null clears the link
    image_url: HttpUrl | None = None  # null clears the background
    expires_on: date | None = None  # null clears


class TeamPostOut(PostOut):
    team_id: int
    game_id: int | None
    image_url: str | None
    expires_on: date | None
    created_at: datetime | None


class ClubPostOut(PostOut):
    club_id: int


# A club's images have no player tags (players belong to teams) and no home slideshow flag.
class ClubImageCreate(BaseModel):
    title: str
    title_en: str | None = None
    url: HttpUrl


class ClubImageUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    url: HttpUrl = None


class ClubImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    title: str
    title_en: str | None
    url: str


class TeamPlayCreate(BaseModel):
    title: str
    title_en: str | None = None
    notes: Notes | None = None
    file_url: HttpUrl | None = None
    url: PlayUrl | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self):
        if (self.file_url is None) == (self.url is None):
            raise ValueError("Provide exactly one of file_url or url")
        return self


class TeamPlayUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    title: str = None
    title_en: str | None = None
    notes: Notes | None = None
    file_url: HttpUrl | None = None
    url: PlayUrl | None = None

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
    for key in ("url", "file_url", "image_url"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


def _check_player_ids(team, data: dict) -> None:
    # team.players includes soft-deleted rows, so already-tagged removed players stay valid.
    if "player_ids" in data and not set(data["player_ids"]) <= {p.id for p in team.players}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown player_ids"
        )


def _check_game_id(team, data: dict) -> None:
    if data.get("game_id") is not None and data["game_id"] not in {g.id for g in team.games}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown game_id")


def _add_crud_routes(
    resource: str,
    model: type[Base],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    out_schema: type[BaseModel],
    not_found: str,
    *,
    owner: _Owner = TEAM,
    reorderable: bool = False,
    read_dependencies: Sequence = (),
) -> None:
    path = f"/{owner.prefix}s/{{{owner.fk}}}/{resource}"
    OwnerId = Annotated[int, Path(alias=owner.fk)]
    write = [Depends(owner.require_admin)]

    def get_item_or_404(db: Session, owner_id: int, item_id: int):
        item = db.get(model, item_id)
        if item is None or getattr(item, owner.fk) != owner_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
        return item

    @router.post(path, response_model=out_schema, status_code=status.HTTP_201_CREATED, dependencies=write)
    def create(owner_id: OwnerId, payload: create_schema, db: DbSession):
        data = payload.model_dump()
        team = owner.get_or_404(db, owner_id)
        _check_player_ids(team, data)
        _check_game_id(team, data)
        item = model(**{owner.fk: owner_id}, **_to_columns(data))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.get(path, response_model=list[out_schema], dependencies=list(read_dependencies))
    def list_items(owner_id: OwnerId, db: DbSession):
        return list(getattr(owner.get_or_404(db, owner_id), resource))

    if reorderable:

        @router.put(path + "/order", response_model=list[out_schema], dependencies=write)
        def reorder(owner_id: OwnerId, ids: list[int], db: DbSession):
            parent = owner.get_or_404(db, owner_id)
            by_id = {i.id: i for i in getattr(parent, resource)}
            if sorted(ids) != sorted(by_id):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"ids must be exactly this {owner.prefix}'s {resource}",
                )
            for index, item_id in enumerate(ids):
                by_id[item_id].sort_order = index
            db.commit()
            db.refresh(parent)
            return list(getattr(parent, resource))

    @router.patch(path + "/{item_id}", response_model=out_schema, dependencies=write)
    def update(owner_id: OwnerId, item_id: int, payload: update_schema, db: DbSession):
        item = get_item_or_404(db, owner_id, item_id)
        data = payload.model_dump(exclude_unset=True)
        team = owner.get_or_404(db, owner_id)
        _check_player_ids(team, data)
        _check_game_id(team, data)
        for field, value in _to_columns(data).items():
            setattr(item, field, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete(path + "/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=write)
    def delete(owner_id: OwnerId, item_id: int, db: DbSession) -> None:
        db.delete(get_item_or_404(db, owner_id, item_id))
        db.commit()


_add_crud_routes("links", TeamLink, TeamLinkCreate, TeamLinkUpdate, TeamLinkOut, "Link not found")
_add_crud_routes(
    "videos", TeamVideo, TitledUrlCreate, TitledUrlUpdate, TitledUrlOut, "Video not found"
)
_add_crud_routes(
    "images", TeamImage, TeamImageCreate, TeamImageUpdate, TeamImageOut, "Image not found"
)
_add_crud_routes(
    "posts", TeamPost, TeamPostCreate, TeamPostUpdate, TeamPostOut, "Post not found", reorderable=True
)
_add_crud_routes(
    "posts", ClubPost, PostCreate, PostUpdate, ClubPostOut, "Post not found", owner=CLUB, reorderable=True
)
_add_crud_routes("images", ClubImage, ClubImageCreate, ClubImageUpdate, ClubImageOut, "Image not found", owner=CLUB)
_add_crud_routes(
    "plays",
    TeamPlay,
    TeamPlayCreate,
    TeamPlayUpdate,
    TeamPlayOut,
    "Play not found",
    reorderable=True,
    read_dependencies=[Depends(require_team_member)],
)
