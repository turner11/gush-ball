import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.opponent import Opponent
    from app.models.team import Team


class GameStatus(enum.Enum):
    SCHEDULED = "scheduled"
    FINAL = "final"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    opponent_id: Mapped[int] = mapped_column(ForeignKey("opponents.id"))

    is_home: Mapped[bool] = mapped_column(default=True)
    scheduled_at: Mapped[datetime]
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus), default=GameStatus.SCHEDULED)

    team_score: Mapped[int | None] = mapped_column(default=None)
    opponent_score: Mapped[int | None] = mapped_column(default=None)

    description: Mapped[str | None] = mapped_column(Text, default=None)

    team: Mapped["Team"] = relationship(back_populates="games")
    opponent: Mapped["Opponent"] = relationship()
