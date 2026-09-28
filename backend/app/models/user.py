from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AdminUser(Base):
    """The single admin role. No fan/player accounts exist in this system."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
