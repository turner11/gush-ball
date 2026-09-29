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
