import xml.etree.ElementTree as ET
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Club, Game, GameStatus, Opponent, Player, PlayerImage, Team
from app.routers.seo import _title, _url_slug

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
    for page in ("schedule", "standings", "roster", "media", "posts"):
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


def test_sitemap_lists_clubs_with_teams_by_slug(client, db_session: Session) -> None:
    db_session.add_all([Club(name="אליצור", name_en="Elizur Club"), Club(name="בלי שם"), Club(name="ריק", name_en="Empty")])
    db_session.add_all([Team(name="א", slug="a", club="אליצור"), Team(name="ב", slug="b", club="בלי שם")])
    db_session.commit()
    nameless = db_session.query(Club).filter_by(name="בלי שם").one()

    locs = _locs(client)
    assert "https://example.org/clubs/elizur_club" in locs
    assert f"https://example.org/clubs/{nameless.id}" in locs
    assert "https://example.org/clubs/empty" not in locs


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


def _og(client, path: str) -> str:
    response = client.get("/og", params={"path": path})
    assert response.status_code == 200
    return response.text


def _team(db_session: Session, **kw) -> Team:
    team = Team(name=kw.pop("name", "אליזור"), slug="a", name_en=kw.pop("name_en", "Elizur"), **kw)
    db_session.add(team)
    db_session.commit()
    return team


def test_og_team_home_and_pages_use_team_name_and_logo(client, db_session: Session) -> None:
    team = _team(db_session, logo_url="https://cdn.example/logo.png")

    home = _og(client, "/elizur")
    assert '<meta property="og:title" content="אליזור · Elizur · כדורסל" />' in home
    assert 'property="og:image" content="https://cdn.example/logo.png"' in home
    assert 'property="og:title" content="שחקנים · אליזור · Elizur · כדורסל"' in _og(client, "/elizur/roster")
    assert 'property="og:title" content="לוח משחקים · אליזור · Elizur · כדורסל"' in _og(client, f"/{team.id}/schedule")


def test_og_relative_logo_and_missing_logo_become_absolute(client, db_session: Session) -> None:
    team = _team(db_session, logo_url="/x.png")
    assert 'og:image" content="https://example.org/x.png"' in _og(client, "/elizur")
    team.logo_url = None
    db_session.commit()
    assert 'og:image" content="https://example.org/logo.jpg"' in _og(client, "/elizur")


def test_og_player_uses_first_photo_then_team_logo(client, db_session: Session) -> None:
    team = _team(db_session, logo_url="https://cdn.example/logo.png")
    with_photos = Player(team_id=team.id, name="דנה", jersey_number=1)
    english = Player(team_id=team.id, name="רון", name_en="Ron", jersey_number=4)
    bare = Player(team_id=team.id, name="גיל", jersey_number=2)
    gone = Player(team_id=team.id, name="נמחק", jersey_number=3, deleted_at=datetime(2026, 1, 1, tzinfo=UTC))
    db_session.add_all([with_photos, bare, gone, english])
    db_session.commit()
    db_session.add_all([PlayerImage(player_id=with_photos.id, url="https://cdn.example/1.jpg"), PlayerImage(player_id=with_photos.id, url="https://cdn.example/2.jpg")])
    db_session.commit()

    body = _og(client, f"/players/{with_photos.id}")
    assert 'og:title" content="דנה · אליזור · כדורסל"' in body
    assert 'og:title" content="רון · אליזור · Ron · כדורסל"' in _og(client, f"/players/{english.id}")
    assert 'og:image" content="https://cdn.example/1.jpg"' in body
    assert 'og:image" content="https://cdn.example/logo.png"' in _og(client, f"/players/{bare.id}")
    assert _og(client, f"/players/{gone.id}") == ""


def test_og_game_title_names_opponent_and_final_score(client, db_session: Session) -> None:
    team = _team(db_session)
    other = Team(name="אחר", slug="b", name_en="Other")
    opponent = Opponent(name="מכבי")
    db_session.add_all([other, opponent])
    db_session.commit()
    game = Game(team_id=team.id, opponent_id=opponent.id, scheduled_at=datetime(2026, 1, 1, tzinfo=UTC), status=GameStatus.FINAL, team_score=80, opponent_score=70)
    db_session.add(game)
    db_session.commit()

    body = _og(client, f"/elizur/games/{game.id}")
    assert 'og:title" content="אליזור נגד מכבי · Elizur · כדורסל"' in body
    assert 'og:description" content="אליזור 80 – 70 מכבי"' in body
    assert _og(client, f"/other/games/{game.id}") == ""


def test_og_game_needing_review_is_empty(client, db_session: Session) -> None:
    team = _team(db_session)
    opponent = Opponent(name="מכבי")
    db_session.add(opponent)
    db_session.commit()
    game = Game(team_id=team.id, opponent_id=opponent.id, scheduled_at=datetime(2026, 1, 1, tzinfo=UTC), needs_review=True)
    db_session.add(game)
    db_session.commit()

    assert _og(client, f"/elizur/games/{game.id}") == ""


def test_og_club_page_title_lists_teams(client, db_session: Session) -> None:
    db_session.add(Club(name="אליצור", name_en="Elizur Club"))
    db_session.add_all([Team(name="בוגרים", slug="a", club="אליצור"), Team(name="נוער", slug="b", club="אליצור", logo_url="https://cdn.example/b.png")])
    db_session.commit()

    body = _og(client, "/clubs/elizur_club")
    assert 'og:title" content="אליצור · Elizur Club · כדורסל"' in body
    assert "בוגרים" in body and "נוער" in body
    assert 'og:image" content="https://cdn.example/b.png"' in body


@pytest.mark.parametrize("path", ["", "/", "/admin", "/elizur/admin", "/nope", "/elizur/nope", "/players/abc", "/players/999", "/elizur/games/999", "/teams", "/join", "/clubs/nope", "/clubs"])
def test_og_unknown_paths_are_empty(client, db_session: Session, path: str) -> None:
    _team(db_session)
    assert _og(client, path) == ""


def test_og_escapes_html_and_template_braces(client, db_session: Session) -> None:
    _team(db_session, name='<b>"x"{{env "A"}}</b>')
    body = _og(client, "/elizur")
    for bad in ("{{", "}}", "<b>", '"x"'):
        assert bad not in body
    for tag in ("<title>", 'name="description"', 'og:title"', 'og:description"', 'og:image"'):
        assert body.count(tag) == 1


@pytest.mark.parametrize(
    ("base", "name_en", "expected"),
    [
        ("אליזור", "Elizur", "אליזור · Elizur · כדורסל"),
        ("אליזור", None, "אליזור · כדורסל"),
        ("אליזור", "E" * 60, "אליזור · כדורסל"),
    ],
)
def test_title_drops_english_name_when_too_long(base: str, name_en: str | None, expected: str) -> None:
    assert _title(base, name_en) == expected
