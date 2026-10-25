from typing import TYPE_CHECKING

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.club import Club
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
    hidden_from_home: Mapped[bool] = mapped_column(default=False, server_default=false())

    team: Mapped["Team"] = relationship(back_populates="images")


class _PostColumns:
    """Columns shared by team and club posts."""

    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    body: Mapped[str] = mapped_column(Text)
    body_en: Mapped[str | None] = mapped_column(Text, default=None)
    pinned: Mapped[bool] = mapped_column(default=False, server_default=false())
    # ponytail: NULL = never reordered, sorts first (after pinned), so a new post lands on top without max+1.
    sort_order: Mapped[int | None] = mapped_column(default=None)


class TeamPost(_PostColumns, Base):
    __tablename__ = "team_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))

    team: Mapped["Team"] = relationship(back_populates="posts")


class ClubPost(_PostColumns, Base):
    __tablename__ = "club_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey("clubs.id", ondelete="CASCADE"))

    club: Mapped["Club"] = relationship(back_populates="posts")


class TeamPlay(Base):
    """A team-private play: an uploaded file (image/GIF/MP4/PDF) or an external link. Member-only reads (#439)."""

    __tablename__ = "team_plays"
    __table_args__ = (CheckConstraint("(file_url IS NULL) <> (url IS NULL)", name="ck_team_plays_one_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    title: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    file_url: Mapped[str | None] = mapped_column(String(500), default=None)
    url: Mapped[str | None] = mapped_column(String(500), default=None)
    # ponytail: NULL = never reordered, sorts last, so create needn't compute max+1.
    sort_order: Mapped[int | None] = mapped_column(default=None)

    team: Mapped["Team"] = relationship(back_populates="plays")
