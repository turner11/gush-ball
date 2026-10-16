import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Club, Membership, Team

URL = "https://ibasketball.co.il/club/3901-2/"


def test_club_fks_cascade_on_rename() -> None:
    # SQLite tests run with FKs off; a missing CASCADE would strip club admins of scope when a club is renamed.
    for column in (Team.__table__.c.club, Membership.__table__.c.club):
        (fk,) = column.foreign_keys
        assert fk.target_fullname == "clubs.name"
        assert fk.onupdate == "CASCADE"


def test_full_admin_lists_and_edits_club(admin_client: TestClient, db_session: Session) -> None:
    club = Club(name="Gush")
    db_session.add(club)
    db_session.commit()

    response = admin_client.patch(f"/clubs/{club.id}", json={"name": "Gush Etzion", "name_en": None, "ibasketball_url": URL})

    assert response.status_code == 200
    assert response.json() == {"id": club.id, "name": "Gush Etzion", "name_en": None, "ibasketball_url": URL}
    assert admin_client.get("/clubs").json() == [response.json()]


def test_club_patch_null_clears_only_that_field(admin_client: TestClient, db_session: Session) -> None:
    club = Club(name="Gush", name_en="Gush", ibasketball_url=URL)
    db_session.add(club)
    db_session.commit()

    response = admin_client.patch(f"/clubs/{club.id}", json={"ibasketball_url": None})

    assert response.status_code == 200
    assert response.json() == {"id": club.id, "name": "Gush", "name_en": "Gush", "ibasketball_url": None}


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"name": "Other"}, 409),
        ({"name_en": "Taken"}, 409),
        ({"name": None}, 422),
        ({"ibasketball_url": "https://ibasketball.co.il/club/1/"}, 409),
        ({"ibasketball_url": "https://example.com/club/1/"}, 422),
    ],
)
def test_club_patch_conflicts_and_bad_url(
    admin_client: TestClient, db_session: Session, body: dict, code: int
) -> None:
    mine = Club(name="Gush")
    db_session.add_all([mine, Club(name="Other", name_en="Taken", ibasketball_url="https://ibasketball.co.il/club/1/")])
    db_session.commit()

    assert admin_client.patch(f"/clubs/{mine.id}", json=body).status_code == code


def test_patch_unknown_club_is_404(admin_client: TestClient) -> None:
    assert admin_client.patch("/clubs/999", json={"name": "X"}).status_code == 404


def test_club_name_en_is_set_then_cleared(admin_client: TestClient, db_session: Session) -> None:
    club = Club(name="Gush")
    db_session.add(club)
    db_session.commit()

    set_ = admin_client.patch(f"/clubs/{club.id}", json={"name_en": "Elizur"})
    assert (set_.status_code, set_.json()["name_en"]) == (200, "Elizur")
    cleared = admin_client.patch(f"/clubs/{club.id}", json={"name_en": None})
    assert (cleared.status_code, cleared.json()["name_en"], cleared.json()["name"]) == (200, None, "Gush")


def test_clubs_list_is_public(client: TestClient) -> None:
    assert client.get("/clubs").status_code == 200


def test_club_patch_is_full_admin_only(club_admin_client: TestClient) -> None:
    assert club_admin_client.patch("/clubs/1", json={"name": "X"}).status_code == 403
