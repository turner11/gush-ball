from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import AdminUser, Team
from app.security import hash_password


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _get_db_override() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def admin_client(client: TestClient, db_session: Session) -> TestClient:
    admin = AdminUser(username="admin", password_hash=hash_password("password123"))
    db_session.add(admin)
    db_session.commit()
    response = client.post("/auth/login", json={"username": "admin", "password": "password123"})
    assert response.status_code == 200
    return client


@pytest.fixture()
def own_team(db_session: Session) -> Team:
    team = Team(name="Own", slug="own")
    db_session.add(team)
    db_session.commit()
    return team


@pytest.fixture()
def team_admin_client(client: TestClient, db_session: Session, own_team: Team) -> TestClient:
    """Logs in as a team admin. Shares the cookie jar with admin_client: never use both in one test."""
    db_session.add(
        AdminUser(username="teamadmin", password_hash=hash_password("password123"), team_id=own_team.id)
    )
    db_session.commit()
    response = client.post("/auth/login", json={"username": "teamadmin", "password": "password123"})
    assert response.status_code == 200
    return client
