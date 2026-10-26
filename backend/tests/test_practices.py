from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Practice, Team
from app.models.audit_log import AuditLog
from tests.test_lineups import _login_as
from tests.test_plays import ACCESS, _login_linked


def _url(team: Team) -> str:
    return f"/teams/{team.id}/practices"


def _practice(db: Session, team: Team, starts_at: datetime, **kw: object) -> Practice:
    practice = Practice(team_id=team.id, starts_at=starts_at, **kw)
    db.add(practice)
    db.commit()
    return practice


@pytest.mark.parametrize(("who", "expected"), ACCESS)
def test_list_practices_access(who, expected, client, db_session, own_team, other_team, sibling_team) -> None:
    if who.startswith("player"):
        kind, target = who.split(":")
        _login_linked(client, db_session, own_team if target == "own" else other_team, deleted=kind == "player-deleted")
    else:
        _login_as(client, db_session, who, own_team, other_team)

    assert client.get(_url(own_team)).status_code == expected


def test_create_practice_weekly_creates_one_row_per_week(admin_client, own_team) -> None:
    body = {"starts_at": "2026-03-20T18:00:00", "repeat_weekly_until": "2026-04-03"}
    response = admin_client.post(_url(own_team), json=body)

    assert response.status_code == 201
    rows = response.json()
    assert [r["starts_at"] for r in rows] == ["2026-03-20T18:00:00", "2026-03-27T18:00:00", "2026-04-03T18:00:00"]
    assert len(admin_client.get(_url(own_team)).json()) == 3


def test_practice_notes_capped(admin_client, own_team) -> None:
    response = admin_client.post(_url(own_team), json={"starts_at": "2026-03-20T18:00:00", "notes": "x" * 2001})

    assert response.status_code == 422


def test_create_practice_single_returns_list_of_one(admin_client, own_team) -> None:
    response = admin_client.post(_url(own_team), json={"starts_at": "2026-03-20T18:00:00", "location": "Gym"})

    assert response.status_code == 201
    [row] = response.json()
    assert row["cancelled"] is False
    assert row["duration_minutes"] == 90
    assert row["location"] == "Gym"


@pytest.mark.parametrize("until", ["2026-03-19", "2027-03-22"])
def test_create_practice_repeat_bounds_422(until, admin_client, own_team) -> None:
    response = admin_client.post(_url(own_team), json={"starts_at": "2026-03-20T18:00:00", "repeat_weekly_until": until})

    assert response.status_code == 422
    assert "2026-03-20" in response.text


@pytest.mark.parametrize(("who", "allowed"), [("member:own", False), ("admin:own", True)])
def test_practice_writes_need_team_admin(who, allowed, client, db_session, own_team, other_team) -> None:
    practice = _practice(db_session, own_team, datetime(2026, 3, 20, 18, 0))
    path = f"{_url(own_team)}/{practice.id}"
    _login_as(client, db_session, who, own_team, other_team)

    statuses = [
        client.post(_url(own_team), json={"starts_at": "2026-03-20T18:00:00"}).status_code,
        client.patch(path, json={"cancelled": True}).status_code,
        client.delete(path).status_code,
    ]

    assert statuses == ([201, 200, 204] if allowed else [403, 403, 403])


def test_patch_practice_cancels_single_instance(admin_client, own_team) -> None:
    rows = admin_client.post(
        _url(own_team), json={"starts_at": "2026-03-20T18:00:00", "repeat_weekly_until": "2026-03-27"}
    ).json()

    response = admin_client.patch(f"{_url(own_team)}/{rows[0]['id']}", json={"cancelled": True})

    assert response.status_code == 200
    assert [r["cancelled"] for r in admin_client.get(_url(own_team)).json()] == [True, False]
    assert admin_client.patch(f"{_url(own_team)}/{rows[0]['id']}", json={"starts_at": None}).status_code == 422


def test_delete_upcoming_keeps_past_practices(admin_client, db_session, own_team, other_team) -> None:
    now = datetime.now()
    past = _practice(db_session, own_team, now - timedelta(days=30))
    _practice(db_session, own_team, now + timedelta(days=30))
    _practice(db_session, own_team, now + timedelta(days=37))
    theirs = _practice(db_session, other_team, now + timedelta(days=30))

    assert admin_client.delete(f"{_url(own_team)}/upcoming").status_code == 204

    assert [r["id"] for r in admin_client.get(_url(own_team)).json()] == [past.id]
    assert db_session.get(Practice, theirs.id) is not None
    deleted = db_session.scalars(select(AuditLog).where(AuditLog.action == "delete", AuditLog.entity_type == "practice")).all()
    assert len(deleted) == 2


def test_practice_of_other_team_404(admin_client, db_session, own_team, other_team) -> None:
    practice = _practice(db_session, other_team, datetime(2026, 3, 20, 18, 0))

    response = admin_client.patch(f"{_url(own_team)}/{practice.id}", json={"cancelled": True})

    assert response.status_code == 404
    assert str(practice.id) in response.text


def test_delete_team_deletes_its_practices(admin_client, db_session, own_team) -> None:
    practice = _practice(db_session, own_team, datetime(2026, 3, 20, 18, 0))
    practice_id = practice.id

    assert admin_client.delete(f"/teams/{own_team.id}").status_code == 204

    db_session.expire_all()
    assert db_session.get(Practice, practice_id) is None
