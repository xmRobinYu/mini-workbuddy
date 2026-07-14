"""Smoke tests for the FastAPI scaffold."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_endpoint() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_docs_available() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/docs")
    assert response.status_code == 200


def test_ping_endpoint() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/ping")
    assert response.status_code == 200
    assert response.json() == {"pong": "ok"}


def test_cors_header_for_dev_origin() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
