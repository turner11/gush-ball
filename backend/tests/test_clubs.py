import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Club, Membership, Team

URL = "https://ibasketball.co.il/club/3901-2/"
NO_ABOUT = {"about_title": None, "about_title_en": None, "about": None, "about_en": None, "about_images": [], "about_links": [], "officials": []}


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
    assert response.json() == {"id": club.id, "name": "Gush Etzion", "name_en": None, "ibasketball_url": URL, **NO_ABOUT}
    assert admin_client.get("/clubs").json() == [response.json()]


def test_club_patch_null_clears_only_that_field(admin_client: TestClient, db_session: Session) -> None:
    club = Club(name="Gush", name_en="Gush", ibasketball_url=URL)
    db_session.add(club)
    db_session.commit()

    response = admin_client.patch(f"/clubs/{club.id}", json={"ibasketball_url": None})

    assert response.status_code == 200
    assert response.json() == {"id": club.id, "name": "Gush", "name_en": "Gush", "ibasketball_url": None, **NO_ABOUT}


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


def _club(db_session: Session, name: str = "Gush") -> Club:
    club = Club(name=name)
    db_session.add(club)
    db_session.commit()
    return club


def test_club_about_round_trips_and_clears(admin_client: TestClient, db_session: Session) -> None:
    club = _club(db_session)
    body = {
        "about_title": "עלינו",
        "about": "שורה א\nשורה ב",
        "about_images": [{"url": "https://cdn.example.com/a.jpg", "title": "תמונה"}],
        "about_links": [
            {"label": "אתר", "url": "https://example.com/"},
            {"label": "פייסבוק", "url": "https://facebook.com/gush"},
        ],
    }

    assert admin_client.put(f"/clubs/{club.id}/about", json=body).status_code == 200

    (got,) = admin_client.get("/clubs").json()
    assert got["about_title"] == "עלינו"
    assert got["about"] == "שורה א\nשורה ב"
    assert got["about_images"] == [{"url": "https://cdn.example.com/a.jpg", "title": "תמונה", "title_en": None}]
    assert [link["label"] for link in got["about_links"]] == ["אתר", "פייסבוק"]
    assert got["about_links"][0]["label_en"] is None

    cleared = admin_client.put(f"/clubs/{club.id}/about", json={})
    assert cleared.status_code == 200
    assert {k: cleared.json()[k] for k in NO_ABOUT} == NO_ABOUT


def test_club_admin_edits_only_own_club_about(club_admin_client: TestClient, db_session: Session) -> None:
    mine = _club(db_session, "Gush")
    other = _club(db_session, "Other")

    assert club_admin_client.put(f"/clubs/{mine.id}/about", json={"about": "x"}).status_code == 200
    assert club_admin_client.put(f"/clubs/{other.id}/about", json={"about": "x"}).status_code == 403


def test_club_about_forbidden_for_team_admin_and_anonymous(
    team_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    club = _club(db_session)

    assert team_admin_client.put(f"/clubs/{club.id}/about", json={}).status_code == 403
    team_admin_client.cookies.clear()
    assert team_admin_client.put(f"/clubs/{club.id}/about", json={}).status_code == 401


def test_club_officials_round_trip_in_order(admin_client: TestClient, db_session: Session) -> None:
    club = _club(db_session)
    first = {"name": " דני ", "position": "יו״ר", "image_url": "https://cdn.example.com/d.jpg", "about": "ותיק"}
    second = {"name": "רונית", "position": "מזכירה"}

    assert admin_client.put(f"/clubs/{club.id}/about", json={"officials": [first, second]}).status_code == 200

    (got,) = admin_client.get("/clubs").json()
    assert got["officials"] == [
        {"name": "דני", "position": "יו״ר", "image_url": "https://cdn.example.com/d.jpg", "about": "ותיק"},
        {"name": "רונית", "position": "מזכירה", "image_url": None, "about": None},
    ]

    admin_client.put(f"/clubs/{club.id}/about", json={"officials": [second, first]})
    (got,) = admin_client.get("/clubs").json()
    assert [o["name"] for o in got["officials"]] == ["רונית", "דני"]


@pytest.mark.parametrize(
    "body",
    [
        {"about_links": [{"label": "x", "url": "https://example.com/"}] * 21},
        {"about_links": [{"label": "x", "url": "javascript:alert(1)"}]},
        {"about_links": [{"label": "  ", "url": "https://example.com/"}]},
        {"about": "x" * 5001},
        {"officials": [{"name": " ", "position": "x"}]},
        {"officials": [{"name": "x"}]},
        {"officials": [{"name": "x", "position": "x", "image_url": "javascript:alert(1)"}]},
        {"officials": [{"name": "x", "position": "x"}] * 51},
    ],
)
def test_club_about_rejects_bad_input(admin_client: TestClient, db_session: Session, body: dict) -> None:
    club = _club(db_session)

    assert admin_client.put(f"/clubs/{club.id}/about", json=body).status_code == 422


def test_put_about_unknown_club_is_404(admin_client: TestClient) -> None:
    assert admin_client.put("/clubs/999/about", json={}).status_code == 404


def _gush(db_session: Session) -> Club:
    club = Club(name="Gush")
    db_session.add(club)
    db_session.commit()
    return club


def test_club_admin_crud_own_club_posts(club_admin_client: TestClient, db_session: Session) -> None:
    club = db_session.query(Club).filter_by(name="Gush").one_or_none() or _gush(db_session)
    path = f"/clubs/{club.id}/posts"

    created = club_admin_client.post(path, json={"title": "News", "body": "Hello"})
    assert created.status_code == 201
    post_id = created.json()["id"]
    assert club_admin_client.patch(f"{path}/{post_id}", json={"pinned": True}).json()["pinned"] is True

    listed = club_admin_client.get(path).json()
    assert [(p["id"], p["club_id"], p["pinned"]) for p in listed] == [(post_id, club.id, True)]
    assert club_admin_client.delete(f"{path}/{post_id}").status_code == 204
    assert club_admin_client.get(path).json() == []


def test_club_post_writes_scoped_to_club(
    club_admin_client: TestClient, db_session: Session, client: TestClient
) -> None:
    other = Club(name="Other")
    db_session.add(other)
    db_session.commit()
    body = {"title": "t", "body": "b"}

    assert club_admin_client.post(f"/clubs/{other.id}/posts", json=body).status_code == 403
    client.post("/auth/logout")
    assert client.post(f"/clubs/{other.id}/posts", json=body).status_code == 401


def test_club_post_writes_denied_to_team_admin(
    team_admin_client: TestClient, db_session: Session, sibling_team: Team
) -> None:
    club = _gush(db_session)
    assert team_admin_client.post(f"/clubs/{club.id}/posts", json={"title": "t", "body": "b"}).status_code == 403


def test_club_posts_404s(admin_client: TestClient, db_session: Session) -> None:
    mine, other = _gush(db_session), Club(name="Other")
    db_session.add(other)
    db_session.commit()
    assert admin_client.get("/clubs/9999/posts").status_code == 404
    assert admin_client.post("/clubs/9999/posts", json={"title": "t", "body": "b"}).status_code == 404

    post_id = admin_client.post(f"/clubs/{mine.id}/posts", json={"title": "t", "body": "b"}).json()["id"]
    assert admin_client.patch(f"/clubs/{other.id}/posts/{post_id}", json={"title": "x"}).status_code == 404
    assert admin_client.delete(f"/clubs/{other.id}/posts/{post_id}").status_code == 404
