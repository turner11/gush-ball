from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.deps import DbSession, get_team_or_404
from app.models import Game, GameStatus, Team

router = APIRouter(tags=["calendar"])

# Game.scheduled_at is a naive Israel wall-clock time; loaded at import so a missing tz database fails at boot.
ISRAEL = ZoneInfo("Asia/Jerusalem")
_STAMP = "%Y%m%dT%H%M%SZ"


def _text(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", r"\;").replace(",", r"\,").replace("\n", r"\n")


def _fold(line: str) -> str:
    """RFC 5545 §3.1: physical lines hold at most 75 octets, continuation lines start with a space."""
    parts: list[str] = []
    current, size = "", 0
    for ch in line:
        width = len(ch.encode())
        if size + width > 75:
            parts.append(current)
            current, size = " ", 1
        current += ch
        size += width
    parts.append(current)
    return "\r\n".join(parts)


def _utc(naive_israel: datetime) -> str:
    return naive_israel.replace(tzinfo=ISRAEL).astimezone(UTC).strftime(_STAMP)


def _event_lines(team: Team, game: Game, stamp: str) -> list[str]:
    home, away = (team.name, game.opponent.name) if game.is_home else (game.opponent.name, team.name)
    address = team.home_court_address if game.is_home else game.opponent.address
    played = game.team_score is not None and game.opponent_score is not None
    notes: list[str] = []
    if played:
        home_score, away_score = (game.team_score, game.opponent_score) if game.is_home else (game.opponent_score, game.team_score)
        notes.append(f"תוצאה: {home_score}–{away_score}")
    if game.description:
        notes.append(game.description)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{game.id}@gush-ball",  # constant suffix: a domain change must not duplicate events
        f"DTSTAMP:{stamp}",
        f"DTSTART:{_utc(game.scheduled_at)}",
        "DURATION:PT2H",  # ponytail: fixed 2h slot; no end time in the data
        f"SUMMARY:{_text(f'{home} נגד {away}')}",
    ]
    if address:
        lines.append(f"LOCATION:{_text(address)}")
    if notes:
        lines.append("DESCRIPTION:" + _text("\n".join(notes)))
    if game.status is GameStatus.CANCELLED:
        lines.append("STATUS:CANCELLED")
    lines.append("END:VEVENT")
    return lines


@router.get("/teams/{team_id}/calendar.ics")
def team_calendar(team_id: int, db: DbSession) -> Response:
    team = get_team_or_404(db, team_id)
    games = db.scalars(
        select(Game).where(Game.team_id == team_id, Game.needs_review.is_(False)).order_by(Game.scheduled_at)
    )
    stamp = datetime.now(UTC).strftime(_STAMP)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gush Ball//Schedule//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_text(team.name)}",
    ]
    for game in games:
        lines += _event_lines(team, game, stamp)
    lines.append("END:VCALENDAR")
    body = "".join(_fold(line) + "\r\n" for line in lines)
    return Response(body, media_type="text/calendar")
