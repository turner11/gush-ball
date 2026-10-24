import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_requires_session_secret(monkeypatch):
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("secret", ["dev-secret-change-me", "short", "replace-with-a-random-value-of-at-least-32-chars"])
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


def test_club_domains_parses_json_and_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("CLUB_DOMAINS", '{"7": "https://mj.example/"}')
    assert Settings(_env_file=None).club_domains == {7: "https://mj.example"}


def test_club_domains_empty_env_is_empty_map(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("CLUB_DOMAINS", "")
    assert Settings(_env_file=None).club_domains == {}


@pytest.mark.parametrize("bad", ["mj.example", "https://mj.example/path", "ftp://mj.example"])
def test_club_domains_rejects_non_origin(monkeypatch, bad):
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("CLUB_DOMAINS", f'{{"7": "{bad}"}}')
    with pytest.raises(ValidationError, match=bad):
        Settings(_env_file=None)
