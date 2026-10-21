from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.player import Player


class GameScorer(Base):
    """One player's points in one game, entered in-site by that team's admins (#441)."""

    __tablename__ = "game_scorers"
    __table_args__ = (UniqueConstraint("game_id", "player_id", name="uq_game_scorers_game_player"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"))
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"))
    points: Mapped[int]

    # joined: names load with the scorers, and team deletion orders scorer deletes before player deletes
    player: Mapped[Player] = relationship(lazy="joined")
