import importlib.util
import json
from pathlib import Path

from sqlalchemy import create_engine, text

_path = next((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*_fold_game_videos_into_highlights.py"))
_spec = importlib.util.spec_from_file_location("fold_videos_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_fold_appends_videos_as_highlights_and_skips_empty() -> None:
    h_item = {"title": "h", "text": "t", "urls": ["u0"]}
    keep = [{"title": "keep", "text": None, "urls": ["k"]}]
    videos = [{"url": "u1", "title": "a", "title_en": "A"}, {"url": "u2", "title": "b", "title_en": None}]
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE games (id INTEGER PRIMARY KEY, videos JSON, highlights JSON)"))
        insert = text("INSERT INTO games (id, videos, highlights) VALUES (:id, :v, :h)")
        conn.execute(insert, {"id": 1, "v": json.dumps(videos), "h": json.dumps([h_item])})
        conn.execute(insert, {"id": 2, "v": "[]", "h": json.dumps(keep)})
        migration._fold_videos(conn)
        rows = {r[0]: json.loads(r[1]) for r in conn.execute(text("SELECT id, highlights FROM games"))}
    assert rows[1] == [h_item, {"title": "a", "text": None, "urls": ["u1"]}, {"title": "b", "text": None, "urls": ["u2"]}]
    assert rows[2] == keep
