import pytest
from sqlalchemy.orm import Session

from app import scrape_club
from app.models import Team

CLUB_URL = "https://ibasketball.co.il/club/3901-2/"


def _card(name: str, league: str, code: str) -> str:
    return (
        f'<a class="team" href="https://ibasketball.co.il/team/{code}-{name.replace(" ", "-")}/">'
        f"<img src='x.png'>{name}<br>{league}<br>{code}</a>"
    )


def _page(*cards: str) -> str:
    menu = (
        '<a class="league data-item" href="https://ibasketball.co.il/league/2026-1/">ליגה א</a>'
        '<a class="league data-item" href="https://ibasketball.co.il/league/2026-2/">ליגה ב</a>'
        '<a class="league data-item" href="https://ibasketball.co.il/league/2026-3/">ליגה ב</a>'
    )
    return f'<div>{menu}</div><div class="team-gallery">{"".join(cards)}</div>'


def _rest_team(code: str, logo: str | None, venues: list[int]) -> dict:
    media = [{"source_url": logo}] if logo else []
    return {
        "link": f"https://ibasketball.co.il/team/{code}-x/",
        "venues": venues,
        "_embedded": {"wp:featuredmedia": media},
    }


class Fetcher:
    def __init__(self, page: str, json_responses: list) -> None:
        self.page, self.json_responses, self.json_calls, self.page_calls = (
            page,
            list(json_responses),
            0,
            0,
        )

    def get_page(self, url: str) -> str:
        self.page_calls += 1
        return self.page

    def get_json(self, path: str, **params):
        self.json_calls += 1
        return self.json_responses.pop(0)


def _patch(monkeypatch: pytest.MonkeyPatch, fetcher: Fetcher) -> None:
    monkeypatch.setattr(scrape_club, "_get_page", fetcher.get_page)
    monkeypatch.setattr(scrape_club, "_get_json", fetcher.get_json)


def test_parse_club_page_reads_cards_and_resolves_league_url() -> None:
    rows = scrape_club.parse_club_page(
        _page(_card("Alpha", "ליגה א", "1"), _card("Beta", "ליגה ב", "2"))
    )
    assert rows[0] == {
        "name": "Alpha",
        "league_name": "ליגה א",
        "ibasketball_team_url": "https://ibasketball.co.il/team/1-Alpha/",
        "ibasketball_league_url": "https://ibasketball.co.il/league/2026-1/",
    }
    assert rows[1]["ibasketball_league_url"] is None  # ambiguous: two hrefs share the text


def test_parse_club_page_ignores_same_named_tournament() -> None:
    html = (
        '<a class="league data-item" href="https://ibasketball.co.il/league/2026-822/">קט סל</a>'
        '<a class="league data-item tournament" href="https://ibasketball.co.il/league/2026-922/">קט סל</a>'
        f'<div class="team-gallery">{_card("Alpha", "קט סל", "1")}</div>'
    )
    rows = scrape_club.parse_club_page(html)
    assert rows[0]["ibasketball_league_url"] == "https://ibasketball.co.il/league/2026-822/"


def test_parse_club_page_without_gallery_raises() -> None:
    with pytest.raises(ValueError):
        scrape_club.parse_club_page("<div>nothing</div>")


def test_preview_omits_existing_teams_by_ibba_code(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_session.add(
        Team(
            name="Old", slug="old", ibasketball_team_url="https://ibasketball.co.il/team/1-%D7%90/"
        )
    )
    db_session.commit()
    _patch(
        monkeypatch,
        Fetcher(_page(_card("Alpha", "ליגה א", "1"), _card("Beta", "ליגה א", "2")), [[], []]),
    )
    assert [r["name"] for r in scrape_club.preview_club_teams(db_session, CLUB_URL)] == ["Beta"]


def test_preview_suggests_unique_names_with_numeric_suffix(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_session.add(Team(name="X", slug="x"))
    db_session.commit()
    page = _page(_card("X", "ליגה א", "1"), _card("X", "ליגה א", "2"), _card("Y", "ליגה א", "3"))
    _patch(monkeypatch, Fetcher(page, [[], []]))
    assert [r["name"] for r in scrape_club.preview_club_teams(db_session, CLUB_URL)] == [
        "X 2",
        "X 3",
        "Y",
    ]


def test_preview_fills_logo_and_address_in_three_requests(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    teams = [
        _rest_team("1", "https://img/a.png", [7]),
        _rest_team("2", "https://img/" + "a" * 500, []),
        {"link": "https://ibasketball.co.il/team/3-x/"},  # WP omits _embedded/venues without a logo
    ]
    fetcher = Fetcher(
        _page(_card("A", "ליגה א", "1"), _card("B", "ליגה א", "2"), _card("C", "ליגה א", "3")),
        [teams, [{"id": 7, "name": "אולם"}]],
    )
    _patch(monkeypatch, fetcher)
    rows = scrape_club.preview_club_teams(db_session, CLUB_URL)
    assert (fetcher.page_calls, fetcher.json_calls) == (1, 2)
    assert (rows[0]["logo_url"], rows[0]["home_court_address"]) == ("https://img/a.png", "אולם")
    assert (rows[1]["logo_url"], rows[1]["home_court_address"]) == (None, None)
    assert (rows[2]["logo_url"], rows[2]["home_court_address"]) == (None, None)


def test_preview_skips_rest_calls_when_all_teams_exist(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_session.add(
        Team(name="Old", slug="old", ibasketball_team_url="https://ibasketball.co.il/team/1-a/")
    )
    db_session.commit()
    fetcher = Fetcher(_page(_card("Alpha", "ליגה א", "1")), [])
    _patch(monkeypatch, fetcher)
    assert scrape_club.preview_club_teams(db_session, CLUB_URL) == []
    assert fetcher.json_calls == 0


def test_parse_club_page_drops_non_http_hrefs() -> None:
    bad_card = _card("Bad", "ליגה ג", "9").replace("https://ibasketball.co.il/team/9-Bad/", "javascript:alert(1)")
    html = _page(_card("Alpha", "ליגה ג", "1"), bad_card).replace(
        "</div><div", '<a class="league data-item" href="javascript:alert(2)">ליגה ג</a></div><div', 1
    )
    rows = scrape_club.parse_club_page(html)

    assert [r["name"] for r in rows] == ["Alpha"]
    assert rows[0]["ibasketball_league_url"] is None


def test_preview_drops_non_http_logo(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    fetcher = Fetcher(_page(_card("A", "ליגה א", "1")), [[_rest_team("1", "javascript:alert(1)", [])]])
    _patch(monkeypatch, fetcher)

    rows = scrape_club.preview_club_teams(db_session, CLUB_URL)

    assert rows[0]["logo_url"] is None
