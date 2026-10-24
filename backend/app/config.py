import json
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ENV_EXAMPLE_SECRET = "replace-with-a-random-value-of-at-least-32-chars"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://gush_ball:gush_ball@localhost:5432/gush_ball"
    session_secret: str = Field(min_length=32)
    cors_origins: list[str] = ["http://localhost:5173"]
    enable_docs: bool = False

    # Sentry error reporting; empty = monitoring off (dev/CI).
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = Field(1.0, ge=0, le=1)  # reads only; writes and scrapes are always traced

    # Object storage (S3-compatible / R2). Empty-string defaults, like the other settings above,
    # so the app still boots for local dev/tests without real credentials — only /uploads itself
    # would fail at request time if these are unset.
    object_storage_endpoint_url: str = ""
    object_storage_bucket: str = ""
    object_storage_access_key_id: str = ""
    object_storage_secret_access_key: str = ""
    object_storage_public_url: str = ""
    object_storage_region: str = "auto"

    # Site origin used to build password-reset links and the Google redirect URI. Never derive it from
    # the Host header: that would allow reset-link poisoning.
    public_url: str = "http://localhost:5173"
    # Club id -> the club's own origin (#485). The Host header is only matched against these values to pick a
    # club; it is never echoed into a URL.
    club_domains: Annotated[dict[int, str], NoDecode] = {}

    # Google sign-in is enabled only when both are set.
    google_client_id: str = ""
    google_client_secret: str = ""

    # Password-reset and signup-verification email. Empty smtp_host: the link is only logged when public_url is http (local dev); with https, both return 503.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # BBStats Streamlit app. Empty default so an unset prod value is obvious, not a localhost link.
    stats_url: str = ""
    # Google Sheet (headers only, shared "anyone with the link") that admins copy to start a game.
    stats_template_url: str = ""

    @field_validator("club_domains", mode="before")
    @classmethod
    def parse_club_domains(cls, value: object) -> object:
        if isinstance(value, str):
            value = json.loads(value or "{}")
        if not isinstance(value, dict):
            return value
        origins = {}
        for club_id, origin in value.items():
            parts = urlsplit(str(origin).rstrip("/"))
            if parts.scheme not in ("http", "https") or not parts.netloc or parts.path or parts.query or parts.fragment:
                raise ValueError(f"CLUB_DOMAINS[{club_id}]={origin!r} is not an origin like https://example.com")
            origins[club_id] = str(origin).rstrip("/")
        return origins

    @field_validator("session_secret")
    @classmethod
    def reject_env_example_secret(cls, value: str) -> str:
        if value == ENV_EXAMPLE_SECRET:
            raise ValueError(
                "SESSION_SECRET is the public .env.example placeholder; generate a real one with the command in .env.example"
            )
        return value


settings = Settings()
