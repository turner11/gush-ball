import importlib.util
import json
from pathlib import Path

from sqlalchemy import create_engine, text

_path = next((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*_add_video_clips.py"))
_spec = importlib.util.spec_from_file_location("add_video_clips_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)

YT = "https://www.youtube.com/watch?v="


def _fields(clip: dict) -> tuple:
    return clip["source_url"], clip["start"], clip["end"], clip["section"], clip["note"]


def test_item_clips_converts_shapes_segments_text_and_non_youtube() -> None:
    # {url} shape with a segment; the title becomes the section
    item = {"title": " Q1 ", "text": "n", "url": f"{YT}abcdefghijk&t=1m30s&end=120"}
    assert [_fields(c) for c in migration._item_clips(item)] == [(f"{YT}abcdefghijk", 90, 120, "Q1", "n")]
    # {urls} shape: one clip per url, note on the first only; end <= start dropped
    two = migration._item_clips({"title": "", "text": "n", "urls": [f"{YT}aaaaaaaaaaa&t=50&end=40", f"{YT}bbbbbbbbbbb"]})
    assert [_fields(c) for c in two] == [
        (f"{YT}aaaaaaaaaaa", 50, None, None, "n"),
        (f"{YT}bbbbbbbbbbb", None, None, None, None),
    ]
    # text-only items (url None, urls [], missing)
    for item in ({"title": "T", "text": "x", "url": None}, {"title": "T", "text": "x", "urls": []}, {"title": "T", "text": "x"}):
        assert [_fields(c) for c in migration._item_clips(item)] == [(None, None, None, "T", "x")]
    # non-YouTube: verbatim, no segment
    other = "https://vimeo.com/1?t=30&end=60"
    assert [_fields(c) for c in migration._item_clips({"url": other})] == [(other, None, None, None, None)]
    # plain seconds and h/m/s
    assert migration._seconds("90") == 90 and migration._seconds("90s") == 90
    assert migration._seconds("1h2m3s") == 3723 and migration._seconds("abc") is None and migration._seconds("") is None


def test_item_clips_keeps_an_unparseable_t_and_any_youtube_host() -> None:
    # t=1:30 is not a duration: the param stays in the URL rather than being lost
    kept = migration._item_clips({"url": f"{YT}abcdefghijk&t=1:30"})
    assert [_fields(c) for c in kept] == [(f"{YT}abcdefghijk&t=1%3A30", None, None, None, None)]
    # any *youtube.com host (music., gaming., ...) is split like the frontend youtubeId does
    music = migration._item_clips({"url": "https://music.youtube.com/watch?v=abcdefghijk&t=5"})
    assert [_fields(c) for c in music] == [("https://music.youtube.com/watch?v=abcdefghijk", 5, None, None, None)]


def test_migrate_writes_highlight_briefing_and_player_clips() -> None:
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE games (id INTEGER PRIMARY KEY, team_id INT, highlights JSON, briefing JSON, video_urls JSON)"))
        conn.execute(text("CREATE TABLE players (id INTEGER PRIMARY KEY, team_id INT, briefing JSON)"))
        conn.execute(
            text(
                'CREATE TABLE video_clips (id INTEGER PRIMARY KEY, team_id INT, game_id INT, source_url TEXT, start INT, "end" INT, '
                "section TEXT, note TEXT, is_highlight BOOL, in_game_briefing BOOL, in_player_briefing BOOL, player_ids JSON)"
            )
        )
        conn.execute(
            text("INSERT INTO games VALUES (1, 7, :h, :b, :v)"),
            {
                "h": json.dumps([{"title": "H", "url": f"{YT}aaaaaaaaaaa&t=5"}]),
                "b": json.dumps([{"title": "B", "text": "only text", "urls": []}]),
                "v": '["keep"]',
            },
        )
        conn.execute(text("INSERT INTO players VALUES (3, 7, :b)"), {"b": json.dumps([{"title": "P", "urls": [f"{YT}ccccccccccc"]}])})
        conn.execute(text("INSERT INTO players VALUES (4, 7, '[]')"))
        migration._migrate(conn)
        rows = conn.execute(
            text(
                'SELECT team_id, game_id, source_url, start, "end", section, note, is_highlight, in_game_briefing, '
                "in_player_briefing, player_ids FROM video_clips ORDER BY id"
            )
        ).all()
        assert conn.execute(text("SELECT video_urls FROM games")).scalar() == '["keep"]'
    got = [(*r[:7], bool(r[7]), bool(r[8]), bool(r[9]), r[10] if isinstance(r[10], list) else json.loads(r[10])) for r in rows]
    assert got == [
        (7, 1, f"{YT}aaaaaaaaaaa", 5, None, "H", None, True, False, False, []),
        (7, 1, None, None, None, "B", "only text", False, True, False, []),
        (7, None, f"{YT}ccccccccccc", None, None, "P", None, False, False, True, [3]),
    ]
