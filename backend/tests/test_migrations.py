from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_single_alembic_head() -> None:
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    assert len(ScriptDirectory.from_config(cfg).get_heads()) == 1
