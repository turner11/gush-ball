from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class League(Base):
    """An ibasketball league in the current season. Thin, like Opponent. Teams link to it through
    `Team.ibasketball_league_url == League.url`, with no FK."""

    __tablename__ = "leagues"

    id: Mapped[int] = mapped_column(primary_key=True)
    ibasketball_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(String(120))
    url: Mapped[str] = mapped_column(String(500))  # the API `link`, verbatim
    season: Mapped[int]  # start year: 2026 for "2026-2027"
