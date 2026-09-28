from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, HttpUrl
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Team, TeamImage, TeamLink, TeamPost, TeamVideo

router = APIRouter(tags=["content"])

DbSession = Annotated[Session, Depends(get_db)]
RequireAdmin = Annotated[int, Depends(require_admin)]


def _get_team_or_404(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


# --- links ---------------------------------------------------------------


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


def _get_team_link_or_404(db: Session, team_id: int, link_id: int) -> TeamLink:
    link = db.get(TeamLink, link_id)
    if link is None or link.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return link


@router.post(
    "/teams/{team_id}/links", response_model=TeamLinkOut, status_code=status.HTTP_201_CREATED
)
def create_link(
    team_id: int, payload: TeamLinkCreate, db: DbSession, _admin_id: RequireAdmin
) -> TeamLink:
    _get_team_or_404(db, team_id)
    data = payload.model_dump()
    data["url"] = str(data["url"])
    link = TeamLink(team_id=team_id, **data)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get("/teams/{team_id}/links", response_model=list[TeamLinkOut])
def list_links(team_id: int, db: DbSession) -> list[TeamLink]:
    team = _get_team_or_404(db, team_id)
    return list(team.links)


@router.patch("/teams/{team_id}/links/{link_id}", response_model=TeamLinkOut)
def update_link(
    team_id: int, link_id: int, payload: TeamLinkUpdate, db: DbSession, _admin_id: RequireAdmin
) -> TeamLink:
    link = _get_team_link_or_404(db, team_id, link_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, field, str(value) if field == "url" else value)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/teams/{team_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(team_id: int, link_id: int, db: DbSession, _admin_id: RequireAdmin) -> None:
    link = _get_team_link_or_404(db, team_id, link_id)
    db.delete(link)
    db.commit()


# --- videos ----------------------------------------------------------------


class TeamVideoCreate(BaseModel):
    title: str
    title_en: str | None = None
    url: HttpUrl


class TeamVideoUpdate(BaseModel):
    title: str | None = None
    title_en: str | None = None
    url: HttpUrl | None = None


class TeamVideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    url: str


def _get_team_video_or_404(db: Session, team_id: int, video_id: int) -> TeamVideo:
    video = db.get(TeamVideo, video_id)
    if video is None or video.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video


@router.post(
    "/teams/{team_id}/videos", response_model=TeamVideoOut, status_code=status.HTTP_201_CREATED
)
def create_video(
    team_id: int, payload: TeamVideoCreate, db: DbSession, _admin_id: RequireAdmin
) -> TeamVideo:
    _get_team_or_404(db, team_id)
    data = payload.model_dump()
    data["url"] = str(data["url"])
    video = TeamVideo(team_id=team_id, **data)
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


@router.get("/teams/{team_id}/videos", response_model=list[TeamVideoOut])
def list_videos(team_id: int, db: DbSession) -> list[TeamVideo]:
    team = _get_team_or_404(db, team_id)
    return list(team.videos)


@router.patch("/teams/{team_id}/videos/{video_id}", response_model=TeamVideoOut)
def update_video(
    team_id: int, video_id: int, payload: TeamVideoUpdate, db: DbSession, _admin_id: RequireAdmin
) -> TeamVideo:
    video = _get_team_video_or_404(db, team_id, video_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(video, field, str(value) if field == "url" else value)
    db.commit()
    db.refresh(video)
    return video


@router.delete("/teams/{team_id}/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(team_id: int, video_id: int, db: DbSession, _admin_id: RequireAdmin) -> None:
    video = _get_team_video_or_404(db, team_id, video_id)
    db.delete(video)
    db.commit()


# --- images ------------------------------------------------------------------


class TeamImageCreate(BaseModel):
    title: str
    title_en: str | None = None
    url: HttpUrl


class TeamImageUpdate(BaseModel):
    title: str | None = None
    title_en: str | None = None
    url: HttpUrl | None = None


class TeamImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_id: int
    title: str
    title_en: str | None
    url: str


def _get_team_image_or_404(db: Session, team_id: int, image_id: int) -> TeamImage:
    image = db.get(TeamImage, image_id)
    if image is None or image.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return image


@router.post(
    "/teams/{team_id}/images", response_model=TeamImageOut, status_code=status.HTTP_201_CREATED
)
def create_image(
    team_id: int, payload: TeamImageCreate, db: DbSession, _admin_id: RequireAdmin
) -> TeamImage:
    _get_team_or_404(db, team_id)
    data = payload.model_dump()
    data["url"] = str(data["url"])
    image = TeamImage(team_id=team_id, **data)
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@router.get("/teams/{team_id}/images", response_model=list[TeamImageOut])
def list_images(team_id: int, db: DbSession) -> list[TeamImage]:
    team = _get_team_or_404(db, team_id)
    return list(team.images)


@router.patch("/teams/{team_id}/images/{image_id}", response_model=TeamImageOut)
def update_image(
    team_id: int, image_id: int, payload: TeamImageUpdate, db: DbSession, _admin_id: RequireAdmin
) -> TeamImage:
    image = _get_team_image_or_404(db, team_id, image_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(image, field, str(value) if field == "url" else value)
    db.commit()
    db.refresh(image)
    return image


@router.delete("/teams/{team_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(team_id: int, image_id: int, db: DbSession, _admin_id: RequireAdmin) -> None:
    image = _get_team_image_or_404(db, team_id, image_id)
    db.delete(image)
    db.commit()


# --- posts -------------------------------------------------------------------


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


def _get_team_post_or_404(db: Session, team_id: int, post_id: int) -> TeamPost:
    post = db.get(TeamPost, post_id)
    if post is None or post.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@router.post(
    "/teams/{team_id}/posts", response_model=TeamPostOut, status_code=status.HTTP_201_CREATED
)
def create_post(
    team_id: int, payload: TeamPostCreate, db: DbSession, _admin_id: RequireAdmin
) -> TeamPost:
    _get_team_or_404(db, team_id)
    post = TeamPost(team_id=team_id, **payload.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.get("/teams/{team_id}/posts", response_model=list[TeamPostOut])
def list_posts(team_id: int, db: DbSession) -> list[TeamPost]:
    team = _get_team_or_404(db, team_id)
    return list(team.posts)


@router.patch("/teams/{team_id}/posts/{post_id}", response_model=TeamPostOut)
def update_post(
    team_id: int, post_id: int, payload: TeamPostUpdate, db: DbSession, _admin_id: RequireAdmin
) -> TeamPost:
    post = _get_team_post_or_404(db, team_id, post_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(post, field, value)
    db.commit()
    db.refresh(post)
    return post


@router.delete("/teams/{team_id}/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(team_id: int, post_id: int, db: DbSession, _admin_id: RequireAdmin) -> None:
    post = _get_team_post_or_404(db, team_id, post_id)
    db.delete(post)
    db.commit()
