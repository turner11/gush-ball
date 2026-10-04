import re
from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.config import settings
from app.deps import DbSession
from app.models import Player, Team

router = APIRouter(tags=["seo"])

STATIC_PAGES = ("schedule", "standings", "roster", "media", "stats")


def _url_slug(team: Team) -> str:
    # ponytail: mirrors frontend teamSlug (useSelectedTeam.js); change both
    slug = re.sub(r"\s+", "_", re.sub(r"[^a-z0-9_\s]", "", (team.name_en or "").lower()).strip())
    return slug or str(team.id)


@router.get("/sitemap.xml")
def sitemap(db: DbSession) -> Response:
    base = settings.public_url.rstrip("/")
    paths = list(STATIC_PAGES)
    paths += [_url_slug(team) for team in db.scalars(select(Team).order_by(Team.id))]
    paths += [f"players/{pid}" for pid in db.scalars(select(Player.id).where(Player.deleted_at.is_(None)).order_by(Player.id))]
    urls = "".join(f"<url><loc>{escape(f'{base}/{path}')}</loc></url>" for path in paths)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    return Response(xml, media_type="application/xml")
