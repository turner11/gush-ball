import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_docs_not_served() -> None:
    client = TestClient(app)
    for path in ("/openapi.json", "/docs", "/redoc"):
        assert client.get(path).status_code == 404


def test_sentry_test_route_full_admin_only(client: TestClient) -> None:
    assert client.get("/health/sentry-test").status_code == 401


def test_sentry_test_route_raises_for_admin(admin_client: TestClient) -> None:
    with pytest.raises(RuntimeError, match="Sentry backend test error"):
        admin_client.get("/health/sentry-test")
