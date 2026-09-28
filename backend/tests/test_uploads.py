from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.routers import uploads as uploads_router


@pytest.fixture()
def stub_upload_file(monkeypatch: pytest.MonkeyPatch) -> Generator[dict[str, Any], None, None]:
    """Monkeypatch the storage call the router delegates to; records how it was called."""
    calls: dict[str, Any] = {}

    def _fake_upload_file(data: bytes, filename: str, content_type: str) -> str:
        calls["data"] = data
        calls["filename"] = filename
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
