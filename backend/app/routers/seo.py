import html
import re
from urllib.parse import urljoin
from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.config import settings
from app.deps import DbSession
from app.models import Club, Game, GameStatus, Opponent, Player, PlayerImage, Team

router = APIRouter(tags=["seo"])

# stats is members-only (#249) and noindexed, so it is not listed
TEAM_PAGES = ("schedule", "standings", "roster", "media")


def _url_slug(item: Team | Club) -> str:
    # ponytail: team or club; mirrors frontend teamSlug (useSelectedTeam.js); change both
    slug = re.sub(r"\s+", "_", re.sub(r"[^a-z0-9_\s]", "", (item.name_en or "").lower()).strip())
    return slug or str(item.id)


@router.get("/sitemap.xml")
def sitemap(db: DbSession) -> Response:
    base = settings.public_url.rstrip("/")
    paths: list[str] = []
    for team in db.scalars(select(Team).order_by(Team.id)):
        slug = _url_slug(team)
        paths += [slug, *(f"{slug}/{page}" for page in TEAM_PAGES)]
    clubs_with_teams = select(Club).where(Club.name.in_(select(Team.club))).order_by(Club.id)
    paths += [f"clubs/{_url_slug(club)}" for club in db.scalars(clubs_with_teams)]
    paths += [f"players/{pid}" for pid in db.scalars(select(Player.id).where(Player.deleted_at.is_(None)).order_by(Player.id))]
    urls = "".join(f"<url><loc>{escape(f'{base}/{path}')}</loc></url>" for path in paths)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    return Response(xml, media_type="application/xml")


# ponytail: mirrors router/index.js meta (title, description); change both
_HOME_DESCRIPTION = "האתר של {team}: משחקים ותוצאות, טבלת הליגה, שחקנים, חדשות ומדיה."
_PAGE_META = {
    "schedule": ("לוח משחקים", "לוח המשחקים והתוצאות של {team}."),
    "standings": ("טבלה", "טבלת הליגה והמיקום של {team}."),
    "roster": ("שחקנים", "סגל השחקנים של {team}."),
    "media": ("מדיה", "תמונות, סרטונים וקישורים של {team}."),
}
_GAME_DESCRIPTION = "משחק של {team}: תאריך, מקום ותוצאה."
_TITLE_MAX = 60


def _title(base: str, name_en: str | None) -> str:
    # ponytail: mirrors frontend pageTitle (lib/head.js); change both
    full = f"{base} · {name_en} · כדורסל"
    return full if name_en and len(full) <= _TITLE_MAX else f"{base} · כדורסל"


def _team_for_slug(db: DbSession, slug: str) -> Team | None:
    # mirrors useTeamFromRoute: url slug first, then numeric id
    teams = list(db.scalars(select(Team).order_by(Team.id)))
    slug = slug.lower()
    return next((t for t in teams if _url_slug(t) == slug), None) or next((t for t in teams if str(t.id) == slug), None)


def _club_for_slug(db: DbSession, slug: str) -> Club | None:
    slug = slug.lower()
    return next((c for c in db.scalars(select(Club).order_by(Club.id)) if _url_slug(c) == slug), None)


def _page_tags(db: DbSession, path: str) -> tuple[str, str, str | None] | None:
    """(title, description, image url) for a public page, or None when the path is not covered."""
    parts = [p for p in path.split("/") if p]
    if len(parts) == 2 and parts[0] == "players":
        player = db.get(Player, int(parts[1])) if parts[1].isdigit() else None
        if player is None or player.deleted_at is not None:
            return None
        photo = db.scalar(select(PlayerImage.url).where(PlayerImage.player_id == player.id).order_by(PlayerImage.id))
        return _title(f"{player.name} · {player.team.name}", player.name_en), f"פרופיל {'מאמן' if player.is_coach else 'שחקן'} של {player.team.name}.", photo or player.team.logo_url
    if len(parts) == 2 and parts[0] == "clubs":
        club = _club_for_slug(db, parts[1])
        if club is None:
            return None
        teams = list(db.scalars(select(Team).where(Team.club == club.name).order_by(Team.id)))
        description = f"הקבוצות של {club.name}: {', '.join(t.name for t in teams)}." if teams else f"מועדון {club.name}."
        return _title(club.name, club.name_en), description, next((t.logo_url for t in teams if t.logo_url), None)
    team = _team_for_slug(db, parts[0]) if parts and parts[0] not in ("admin", "join", "teams", "players", "clubs") else None
    if team is None:
        return None
    if len(parts) == 1:
        return _title(team.name, team.name_en), _HOME_DESCRIPTION.format(team=team.name), team.logo_url
    if len(parts) == 2 and parts[1] in _PAGE_META:
        title, description = _PAGE_META[parts[1]]
        return _title(f"{title} · {team.name}", team.name_en), description.format(team=team.name), team.logo_url
    if len(parts) == 3 and parts[1] == "games" and parts[2].isdigit():
        game = db.get(Game, int(parts[2]))
        if game is None or game.team_id != team.id:
            return None
        opponent = db.get(Opponent, game.opponent_id)
        scored = game.status == GameStatus.FINAL and game.team_score is not None and game.opponent_score is not None
        description = f"{team.name} {game.team_score} – {game.opponent_score} {opponent.name}" if scored else _GAME_DESCRIPTION.format(team=team.name)
        return _title(f"{team.name} נגד {opponent.name}", team.name_en), description, team.logo_url
    return None


def _attr(value: str) -> str:
    # Caddy executes the included body as a template, so braces must not survive either
    return html.escape(value, quote=True).replace("{", "&#123;").replace("}", "&#125;")


@router.get("/og", response_class=HTMLResponse)
def og_tags(db: DbSession, path: str = "") -> str:
    """Per-page title/description/og tags, spliced into index.html by Caddy; empty = keep the defaults."""
    tags = _page_tags(db, path)
    if tags is None:
        return ""
    title, description, image = tags
    base = settings.public_url.rstrip("/")
    image_url = urljoin(base + "/", image) if image else f"{base}/logo.jpg"
    title, description, image_url = _attr(title), _attr(description), _attr(image_url)
    return "\n".join(
        [
            f"<title>{title}</title>",
            f'<meta name="description" content="{description}" />',
            f'<meta property="og:title" content="{title}" />',
            f'<meta property="og:description" content="{description}" />',
            f'<meta property="og:image" content="{image_url}" />',
        ]
    )
