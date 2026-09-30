from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AdminUser(Base):
    """The only authenticated role. NULL team_id = full admin; set = admin of that one team only."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), default=None)
