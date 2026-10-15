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
    monkeypatch.setattr(monitoring, "settings", SimpleNamespace(sentry_dsn="https://k@o1.ingest.sentry.io/2", sentry_traces_sample_rate=0.1))
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


def test_init_sentry_enables_tracing_without_leaking(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        monitoring, "settings", SimpleNamespace(sentry_dsn="https://k@o1.ingest.sentry.io/2", sentry_traces_sample_rate=0.1)
    )
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kw: calls.append(kw))
    monitoring.init_sentry()
    (kwargs,) = calls
    assert kwargs["trace_propagation_targets"] == []
    assert callable(kwargs["traces_sampler"])
    for hook in (kwargs["before_send"], kwargs["before_send_transaction"]):
        event = {"request": {"url": "/auth/google/callback", "query_string": "code=secret"}}
        assert hook(event, {}) == {"request": {"url": "/auth/google/callback"}}
        assert hook({"message": "x"}, {}) == {"message": "x"}


def test_traces_sampler_always_keeps_writes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(monitoring, "settings", SimpleNamespace(sentry_traces_sample_rate=0.05))
    sample = monitoring._traces_sampler
    assert sample({"asgi_scope": {"method": "POST"}}) == 1.0
    assert sample({"asgi_scope": {"method": "DELETE"}}) == 1.0
    assert sample({"asgi_scope": {"method": "GET"}}) == 0.05
    assert sample({}) == 0.05


def test_trace_scrape_forces_sampling(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "start_transaction", lambda **kw: calls.append(kw))
    monitoring.trace_scrape("x")
    assert calls == [{"op": "scrape", "name": "x", "sampled": True}]
