import logging

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

from app.config import settings


def init_sentry() -> None:
    """Start error reporting; no-op when SENTRY_DSN is unset (dev/CI). Shared by the API and the scrape CLI."""
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        send_default_pii=False,
        # The default "medium" sends JSON bodies (signup email, passwords) even without PII.
        max_request_body_size="never",
        # Frame locals would carry payload.email / payload.password in auth routes.
        include_local_variables=False,
        # level=None: no log breadcrumbs (auth.py logs login identifiers, which can be emails).
        # ERROR logs still become events.
        integrations=[LoggingIntegration(level=None, event_level=logging.ERROR)],
        traces_sampler=_traces_sampler,
        # No downstream Sentry service: don't add sentry-trace/baggage headers to ibasketball or Google calls.
        trace_propagation_targets=[],
        before_send=_drop_query_string,
        before_send_transaction=_drop_query_string,
    )


def _traces_sampler(sampling_context: dict) -> float:
    """Writes are rare and are the CRUD worth tracing; public reads are the volume, so they use the env rate."""
    method = sampling_context.get("asgi_scope", {}).get("method")
    if method is not None and method not in ("GET", "HEAD", "OPTIONS"):
        return 1.0
    return settings.sentry_traces_sample_rate


def _drop_query_string(event: dict, hint: dict) -> dict:
    """The ASGI integration sends query_string even without PII; /auth/google/callback carries the OAuth code."""
    event.get("request", {}).pop("query_string", None)
    return event


def trace_scrape(name: str):
    """One transaction per scrape run. sampled=True: a scrape is never sampled out (inert when tracing is off)."""
    return sentry_sdk.start_transaction(op="scrape", name=name, sampled=True)
