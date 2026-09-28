from typing import Any

import pytest

from app import storage
from app.config import settings


class _FakeS3Client:
    def __init__(self) -> None:
        self.put_object_calls: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> None:
        self.put_object_calls.append(kwargs)


def test_storage_upload_file_builds_public_url(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeS3Client()
    monkeypatch.setattr(storage.boto3, "client", lambda *args, **kwargs: fake_client)
    monkeypatch.setattr(settings, "object_storage_bucket", "gush-ball-media")
    monkeypatch.setattr(settings, "object_storage_public_url", "https://cdn.example.com")

    url = storage.upload_file(b"bytes", "team-logo.PNG", "image/png")

    assert len(fake_client.put_object_calls) == 1
    call = fake_client.put_object_calls[0]
    assert call["Bucket"] == "gush-ball-media"
    assert call["Body"] == b"bytes"
    assert call["ContentType"] == "image/png"
    key = call["Key"]
    assert key.endswith(".PNG")
    assert url == f"https://cdn.example.com/{key}"
