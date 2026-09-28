from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Opponent(Base):
    """A rival team, as seen from a scraped/entered game. Not a full Team."""

    __tablename__ = "opponents"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str | None] = mapped_column(String(120), default=None)
    logo_url: Mapped[str | None] = mapped_column(String(500), default=None)
    source_url: Mapped[str | None] = mapped_column(String(500), default=None)
