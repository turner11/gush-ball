from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.content import TeamImage, TeamLink, TeamPost, TeamVideo
    from app.models.game import Game
    from app.models.player import Player


class Team(Base):
    """One of the club's own teams. Opponents are a separate, thinner model."""

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str | None] = mapped_column(String(120), default=None)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)

    primary_color: Mapped[str | None] = mapped_column(String(7), default=None)
    secondary_color: Mapped[str | None] = mapped_column(String(7), default=None)
    logo_url: Mapped[str | None] = mapped_column(String(500), default=None)

    home_court_address: Mapped[str | None] = mapped_column(String(300), default=None)

    facebook_url: Mapped[str | None] = mapped_column(String(500), default=None)
    instagram_url: Mapped[str | None] = mapped_column(String(500), default=None)
    youtube_url: Mapped[str | None] = mapped_column(String(500), default=None)
    tiktok_url: Mapped[str | None] = mapped_column(String(500), default=None)

    # Source URLs on ibasketball.co.il, used by the Phase 2 scraper.
    ibasketball_team_url: Mapped[str | None] = mapped_column(String(500), default=None)
    ibasketball_league_url: Mapped[str | None] = mapped_column(String(500), default=None)

    players: Mapped[list["Player"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    links: Mapped[list["TeamLink"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    videos: Mapped[list["TeamVideo"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    images: Mapped[list["TeamImage"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    posts: Mapped[list["TeamPost"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    games: Mapped[list["Game"]] = relationship(back_populates="team", cascade="all, delete-orphan")
