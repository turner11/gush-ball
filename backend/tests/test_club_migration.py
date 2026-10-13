import importlib.util
from pathlib import Path

from sqlalchemy import create_engine, text

_path = next((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*_add_clubs.py"))
_spec = importlib.util.spec_from_file_location("clubs_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_seed_clubs_one_row_per_distinct_name() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE teams (id INTEGER PRIMARY KEY, club TEXT)"))
        conn.execute(text("CREATE TABLE memberships (id INTEGER PRIMARY KEY, club TEXT)"))
        conn.execute(text("CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, ibasketball_url TEXT)"))
        conn.execute(text("INSERT INTO teams (club) VALUES ('Gush'), ('Gush'), (NULL)"))
        conn.execute(text("INSERT INTO memberships (club) VALUES ('Gush'), ('Solo'), (NULL)"))
        migration._seed_clubs(conn)
        rows = conn.execute(text("SELECT name, ibasketball_url FROM clubs ORDER BY name")).all()
    assert [tuple(r) for r in rows] == [("Gush", None), ("Solo", None)]
