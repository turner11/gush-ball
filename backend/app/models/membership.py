from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Membership(Base):
    """One user's grant on one team OR one club (a Club, by its unique name); `role` is that grant's state:
    pending -> member (approved) -> admin (assigned). One column, so the states can't contradict each other."""

    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint("(team_id IS NULL) <> (club IS NULL)", name="ck_memberships_one_scope"),
        CheckConstraint("role IN ('pending','member','admin')", name="ck_memberships_role"),
        UniqueConstraint("user_id", "team_id", name="uq_memberships_user_team"),
        UniqueConstraint("user_id", "club", name="uq_memberships_user_club"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), default=None)
    club: Mapped[str | None] = mapped_column(String(120), ForeignKey("clubs.name", onupdate="CASCADE"), default=None)
    role: Mapped[str] = mapped_column(String(10))
