import re
from datetime import UTC, date, datetime
from typing import Annotated
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status
from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    HttpUrl,
    PastDate,
    StringConstraints,
    UrlConstraints,
    computed_field,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import (
    DbSession,
    OptionalUser,
    RequireTeamAdmin,
    RequireUser,
    can_write_team,
    check_player_self_or_team_admin,
    check_team_scope,
    covering_grant,
    get_team_or_404,
    has_covering_grant,
)
from app.models import AdminUser, Player, PlayerImage, PlayerVideo, Team

router = APIRouter(tags=["players"])

PlayerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]

_YOUTUBE_HOSTS = {"youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com"}
_YOUTUBE_ID = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_PLAYER_VIDEOS = 20


def _require_youtube(url: HttpUrl) -> HttpUrl:
    # Shown embedded on a public page: exact host set (not endswith) and an id that VideoCard.vue can embed.
    if url.host == "youtu.be":
        video_id = (url.path or "").lstrip("/")
    elif url.host in _YOUTUBE_HOSTS and url.path == "/watch":
        video_id = parse_qs(url.query or "").get("v", [""])[0]
    elif url.host in _YOUTUBE_HOSTS and (m := re.fullmatch(r"/(?:shorts|embed)/([^/]+)", url.path or "")):
        video_id = m.group(1)
    else:
        video_id = ""
    if not _YOUTUBE_ID.fullmatch(video_id):
        raise ValueError(f"not a YouTube video URL: {url}")
    return url


YouTubeUrl = Annotated[HttpUrl, UrlConstraints(max_length=500), AfterValidator(_require_youtube)]
VideoTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


ISRAEL = ZoneInfo("Asia/Jerusalem")
ADULT_DOB_AGE = 16  # a younger player's birth date is visible to their team's writers only


def age_on(birth: date, today: date) -> int:
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


class PlayerCreate(BaseModel):
    name: str
    name_en: str | None = None
    jersey_number: int | None = None
    birth_date: PastDate | None = None
    is_coach: bool = False


class PlayerUpdate(BaseModel):
    # omitted = unchanged; null -> 422 (NOT NULL column)
    name: PlayerName = None
    name_en: PlayerName | None = None
    jersey_number: int | None = None
    birth_date: PastDate | None = None
    is_coach: bool = None  # omitted = unchanged; null -> 422 (NOT NULL column); team admins only
    user_id: int | None = None  # the linked account; omitted = unchanged, null = unlink (team admins only)


class PlayerImageCreate(BaseModel):
    url: HttpUrl


class PlayerImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    player_id: int
    url: str
    focus_x: float | None
    focus_y: float | None
    zoom: float | None


class PlayerVideoCreate(BaseModel):
    title: VideoTitle
    title_en: VideoTitle | None = None
    url: YouTubeUrl


class PlayerVideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    player_id: int
    title: str
    title_en: str | None
    url: str


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    name: str
    name_en: str | None
    jersey_number: int | None
    is_coach: bool
    birth_date: date | None
    minor: bool = False  # under ADULT_DOB_AGE; plain field so it survives birth_date being nulled
    images: list[PlayerImageOut]
    videos: list[PlayerVideoOut]

    @computed_field
    @property
    def age(self) -> int | None:
        return age_on(self.birth_date, datetime.now(ISRAEL).date()) if self.birth_date else None


def _roster_order(player: Player) -> tuple:
    # coaches first, then numbered, then by name; mirrored by byRosterOrder in frontend/src/lib/players.js
    return (not player.is_coach, player.jersey_number is None, player.jersey_number or 0, player.name.casefold(), player.id)


def _drop_coach_jersey(player: Player) -> None:
    # a coach never has a jersey, so lineups, scorers and jersey sorting cannot pick one up
    if player.is_coach:
        player.jersey_number = None


def _public_player(player: Player, show_birth_date: bool) -> PlayerOut:
    out = PlayerOut.model_validate(player)
    out.minor = out.age is not None and out.age < ADULT_DOB_AGE
    if out.minor and not show_birth_date:
        out.birth_date = None  # the computed age follows
    return out


class LinkableUserOut(BaseModel):
    id: int
    username: str
    display_name: str


class PlayerLinkOut(BaseModel):
    player_id: int
    user_id: int
    username: str
    display_name: str


def _check_linkable(db: Session, team: Team, user_id: int) -> None:
    if not has_covering_grant(db, user_id, team):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"User {user_id} has no member/admin grant on team {team.id}",
        )


def _get_team_player_or_404(db: Session, team_id: int, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


def _get_player_or_404(db: Session, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


@router.post(
    "/teams/{team_id}/players", response_model=PlayerOut, status_code=status.HTTP_201_CREATED
)
def create_player(
    team_id: int, payload: PlayerCreate, db: DbSession, _admin_id: RequireTeamAdmin
) -> PlayerOut:
    get_team_or_404(db, team_id)
    player = Player(team_id=team_id, **payload.model_dump())
    _drop_coach_jersey(player)
    db.add(player)
    db.commit()
    db.refresh(player)
    return _public_player(player, True)


@router.get("/teams/{team_id}/players", response_model=list[PlayerOut])
def list_players(team_id: int, db: DbSession, user: OptionalUser) -> list[PlayerOut]:
    team = get_team_or_404(db, team_id)
    show = can_write_team(db, user, team_id)
    return [_public_player(p, show) for p in sorted(team.players, key=_roster_order) if p.deleted_at is None]


# before the /{player_id} routes
@router.get("/teams/{team_id}/players/linkable-users", response_model=list[LinkableUserOut])
def list_linkable_users(team_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> list[LinkableUserOut]:
    """Accounts that may be linked to a player of this team. No emails."""
    team = get_team_or_404(db, team_id)
    rows = db.execute(
        select(AdminUser.id, AdminUser.username, AdminUser.display_name)
        .where(covering_grant(team))
        .order_by(AdminUser.username)
    )
    return [LinkableUserOut(id=i, username=u, display_name=d) for i, u, d in rows]


@router.get("/teams/{team_id}/players/links", response_model=list[PlayerLinkOut])
def list_player_links(team_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> list[PlayerLinkOut]:
    """Which roster rows are linked to which account; admin-only so the public roster never reveals it."""
    rows = db.execute(
        select(Player.id, AdminUser.id, AdminUser.username, AdminUser.display_name)
        .join(AdminUser, Player.user_id == AdminUser.id)
        .where(Player.team_id == team_id, Player.deleted_at.is_(None))
    )
    return [PlayerLinkOut(player_id=p, user_id=u, username=n, display_name=d) for p, u, n, d in rows]


@router.patch("/teams/{team_id}/players/{player_id}", response_model=PlayerOut)
def update_player(
    team_id: int,
    player_id: int,
    payload: PlayerUpdate,
    db: DbSession,
    user: RequireUser,
) -> PlayerOut:
    try:
        player = _get_team_player_or_404(db, team_id, player_id)
    except HTTPException:
        check_team_scope(db, user, team_id)  # outsiders get 403, so a missing id is no existence oracle
        raise
    updates = payload.model_dump(exclude_unset=True)
    check_player_self_or_team_admin(db, user, player, set(updates))
    # validate only on change: a user who later lost their grant must not block re-saving the player
    if updates.get("user_id") is not None and updates["user_id"] != player.user_id:
        _check_linkable(db, get_team_or_404(db, team_id), updates["user_id"])
    for field, value in updates.items():
        setattr(player, field, value)
    _drop_coach_jersey(player)
    db.commit()
    db.refresh(player)
    return _public_player(player, can_write_team(db, user, team_id))


@router.delete("/teams/{team_id}/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    team_id: int, player_id: int, db: DbSession, _admin_id: RequireTeamAdmin
) -> None:
    player = _get_team_player_or_404(db, team_id, player_id)
    player.deleted_at = datetime.now(UTC)
    db.commit()


@router.get("/teams/{team_id}/players/deleted", response_model=list[PlayerOut])
def list_deleted_players(team_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> list[PlayerOut]:
    team = get_team_or_404(db, team_id)
    return [_public_player(p, True) for p in sorted(team.players, key=_roster_order) if p.deleted_at is not None]


@router.post("/teams/{team_id}/players/{player_id}/restore", response_model=PlayerOut)
def restore_player(team_id: int, player_id: int, db: DbSession, _admin_id: RequireTeamAdmin) -> PlayerOut:
    player = _get_team_player_or_404(db, team_id, player_id)
    player.deleted_at = None
    db.commit()
    db.refresh(player)
    return _public_player(player, True)


@router.get("/players/{player_id}", response_model=PlayerOut)
def get_player(player_id: int, db: DbSession, user: OptionalUser) -> PlayerOut:
    player = _get_player_or_404(db, player_id)
    if player.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return _public_player(player, can_write_team(db, user, player.team_id))


@router.post(
    "/players/{player_id}/images",
    response_model=PlayerImageOut,
    status_code=status.HTTP_201_CREATED,
)
def add_player_image(
    player_id: int, payload: PlayerImageCreate, db: DbSession, user: RequireUser
) -> PlayerImage:
    player = _get_player_or_404(db, player_id)
    check_player_self_or_team_admin(db, user, player)
    # a self-editor's photo is public (CSP img-src *), so only our own storage is allowed; admins may paste any URL
    prefix = settings.object_storage_public_url.rstrip("/")
    if not can_write_team(db, user, player.team_id) and not (prefix and str(payload.url).startswith(prefix + "/")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Upload the photo instead of linking a URL")
    image = PlayerImage(player_id=player_id, url=str(payload.url))
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.delete(
    "/players/{player_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_player_image(
    player_id: int, image_id: int, db: DbSession, user: RequireUser
) -> None:
    check_player_self_or_team_admin(db, user, _get_player_or_404(db, player_id))
    image = db.get(PlayerImage, image_id)
    if image is None or image.player_id != player_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    db.delete(image)
    db.commit()


@router.post(
    "/players/{player_id}/videos",
    response_model=PlayerVideoOut,
    status_code=status.HTTP_201_CREATED,
)
def add_player_video(
    player_id: int, payload: PlayerVideoCreate, db: DbSession, user: RequireUser
) -> PlayerVideo:
    player = _get_player_or_404(db, player_id)
    check_player_self_or_team_admin(db, user, player)
    if len(player.videos) >= MAX_PLAYER_VIDEOS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"אפשר להוסיף עד {MAX_PLAYER_VIDEOS} סרטונים לשחקן")
    video = PlayerVideo(player_id=player_id, title=payload.title, title_en=payload.title_en, url=str(payload.url))
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


@router.delete(
    "/players/{player_id}/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_player_video(
    player_id: int, video_id: int, db: DbSession, user: RequireUser
) -> None:
    check_player_self_or_team_admin(db, user, _get_player_or_404(db, player_id))
    video = db.get(PlayerVideo, video_id)
    if video is None or video.player_id != player_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    db.delete(video)
    db.commit()
