from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import storage
from app.models import AdminUser, Player, Team
from app.security import hash_password
from app.routers import uploads as uploads_router


@pytest.fixture()
def stub_upload_file(monkeypatch: pytest.MonkeyPatch) -> Generator[dict[str, Any], None, None]:
    """Monkeypatch the storage call the router delegates to; records how it was called."""
    calls: dict[str, Any] = {}

    def _fake_upload_file(data: bytes, content_type: str) -> str:
        calls["data"] = data
        calls["content_type"] = content_type
        return "https://cdn.example.com/uploads/fake-key.jpg"

    monkeypatch.setattr(uploads_router, "upload_file", _fake_upload_file)
    yield calls


def test_upload_requires_admin(client: TestClient) -> None:
    response = client.post(
        "/uploads",
        files={"file": ("logo.png", b"fake-bytes", "image/png")},
    )
    assert response.status_code == 401


def test_upload_rejects_disallowed_content_type(
    admin_client: TestClient, stub_upload_file: dict[str, Any]
) -> None:
    response = admin_client.post(
        "/uploads",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 422
    assert stub_upload_file == {}


def test_upload_rejects_oversized_file(
    admin_client: TestClient, stub_upload_file: dict[str, Any]
) -> None:
    oversized = b"x" * (10 * 1024 * 1024 + 1)
    response = admin_client.post(
        "/uploads",
        files={"file": ("logo.png", oversized, "image/png")},
    )
    assert response.status_code == 422
    assert stub_upload_file == {}


def test_upload_rejects_oversized_file_without_buffering_full_body() -> None:
    """The size cap must reject before the whole body is read into memory.

    Calls the endpoint function directly with a fake UploadFile that records the `size` argument
    passed to `.read()`, bypassing multipart/TestClient plumbing that isn't what's under test.
    """
    import asyncio

    from fastapi import HTTPException

    read_sizes: list[int] = []

    class FakeUploadFile:
        content_type = "image/png"
        filename = "logo.png"

        async def read(self, size: int = -1) -> bytes:
            read_sizes.append(size)
            return b"x" * (10 * 1024 * 1024 + 1)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(uploads_router.create_upload(1, FakeUploadFile()))  # type: ignore[arg-type]

    assert exc_info.value.status_code == 422
    # bounded read: called with an explicit cap, never unbounded (-1/default), which would
    # buffer the entire oversized body into memory before the length check runs.
    assert read_sizes == [10 * 1024 * 1024 + 1]


def test_upload_returns_502_when_storage_misconfigured(admin_client: TestClient) -> None:
    """Empty-string local-dev object-storage defaults must not leak a raw exception."""
    response = admin_client.post(
        "/uploads",
        files={"file": ("logo.png", b"fake-image-bytes", "image/png")},
    )
    assert response.status_code == 502
    assert "object storage" in response.json()["detail"].lower()


def test_upload_returns_url_from_storage(
    admin_client: TestClient, stub_upload_file: dict[str, Any]
) -> None:
    response = admin_client.post(
        "/uploads",
        files={"file": ("logo.png", b"fake-image-bytes", "image/png")},
    )
    assert response.status_code == 201
    assert response.json() == {"url": "https://cdn.example.com/uploads/fake-key.jpg"}
    assert stub_upload_file["content_type"] == "image/png"
    assert stub_upload_file["data"] == b"fake-image-bytes"


def test_upload_ignores_client_filename_extension(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorded: list[dict[str, Any]] = []

    class _Recorder:
        def put_object(self, **kwargs: Any) -> None:
            recorded.append(kwargs)

    monkeypatch.setattr(storage.boto3, "client", lambda *args, **kwargs: _Recorder())

    response = admin_client.post(
        "/uploads", files={"file": ("evil.html", b"<script>", "image/png")}
    )

    assert response.status_code == 201
    key = recorded[0]["Key"]
    assert key.endswith(".png")
    assert ".html" not in key


@pytest.mark.parametrize("linked", [True, False])
def test_upload_allowed_only_for_linked_player(
    linked: bool, client: TestClient, db_session: Session, stub_upload_file: dict[str, Any]
) -> None:
    team = Team(name="T", slug="t")
    user = AdminUser(username="p", password_hash=hash_password("password123"))
    db_session.add_all([team, user])
    db_session.flush()
    if linked:
        db_session.add(Player(team_id=team.id, name="P", user_id=user.id))
    db_session.commit()
    assert client.post("/auth/login", json={"username": "p", "password": "password123"}).status_code == 200
    response = client.post("/uploads", files={"file": ("a.png", b"x", "image/png")})
    assert response.status_code == (201 if linked else 403)
