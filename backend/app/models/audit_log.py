from datetime import UTC, datetime
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import JSON, DateTime, ForeignKey, String, event, insert, inspect
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base
from app.models.content import TeamImage, TeamLink, TeamPost, TeamVideo
from app.models.game import Game
from app.models.membership import Membership
from app.models.player import Player, PlayerImage
from app.models.standing_row import StandingRow
from app.models.team import Team


class AuditLog(Base):
    """Append-only: who changed what, when. `user_id` null + `username` null = the scraper; `user_id` null +
    `username` set = an account since deleted. `team_id` has no FK so rows outlive their team."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"), default=None)
    username: Mapped[str | None] = mapped_column(String(80), default=None)
    action: Mapped[str] = mapped_column(String(10))  # create | update | delete
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int]
    team_id: Mapped[int | None] = mapped_column(index=True, default=None)
    changes: Mapped[dict] = mapped_column(JSON)  # {field: [before, after]}


# Allowlist: AdminUser (passwords, emails), Club, Opponent and LineupSnapshot are deliberately absent.
_AUDITED: dict[type, str] = {
    Game: "game",
    Player: "player",
    PlayerImage: "player_image",
    TeamLink: "link",
    TeamVideo: "video",
    TeamImage: "image",
    TeamPost: "post",
    StandingRow: "standing",
    Team: "team",
    Membership: "membership",
}
_MAX_VALUE_CHARS = 200
# Never diffed: id is the entity_id; stats_url is an admin-only sheet URL; has_stats is a read-only EXISTS.
_SKIPPED_KEYS = {"id", "stats_url", "has_stats"}


def _team_id(session: Session, obj: Any) -> int | None:
    if isinstance(obj, Team):
        return obj.id
    if isinstance(obj, PlayerImage):
        player = session.get(Player, obj.player_id)
        return player.team_id if player else None
    return getattr(obj, "team_id", None)


def _value(raw: Any) -> Any:
    value = jsonable_encoder(raw)
    if isinstance(value, str) and len(value) > _MAX_VALUE_CHARS:
        return value[:_MAX_VALUE_CHARS] + "…"
    return value


def _changes(obj: Any, action: str) -> dict[str, list]:
    state = inspect(obj)
    keys = [p.key for p in state.mapper.column_attrs if p.key not in _SKIPPED_KEYS]
    if action == "update":
        # Before value comes from attribute history. ponytail: an attribute expired by a mid-request commit
        # has no history, so its before value is logged as null; no current write path does this.
        histories = {k: state.attrs[k].history for k in keys}
        return {
            k: [_value(h.deleted[0] if h.deleted else None), _value(h.added[0] if h.added else None)]
            for k, h in histories.items()
            if h.has_changes()
        }
    present = {k: state.dict[k] for k in keys if state.dict.get(k) is not None}
    if action == "create":
        return {k: [None, _value(v)] for k, v in present.items()}
    return {k: [_value(v), None] for k, v in present.items()}


@event.listens_for(Session, "after_flush")
def _write_audit_rows(session: Session, flush_context: Any) -> None:
    # ponytail: no actor = scraper (or a CLI script, which also reads as "scraper"; set
    # session.info["audit_actor"] there if it ever matters). Only Core inserts below, so this can't recurse.
    user_id, username = session.info.get("audit_actor", (None, None))
    rows = []
    for action, objs in (("create", session.new), ("update", session.dirty), ("delete", session.deleted)):
        for obj in objs:
            entity_type = _AUDITED.get(type(obj))
            if entity_type is None:
                continue
            changes = _changes(obj, action)
            if action == "update" and not changes:
                continue
            rows.append(
                {
                    "user_id": user_id,
                    "username": username,
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": obj.id,
                    "team_id": _team_id(session, obj),
                    "changes": changes,
                }
            )
    if rows:
        session.connection().execute(insert(AuditLog), rows)
