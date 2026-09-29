from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://gush_ball:gush_ball@localhost:5432/gush_ball"
    session_secret: str = Field(min_length=32)
    cors_origins: list[str] = ["http://localhost:5173"]
    enable_docs: bool = False

    # Object storage (S3-compatible / R2). Empty-string defaults, like the other settings above,
    # so the app still boots for local dev/tests without real credentials — only /uploads itself
    # would fail at request time if these are unset.
    object_storage_endpoint_url: str = ""
    object_storage_bucket: str = ""
    object_storage_access_key_id: str = ""
    object_storage_secret_access_key: str = ""
    object_storage_public_url: str = ""
    object_storage_region: str = "auto"

    # BBStats Streamlit app. Empty default so an unset prod value is obvious, not a localhost link.
    stats_url: str = ""


settings = Settings()
