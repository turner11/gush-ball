from app.config import Settings


def test_database_url_normalizes_bare_postgres_scheme() -> None:
    # Render's fromDatabase connectionString comes back as a bare "postgres://" URL with
    # no driver — SQLAlchemy 2.x no longer accepts that alias at all.
    settings = Settings(database_url="postgres://user:pass@host:5432/dbname")
    assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/dbname"


def test_database_url_normalizes_postgresql_scheme_without_driver() -> None:
    # Bare "postgresql://" defaults to the psycopg2 driver, which isn't installed
    # (only psycopg[binary] v3 is a dependency).
    settings = Settings(database_url="postgresql://user:pass@host:5432/dbname")
    assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/dbname"


def test_database_url_leaves_explicit_driver_untouched() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:pass@host:5432/dbname")
    assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/dbname"
