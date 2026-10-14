import sqlalchemy as sa
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.membership import Membership


class AdminUser(Base):
    """Every login account (the table keeps its historic name). Admin rights come only from `is_full_admin`
    (set by the migration and scripts/create_admin.py, never by an API) or `role='admin'` memberships."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(
        String(254), unique=True, index=True, default=None
    )  # lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    is_full_admin: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    memberships: Mapped[list[Membership]] = relationship(cascade="all, delete-orphan")
