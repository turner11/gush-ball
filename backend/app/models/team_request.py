from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TeamRequest(Base):
    """A signed-in user's ask to add an ibasketball team (#351). A row of its own, not a hidden `Team`, so no
    public query needs a "hidden" filter. Approval creates the `Team`; `club` (from the team's page) routes it to
    that club's admins, and follows a club rename like `Team.club`."""

    __tablename__ = "team_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_team_requests_status"),
        # one pending request per ibasketball team; a rejected one frees it
        Index(
            "uq_team_requests_pending_url",
            "ibasketball_team_url",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(500), default=None)
    ibasketball_team_url: Mapped[str] = mapped_column(String(500))
    ibasketball_league_url: Mapped[str] = mapped_column(String(500))
    club: Mapped[str | None] = mapped_column(String(120), ForeignKey("clubs.name", onupdate="CASCADE"), default=None)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
