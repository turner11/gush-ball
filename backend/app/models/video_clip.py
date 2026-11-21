from typing import TYPE_CHECKING

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.player import Player


class VideoClip(Base):
    """A cut of any video (or a text note when `source_url` is null) owned by a team, optionally a game (#682).

    The single source of truth for game highlights (H, public), game briefing (B, team members) and player
    briefing (P, tagged players + admins + coach). A personal highlight (A) is public on the tagged players' pages only (#696)."""

    __tablename__ = "video_clips"
    __table_args__ = (
        CheckConstraint(
            "game_id IS NOT NULL OR NOT (is_highlight OR in_game_briefing)", name="ck_video_clips_game_destinations"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True, default=None)
    source_url: Mapped[str | None] = mapped_column(String(500), default=None)
    start: Mapped[int | None] = mapped_column(default=None)  # seconds
    end: Mapped[int | None] = mapped_column(default=None)
    section: Mapped[str | None] = mapped_column(String(200), default=None)
    note: Mapped[str | None] = mapped_column(Text, default=None)
    is_highlight: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_player_highlight: Mapped[bool] = mapped_column(default=False, server_default=false())
    in_game_briefing: Mapped[bool] = mapped_column(default=False, server_default=false())
    in_player_briefing: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Tagged Player.ids. ponytail: JSON has no portable SQL "contains"; filter in Python, or move to
    # JSONB @> / an association table if indexed lookup is ever needed.
    player_ids: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]")

    game: Mapped["Game | None"] = relationship(back_populates="clips")


def timeline(clips: list[VideoClip], video_urls: list[str] | tuple[str, ...] = ()) -> list[VideoClip]:
    """Game order: text notes first, then by source (the game's `video_urls` order, unknown sources last), then start."""
    order = {url: i for i, url in enumerate(video_urls)}

    def key(c: VideoClip) -> tuple:
        if c.source_url is None:
            return (0, 0, "", 0, c.id or 0)
        return (1, order.get(c.source_url, len(order)), c.source_url, c.start or 0, c.id or 0)

    return sorted(clips, key=key)


def _newest_game_first(clips: list[VideoClip], games: dict[int, "Game"]) -> list[VideoClip]:
    """Stable sort: newest game first, game-less clips last."""
    return sorted(
        clips,
        key=lambda c: games[c.game_id].scheduled_at.timestamp() if c.game_id in games else float("-inf"),
        reverse=True,
    )


def player_briefing(team_clips: list[VideoClip], player: "Player", games: dict[int, "Game"]) -> list[VideoClip]:
    """The team's P clips tagged with `player`, newest game first (game-less clips last), timeline order within a game."""
    mine = [c for c in team_clips if c.in_player_briefing and player.id in (c.player_ids or [])]
    return _newest_game_first(timeline(mine), games)


def player_highlights(team_clips: list[VideoClip], player: "Player", public_games: dict[int, "Game"]) -> list[VideoClip]:
    """The H or personal clips tagging `player`; game clips only from public games, newest game first (#683, #696)."""
    mine = [
        c
        for c in team_clips
        if (c.is_highlight or c.is_player_highlight)
        and (c.game_id is None or c.game_id in public_games)
        and player.id in (c.player_ids or [])
    ]
    return _newest_game_first(timeline(mine), public_games)
