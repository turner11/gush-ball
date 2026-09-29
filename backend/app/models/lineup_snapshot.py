from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LineupSnapshot(Base):
    """One raw per-snapshot row from BBStats' enriched DataFrame: who was on court and the
    points for/against over the `elapsed` minutes that followed. Lineup stats are computed
    on read from these rows (see routers/lineups.py), never stored."""

    __tablename__ = "lineup_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    players: Mapped[list[int]] = mapped_column(JSON)  # 5 jersey numbers
    elapsed: Mapped[float]  # minutes
    offense_diff: Mapped[int]
    defence_diff: Mapped[int]
    # ponytail: quarter/time columns left out on purpose; lineup stats don't need them
