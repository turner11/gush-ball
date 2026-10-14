import logging
from types import SimpleNamespace

import pytest

from app import monitoring


def test_init_sentry_is_noop_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(monitoring, "settings", SimpleNamespace(sentry_dsn=""))
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kw: calls.append(kw))
    monitoring.init_sentry()
    assert calls == []


def test_init_sentry_sends_no_pii(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(monitoring, "settings", SimpleNamespace(sentry_dsn="https://k@o1.ingest.sentry.io/2"))
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kw: calls.append(kw))
    monitoring.init_sentry()
    (kwargs,) = calls
    assert kwargs["dsn"] == "https://k@o1.ingest.sentry.io/2"
    assert kwargs["send_default_pii"] is False
    assert kwargs["max_request_body_size"] == "never"
    assert kwargs["include_local_variables"] is False
    (logging_integration,) = kwargs["integrations"]
    assert logging_integration._breadcrumb_handler is None  # no log breadcrumbs
    assert logging_integration._handler.level == logging.ERROR
