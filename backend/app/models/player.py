from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.team import Team


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str | None] = mapped_column(String(120), default=None)
    jersey_number: Mapped[int | None] = mapped_column(default=None)
    source_url: Mapped[str | None] = mapped_column(String(500), default=None)
    birth_date: Mapped[date | None] = mapped_column(default=None)
    is_coach: Mapped[bool] = mapped_column(default=False, server_default=false())  # a coach: no jersey, listed first
    # player page fetched once for a DOB; scrape bookkeeping, never in the API
    birth_date_checked: Mapped[bool] = mapped_column(default=False, server_default=false())
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"), index=True, default=None)

    team: Mapped["Team"] = relationship(back_populates="players")
    images: Mapped[list["PlayerImage"]] = relationship(
        back_populates="player", cascade="all, delete-orphan", order_by="PlayerImage.id"
    )
    videos: Mapped[list["PlayerVideo"]] = relationship(
        back_populates="player", cascade="all, delete-orphan", order_by="PlayerVideo.id"
    )


class PlayerImage(Base):
    __tablename__ = "player_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"))
    url: Mapped[str] = mapped_column(String(500))
    # Face focal point (CSS %) and zoom (>= 1) for the round avatar; NULL = not analysed yet.
    focus_x: Mapped[float | None] = mapped_column(default=None)
    focus_y: Mapped[float | None] = mapped_column(default=None)
    zoom: Mapped[float | None] = mapped_column(default=None)
    # Square face-framed copy for the round avatar (#568); NULL = not made yet; equals `url` when no copy could be made.
    avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)

    player: Mapped["Player"] = relationship(back_populates="images")


class PlayerVideo(Base):
    """A YouTube link the player (or a team admin) attached to the player's own page."""

    __tablename__ = "player_videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"))
    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    url: Mapped[str] = mapped_column(String(500))

    player: Mapped["Player"] = relationship(back_populates="videos")
