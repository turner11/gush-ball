import xml.etree.ElementTree as ET
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Player, Team
from app.routers.seo import _url_slug

NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


@pytest.fixture(autouse=True)
def public_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "public_url", "https://example.org")


def _locs(client) -> list[str]:
    response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    return [loc.text for loc in ET.fromstring(response.content).findall("s:url/s:loc", NS)]


def test_sitemap_lists_team_pages_under_team_slug(client, db_session: Session) -> None:
    db_session.add(Team(name="א", slug="a", name_en="Elizur"))
    db_session.commit()

    locs = _locs(client)
    for page in ("schedule", "standings", "roster", "media", "stats"):
        assert f"https://example.org/elizur/{page}" in locs
    assert "https://example.org/schedule" not in locs


def test_sitemap_lists_team_homes_by_url_slug(client, db_session: Session) -> None:
    named = Team(name="א", slug="a", name_en="Elizur Gush  Etzion!")
    unnamed = Team(name="ב", slug="b", name_en=None)
    db_session.add_all([named, unnamed])
    db_session.commit()

    locs = _locs(client)
    assert "https://example.org/elizur_gush_etzion" in locs
    assert f"https://example.org/{unnamed.id}" in locs


def test_sitemap_lists_live_players_only(client, db_session: Session) -> None:
    team = Team(name="א", slug="a")
    db_session.add(team)
    db_session.commit()
    live = Player(team_id=team.id, name="חי", jersey_number=1)
    gone = Player(team_id=team.id, name="נמחק", jersey_number=2, deleted_at=datetime(2026, 1, 1, tzinfo=UTC))
    db_session.add_all([live, gone])
    db_session.commit()

    locs = _locs(client)
    assert f"https://example.org/players/{live.id}" in locs
    assert f"https://example.org/players/{gone.id}" not in locs


@pytest.mark.parametrize(
    ("name_en", "slug"),
    [
        ("Elizur", "elizur"),
        ("Elizur Gush  Etzion!", "elizur_gush_etzion"),
        ("Ha'Poel", "hapoel"),
        (None, "3"),
        ("!!!", "3"),
    ],
)
def test_url_slug_matches_frontend_cases(name_en: str | None, slug: str) -> None:
    assert _url_slug(Team(id=3, name="x", slug="x", name_en=name_en)) == slug
