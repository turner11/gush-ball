import enum
from datetime import datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from sqlalchemy import (
    JSON,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    and_,
    exists,
    false,
    or_,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.db import Base
from app.models.game_scorer import GameScorer
from app.models.lineup_snapshot import LineupSnapshot

if TYPE_CHECKING:
    from app.models.opponent import Opponent
    from app.models.team import Team


def _israel_now() -> datetime:
    """Naive Israel wall time, the same clock as Game.scheduled_at. Per call, never at import."""
    return datetime.now(ZoneInfo("Asia/Jerusalem")).replace(tzinfo=None)


class GameStatus(enum.Enum):
    SCHEDULED = "scheduled"
    FINAL = "final"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"


class Game(Base):
    __tablename__ = "games"
    # Per team, not global: a derby (one event, two club teams) is one row per side.
    __table_args__ = (UniqueConstraint("team_id", "source_event_id", name="uq_games_team_source_event"),)

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
    source_event_id: Mapped[int | None] = mapped_column(default=None)
    is_scraped: Mapped[bool] = mapped_column(default=False, server_default=false())
    needs_review: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_manually_overridden: Mapped[bool] = mapped_column(default=False, server_default=false())
    # #620: an unplayed scraped game whose event left the feed; it waits in the review queue.
    missing_from_source: Mapped[bool] = mapped_column(default=False, server_default=false())

    # #16: pending scraped diff for an overridden game (fields that differ from the
    # source, in GameUpdate shape) + whether the admin dismissed it. none_as_null=True
    # is required so "no suggestion" round-trips as SQL NULL, not JSON 'null'.
    scrape_suggestion: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), default=None)
    scrape_suggestion_dismissed: Mapped[bool] = mapped_column(default=False, server_default=false())

    # Not a scrape field: setting it never flags an override. Sheet holding BBStats snapshots.
    stats_url: Mapped[str | None] = mapped_column(String(500), default=None)
    # Raw rows typed on the site, in sheet column order (lineups.STATS_HEADERS); emptied when a sheet is
    # loaded. lineup_snapshots are derived from them.
    stats_rows: Mapped[list[list[str]]] = mapped_column(JSON, default=list, server_default="[]")
    # Admin content, not scrape fields: editing them never flags an override.
    # ponytail: whole-list JSON like Club.about_images (#451); tables only if items need ids or tagging.
    videos: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    images: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    # ORM cascade too: delete_game uses db.delete and SQLite tests don't enforce FKs.
    lineup_snapshots: Mapped[list["LineupSnapshot"]] = relationship(cascade="all, delete-orphan")
    scorers: Mapped[list["GameScorer"]] = relationship(
        cascade="all, delete-orphan", order_by="(GameScorer.points.desc(), GameScorer.id)"
    )

    @hybrid_property
    def is_public(self) -> bool:
        """Visible to anonymous fans: approved, and not a ghost whose date has passed (#620)."""
        return not self.needs_review and not (self.missing_from_source and self.scheduled_at < _israel_now())

    @is_public.inplace.expression
    @classmethod
    def _is_public_expression(cls):
        return and_(
            cls.needs_review.is_(False),
            or_(cls.missing_from_source.is_(False), cls.scheduled_at >= _israel_now()),
        )

    team: Mapped["Team"] = relationship(back_populates="games")
    opponent: Mapped["Opponent"] = relationship()
