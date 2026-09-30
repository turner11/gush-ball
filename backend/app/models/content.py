from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.team import Team


class TeamLink(Base):
    """An arbitrary named link shown on a team's page (not a social profile)."""

    __tablename__ = "team_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    label: Mapped[str] = mapped_column(String(120))
    label_en: Mapped[str | None] = mapped_column(String(120), default=None)
    url: Mapped[str] = mapped_column(String(500))

    team: Mapped["Team"] = relationship(back_populates="links")


class TeamVideo(Base):
    __tablename__ = "team_videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    url: Mapped[str] = mapped_column(String(500))

    # Tagged Player.ids. ponytail: JSON has no portable SQL "contains"; filter in Python, or move to
    # JSONB @> / an association table if indexed lookup is ever needed.
    player_ids: Mapped[list[int]] = mapped_column(JSON, default=list)

    team: Mapped["Team"] = relationship(back_populates="videos")


class TeamImage(Base):
    __tablename__ = "team_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    url: Mapped[str] = mapped_column(String(500))

    # Tagged Player.ids. ponytail: JSON has no portable SQL "contains"; filter in Python, or move to
    # JSONB @> / an association table if indexed lookup is ever needed.
    player_ids: Mapped[list[int]] = mapped_column(JSON, default=list)

    team: Mapped["Team"] = relationship(back_populates="images")


class TeamPost(Base):
    __tablename__ = "team_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    body: Mapped[str] = mapped_column(Text)
    body_en: Mapped[str | None] = mapped_column(Text, default=None)

    team: Mapped["Team"] = relationship(back_populates="posts")
