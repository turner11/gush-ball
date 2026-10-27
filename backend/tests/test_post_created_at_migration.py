import importlib.util
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import AuditLog, Team, TeamPost

_path = next((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*_add_team_posts_game_id_and_created_at.py"))
_spec = importlib.util.spec_from_file_location("post_created_at_migration", _path)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_backfill_takes_audit_create_time_and_leaves_untracked_null(db_session: Session, own_team: Team) -> None:
    tracked, untracked = (TeamPost(team_id=own_team.id, title=t, body="x") for t in "ab")
    db_session.add_all([tracked, untracked])
    db_session.commit()
    when = datetime(2025, 3, 4, 12, tzinfo=UTC)
    for post in (tracked, untracked):
        post.created_at = None
    db_session.query(AuditLog).filter_by(entity_type="post", entity_id=tracked.id).update({"created_at": when})
    db_session.execute(delete(AuditLog).where(AuditLog.entity_id == untracked.id, AuditLog.entity_type == "post"))
    db_session.commit()

    migration._backfill(db_session.connection())
    db_session.expire_all()

    assert tracked.created_at.replace(tzinfo=None) == when.replace(tzinfo=None)
    assert untracked.created_at is None
