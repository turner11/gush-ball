from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
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
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)

    team: Mapped["Team"] = relationship(back_populates="players")
    images: Mapped[list["PlayerImage"]] = relationship(back_populates="player", cascade="all, delete-orphan")


class PlayerImage(Base):
    __tablename__ = "player_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"))
    url: Mapped[str] = mapped_column(String(500))
    # Face focal point (CSS %) and zoom (>= 1) for the round avatar; NULL = not analysed yet.
    focus_x: Mapped[float | None] = mapped_column(default=None)
    focus_y: Mapped[float | None] = mapped_column(default=None)
    zoom: Mapped[float | None] = mapped_column(default=None)

    player: Mapped["Player"] = relationship(back_populates="images")
