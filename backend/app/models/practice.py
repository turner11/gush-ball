from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.team import Team


class Practice(Base):
    """One practice instance. A weekly series is many rows; there is no series id (#440)."""

    __tablename__ = "practices"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    starts_at: Mapped[datetime]  # naive Israel wall-clock, like Game.scheduled_at
    duration_minutes: Mapped[int] = mapped_column(default=90)
    location: Mapped[str | None] = mapped_column(String(300), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    cancelled: Mapped[bool] = mapped_column(default=False, server_default=false())

    team: Mapped["Team"] = relationship(back_populates="practices")
