import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Enum, ForeignKey, String, Text, exists, false
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.db import Base
from app.models.lineup_snapshot import LineupSnapshot

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
    # >=1 snapshot; EXISTS in the same SELECT so game lists stay one query.
    has_stats: Mapped[bool] = column_property(
        exists().where(LineupSnapshot.game_id == id).correlate_except(LineupSnapshot)
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    opponent_id: Mapped[int] = mapped_column(ForeignKey("opponents.id"))

    is_home: Mapped[bool] = mapped_column(default=True)
    scheduled_at: Mapped[datetime]
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus), default=GameStatus.SCHEDULED)

    team_score: Mapped[int | None] = mapped_column(default=None)
    opponent_score: Mapped[int | None] = mapped_column(default=None)

    description: Mapped[str | None] = mapped_column(Text, default=None)

    # Phase 2 scrape bookkeeping (#14). All default False so manually created
    # games stay live exactly as they do today.
    source_event_id: Mapped[int | None] = mapped_column(unique=True, default=None)
    is_scraped: Mapped[bool] = mapped_column(default=False, server_default=false())
    needs_review: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_manually_overridden: Mapped[bool] = mapped_column(default=False, server_default=false())

    # #16: pending scraped diff for an overridden game (fields that differ from the
    # source, in GameUpdate shape) + whether the admin dismissed it. none_as_null=True
    # is required so "no suggestion" round-trips as SQL NULL, not JSON 'null'.
    scrape_suggestion: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), default=None)
    scrape_suggestion_dismissed: Mapped[bool] = mapped_column(default=False, server_default=false())

    # Not a scrape field: setting it never flags an override. Sheet holding BBStats snapshots.
    stats_url: Mapped[str | None] = mapped_column(String(500), default=None)
    # ORM cascade too: delete_game uses db.delete and SQLite tests don't enforce FKs.
    lineup_snapshots: Mapped[list["LineupSnapshot"]] = relationship(cascade="all, delete-orphan")

    team: Mapped["Team"] = relationship(back_populates="games")
    opponent: Mapped["Opponent"] = relationship()
