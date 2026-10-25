from typing import TYPE_CHECKING

from sqlalchemy import JSON, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.content import ClubPost


class Club(Base):
    """An ibasketball club. Teams and memberships reference it by `name` (FK, ON UPDATE CASCADE),
    so a rename keeps every team and club-admin grant attached."""

    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    name_en: Mapped[str | None] = mapped_column(String(120), default=None)
    ibasketball_url: Mapped[str | None] = mapped_column(String(500), unique=True, default=None)
    # shown on the club page (#451); edited as one form, so the lists are whole-list JSON
    # ponytail: whole-list JSON, saved as one form; move to club_links/club_images tables if items ever need ids or tagging
    about_title: Mapped[str | None] = mapped_column(String(200), default=None)
    about_title_en: Mapped[str | None] = mapped_column(String(200), default=None)
    about: Mapped[str | None] = mapped_column(Text, default=None)
    about_en: Mapped[str | None] = mapped_column(Text, default=None)
    about_images: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    about_links: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    # list order is the display order; no _en keys (JSON items gain them without a migration)
    officials: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")

    posts: Mapped[list["ClubPost"]] = relationship(
        back_populates="club",
        cascade="all, delete-orphan",
        order_by="(ClubPost.pinned.desc(), ClubPost.sort_order.asc().nulls_first(), ClubPost.id.desc())",
    )


def get_or_create_club(db: Session, name: str) -> Club:
    """Clubs are keyed by name — shared by admin team entry and the games scraper."""
    name = name.strip()
    club = db.scalar(select(Club).where(Club.name == name))
    if club is None:
        club = Club(name=name)
        db.add(club)
        db.flush()
    return club
