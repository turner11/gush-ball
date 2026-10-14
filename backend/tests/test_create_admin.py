import sys

import pytest
from sqlalchemy import select

from app.models import AdminUser
from app.security import verify_password
from scripts import create_admin


def _run(monkeypatch, db_session, prompts):
    queue = iter(prompts)
    monkeypatch.setattr(create_admin, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(create_admin.getpass, "getpass", lambda _prompt="": next(queue))
    monkeypatch.setattr(sys, "argv", ["create_admin.py", "boss"])
    create_admin.main()


def test_create_admin_reads_password_from_prompt(monkeypatch, db_session):
    _run(monkeypatch, db_session, ["s3cretpass", "s3cretpass"])
    user = db_session.scalar(select(AdminUser).where(AdminUser.username == "boss"))
    assert user.is_full_admin
    assert verify_password("s3cretpass", user.password_hash)


@pytest.mark.parametrize("prompts", [["short", "short"], ["s3cretpass", "different1"]])
def test_create_admin_rejects_bad_password(monkeypatch, db_session, prompts):
    with pytest.raises(SystemExit) as exc:
        _run(monkeypatch, db_session, prompts)
    assert exc.value.code == 1
    assert db_session.scalar(select(AdminUser).where(AdminUser.username == "boss")) is None
