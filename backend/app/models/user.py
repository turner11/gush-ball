from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AdminUser(Base):
    """The only authenticated role, in three scopes: team_id set = that one team; club set = every team with that
    Team.club; both NULL = full admin."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True, default=None)  # lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), default=None)
    club: Mapped[str | None] = mapped_column(String(120), default=None)

    @property
    def is_full_admin(self) -> bool:
        return self.team_id is None and self.club is None
