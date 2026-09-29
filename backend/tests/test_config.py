import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_requires_session_secret(monkeypatch):
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("secret", ["dev-secret-change-me", "short"])
def test_settings_rejects_short_or_default_secret(monkeypatch, secret):
    monkeypatch.setenv("SESSION_SECRET", secret)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_accepts_long_secret(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    assert Settings(_env_file=None).session_secret == "x" * 32


def test_docs_disabled_by_default(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    assert Settings(_env_file=None).enable_docs is False
