from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://gush_ball:gush_ball@localhost:5432/gush_ball"
    session_secret: str = "dev-secret-change-me"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Object storage (S3-compatible / R2). Empty-string defaults, like the other settings above,
    # so the app still boots for local dev/tests without real credentials — only /uploads itself
    # would fail at request time if these are unset.
    object_storage_endpoint_url: str = ""
    object_storage_bucket: str = ""
    object_storage_access_key_id: str = ""
    object_storage_secret_access_key: str = ""
    object_storage_public_url: str = ""
    object_storage_region: str = "auto"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        # Render's DATABASE_URL (and any bare postgres:// URL) has no driver specified.
        # SQLAlchemy 2.x dropped the "postgres://" alias entirely, and "postgresql://"
        # defaults to psycopg2, which isn't installed (we only depend on psycopg[binary] v3).
        # Force the psycopg v3 driver so both `create_engine` and alembic boot correctly.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v


settings = Settings()
