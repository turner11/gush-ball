import pytest
from sqlalchemy.orm import Session

from app import scrape_standings
from app.models import StandingRow, Team

# Trimmed real markup, per the plan (captured live from ibasketball.co.il/league/2026-1/).
FIXTURE_HTML = """
<html><head><title>ליגת על - IBBA</title></head>
<body>
<table class="sp-league-table sp-data-table sp-sortable-table">
  <thead><tr>
    <th class="data-rank">מיקום</th><th class="data-name">קבוצה</th>
    <th class="data-gp">מש׳</th><th class="data-w">ניצ׳</th><th class="data-l">הפ׳</th>
    <th class="data-lt">טכני</th><th class="data-bf">קלעה</th><th class="data-ba">ספגה</th>
    <th class="data-bd">הפרש</th><th class="data-pts">נק׳</th>
  </tr></thead>
  <tbody>
    <tr class="odd sp-row-no-0">
      <td class="data-rank" data-label="מיקום">1</td>
      <td class="data-name has-logo" data-label="קבוצה"><a href="https://ibasketball.co.il/team/120/">אליצור קרית אתא לאטי</a></td>
      <td class="data-gp" data-label="מש׳">10</td><td class="data-w" data-label="ניצ׳">8</td>
      <td class="data-l" data-label="הפ׳">2</td><td class="data-lt" data-label="טכני">0</td>
      <td class="data-bf" data-label="קלעה">850</td><td class="data-ba" data-label="ספגה">780</td>
      <td class="data-bd" data-label="הפרש">70</td><td class="data-pts" data-label="נק׳">18</td>
    </tr>
    <tr class="even sp-row-no-1">
      <td class="data-rank" data-label="מיקום">2</td>
      <td class="data-name has-logo" data-label="קבוצה"><a href="https://ibasketball.co.il/team/121/">מכבי חיפה</a></td>
      <td class="data-gp" data-label="מש׳">10</td><td class="data-w" data-label="ניצ׳">7</td>
      <td class="data-l" data-label="הפ׳">3</td><td class="data-lt" data-label="טכני">1</td>
      <td class="data-bf" data-label="קלעה">820</td><td class="data-ba" data-label="ספגה">800</td>
      <td class="data-bd" data-label="הפרש">20</td><td class="data-pts" data-label="נק׳">17</td>
    </tr>
  </tbody>
</table>
</body></html>
"""

NO_TABLE_HTML = "<html><head><title>ליגת על - IBBA</title></head><body>no table here</body></html>"


def _make_team(
    db_session: Session,
    *,
    slug: str = "gush-ball-a",
    league_url: str | None = "https://ibasketball.co.il/league/2026-1/",
) -> Team:
    team = Team(name="Gush Ball A", slug=slug, ibasketball_league_url=league_url)
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


def test_parse_league_table_extracts_league_name_and_rows() -> None:
    league_name, rows = scrape_standings.parse_league_table(FIXTURE_HTML)

    assert league_name == "ליגת על"
    assert len(rows) == 2

    first, second = rows
    assert first == {
        "team_name": "אליצור קרית אתא לאטי",
        "rank": 1,
        "played": 10,
        "won": 8,
        "lost": 2,
        "points_for": 850,
        "points_against": 780,
        "points": 18,
    }
    assert second["team_name"] == "מכבי חיפה"
    assert second["won"] == 7
    for row in rows:
        assert "technical" not in row
        assert "difference" not in row


def test_parse_league_table_missing_table_raises() -> None:
    with pytest.raises(ValueError, match="sp-league-table"):
        scrape_standings.parse_league_table(NO_TABLE_HTML)


def test_sync_creates_standing_rows_for_new_teams(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_standings, "_get_html", lambda url: FIXTURE_HTML)

    count = scrape_standings.sync_team_standings(db_session, team)

    assert count == 2
    rows = db_session.query(StandingRow).order_by(StandingRow.rank).all()
    assert [r.team_name for r in rows] == ["אליצור קרית אתא לאטי", "מכבי חיפה"]
    assert rows[0].league_name == "ליגת על"
    assert rows[0].played == 10
    assert rows[0].won == 8
    assert rows[0].lost == 2
    assert rows[0].points_for == 850
    assert rows[0].points_against == 780
    assert rows[0].points == 18


def test_sync_upserts_existing_row_by_league_and_team_name(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    team = _make_team(db_session)
    monkeypatch.setattr(scrape_standings, "_get_html", lambda url: FIXTURE_HTML)
    scrape_standings.sync_team_standings(db_session, team)

    updated_html = FIXTURE_HTML.replace(
        '<td class="data-w" data-label="ניצ׳">8</td>', '<td class="data-w" data-label="ניצ׳">9</td>'
    ).replace('<td class="data-pts" data-label="נק׳">18</td>', '<td class="data-pts" data-label="נק׳">19</td>')
    monkeypatch.setattr(scrape_standings, "_get_html", lambda url: updated_html)

    scrape_standings.sync_team_standings(db_session, team)

    rows = db_session.query(StandingRow).filter_by(team_name="אליצור קרית אתא לאטי").all()
    assert len(rows) == 1
    assert rows[0].won == 9
    assert rows[0].points == 19


def test_sync_all_standings_only_processes_teams_with_league_url(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_team(db_session, slug="gush-ball-a", league_url="https://ibasketball.co.il/league/2026-1/")
    _make_team(db_session, slug="gush-ball-b", league_url=None)
    calls: list[str] = []

    def fake_get_html(url: str) -> str:
        calls.append(url)
        return FIXTURE_HTML

    monkeypatch.setattr(scrape_standings, "_get_html", fake_get_html)

    count = scrape_standings.sync_all_standings(db_session)

    assert count == 2
    assert calls == ["https://ibasketball.co.il/league/2026-1/"]
