from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StandingRow(Base):
    """One team's row in a league standings table.

    Flat, no historical snapshots, keyed by (league_name, team_name) so the
    Phase 2 scraper can later upsert into this same table. team_name is free
    text, not a FK to Team -- most rows have no other record in this system
    (same reasoning as Opponent, per CLAUDE.md's domain model).
    """

    __tablename__ = "standing_rows"
    __table_args__ = (UniqueConstraint("league_name", "team_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    league_name: Mapped[str] = mapped_column(String(120))
    team_name: Mapped[str] = mapped_column(String(120))
    rank: Mapped[int] = mapped_column(Integer)
    played: Mapped[int] = mapped_column(Integer)
    won: Mapped[int] = mapped_column(Integer)
    lost: Mapped[int] = mapped_column(Integer)
    points_for: Mapped[int] = mapped_column(Integer)
    points_against: Mapped[int] = mapped_column(Integer)
    points: Mapped[int] = mapped_column(Integer)
    source_url: Mapped[str | None] = mapped_column(String(500), default=None)
