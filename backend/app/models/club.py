from sqlalchemy import String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base


class Club(Base):
    """An ibasketball club. Teams and memberships reference it by `name` (FK, ON UPDATE CASCADE),
    so a rename keeps every team and club-admin grant attached."""

    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    name_en: Mapped[str | None] = mapped_column(String(120), default=None)
    ibasketball_url: Mapped[str | None] = mapped_column(String(500), unique=True, default=None)


def get_or_create_club(db: Session, name: str) -> Club:
    """Clubs are keyed by name — shared by admin team entry and the games scraper."""
    name = name.strip()
    club = db.scalar(select(Club).where(Club.name == name))
    if club is None:
        club = Club(name=name)
        db.add(club)
        db.flush()
    return club
