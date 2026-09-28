from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://gush_ball:gush_ball@localhost:5432/gush_ball"
    session_secret: str = "dev-secret-change-me"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
