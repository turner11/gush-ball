from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.content import TeamImage, TeamLink, TeamPlay, TeamPost, TeamVideo
    from app.models.game import Game
    from app.models.player import Player
    from app.models.practice import Practice


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

    # preset key or image URL
    background: Mapped[str] = mapped_column(String(500), default="hoop-1", server_default="hoop-1")

    # A Club by its unique name; groups teams and keys club-admin scope. A rename cascades.
    club: Mapped[str | None] = mapped_column(String(120), ForeignKey("clubs.name", onupdate="CASCADE"), default=None)
    home_court_address: Mapped[str | None] = mapped_column(String(300), default=None)
    # plain text, shown on the team home when non-empty (#444)
    about: Mapped[str | None] = mapped_column(Text, default=None)
    about_en: Mapped[str | None] = mapped_column(Text, default=None)

    facebook_url: Mapped[str | None] = mapped_column(String(500), default=None)
    instagram_url: Mapped[str | None] = mapped_column(String(500), default=None)
    youtube_url: Mapped[str | None] = mapped_column(String(500), default=None)
    tiktok_url: Mapped[str | None] = mapped_column(String(500), default=None)
    twitter_url: Mapped[str | None] = mapped_column(String(500), default=None)
    wikipedia_url: Mapped[str | None] = mapped_column(String(500), default=None)

    # Source URLs on ibasketball.co.il, used by the Phase 2 scraper.
    ibasketball_team_url: Mapped[str | None] = mapped_column(String(500), default=None)
    ibasketball_league_url: Mapped[str | None] = mapped_column(String(500), default=None)
    # An admin's own league URL is never overwritten by the scraper; the current-season league it would
    # have set waits in league_url_suggestion (#352).
    league_url_overridden: Mapped[bool] = mapped_column(default=False, server_default=false())
    league_url_suggestion: Mapped[str | None] = mapped_column(String(500), default=None)

    # ponytail: latest scrape failure per team, kept until an admin dismisses it (#403); no history table.
    sync_error: Mapped[str | None] = mapped_column(Text, default=None)
    sync_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    players: Mapped[list["Player"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    links: Mapped[list["TeamLink"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    videos: Mapped[list["TeamVideo"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    images: Mapped[list["TeamImage"]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="(TeamImage.created_at.desc().nulls_last(), TeamImage.id.desc())",
    )
    posts: Mapped[list["TeamPost"]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="(TeamPost.pinned.desc(), TeamPost.sort_order.asc().nulls_first(), TeamPost.id.desc())",
    )
    plays: Mapped[list["TeamPlay"]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="(TeamPlay.sort_order.asc().nulls_last(), TeamPlay.id)",
    )
    games: Mapped[list["Game"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    practices: Mapped[list["Practice"]] = relationship(back_populates="team", cascade="all, delete-orphan")
