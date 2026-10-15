import importlib.util
from pathlib import Path

from sqlalchemy import create_engine, text

_path = next(
    (Path(__file__).resolve().parents[1] / "alembic" / "versions").glob(
        "*_admin_scopes_to_memberships.py"
    )
)
_spec = importlib.util.spec_from_file_location("memberships_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_scopes_migrate_without_losing_or_gaining_rights() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE admin_users (id INTEGER PRIMARY KEY, username TEXT, team_id INTEGER, club TEXT, "
                "is_full_admin BOOLEAN NOT NULL DEFAULT 0)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE memberships (id INTEGER PRIMARY KEY, user_id INTEGER, team_id INTEGER, club TEXT, role TEXT)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO admin_users (id, username, team_id, club) VALUES "
                "(1, 'full', NULL, NULL), (2, 'team', 7, NULL), (3, 'club', NULL, 'Gush'), (4, 'both', 7, 'Gush')"
            )
        )
        migration._migrate_scopes(conn)

        full = [
            r[0]
            for r in conn.execute(
                text("SELECT id FROM admin_users WHERE is_full_admin ORDER BY id")
            )
        ]
        rows = conn.execute(
            text("SELECT user_id, team_id, club, role FROM memberships ORDER BY user_id")
        ).all()
    assert full == [1]
    assert [tuple(r) for r in rows] == [
        (2, 7, None, "admin"),
        (3, None, "Gush", "admin"),
        (4, 7, None, "admin"),
    ]
