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
    )
