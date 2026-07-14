"""Tests for the model connection test API (US-004).

Covers all acceptance criteria:
- POST /api/models/{id}/test initiates a connection test
- Uses httpx to call the model's OpenAI-compatible /v1/chat/completions
- Success returns { success: true, latency_ms: <number> }
- Failure returns { success: false, error: '<message>' } distinguishing
  network timeout / auth failure / model not found
- A failed test does not block model save (test endpoint is side-effect free)
- Validates OpenAI /v1/chat/completions response format
- Typecheck passes (mypy)
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import keyring
import keyring.backend
import keyring.backends.fail
from fastapi.testclient import TestClient

from app.core.config import MODELS_FILE
from app.main import create_app
from app.services import keyring_service, models_store


class _MemoryKeyring(keyring.backend.KeyringBackend):
    """In-memory keyring backend for deterministic test-only secret storage."""

    priority = 1  # noqa: RUF012

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], str] = {}

    def set_password(self, service: str, username: str, password: str) -> None:
        self._store[(service, username)] = password

    def get_password(self, service: str, username: str) -> str | None:
        return self._store.get((service, username))

    def delete_password(self, service: str, username: str) -> None:
        self._store.pop((service, username), None)


def _install_memory_keyring() -> _MemoryKeyring:
    backend = _MemoryKeyring()
    keyring.set_keyring(backend)
    return backend


def _reset_models_file() -> None:
    MODELS_FILE.parent.mkdir(parents=True, exist_ok=True)
    MODELS_FILE.write_text("[]", encoding="utf-8")


def _create_model_via_api(client: TestClient) -> str:
    """Create a model via the API and return its id."""
    resp = client.post(
        "/api/models",
        json={
            "name": "test-model",
            "provider": "custom",
            "base_url": "https://api.example.com/v1",
            "api_key": "sk-test-key",
            "context_window_tokens": 4096,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _mock_response(
    status_code: int = 200,
    json_body: Any | None = None,
    reason: str = "OK",
) -> httpx.Response:
    """Build a fake httpx.Response for testing."""
    if json_body is None:
        json_body = {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "choices": [{"message": {"content": "ok"}, "index": 0}],
        }
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    return httpx.Response(
        status_code=status_code,
        json=json_body,
        request=request,
        headers={"content-type": "application/json"},
    )


def test_connection_success_returns_success_and_latency() -> None:
    """AC: 连接成功时返回 { success: true, latency_ms: <数值> }."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(return_value=_mock_response(200))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0
    assert body["error"] is None


def test_connection_timeout_returns_timeout_error() -> None:
    """AC: 错误信息区分网络超时."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "连接超时" in body["error"]
    assert body["latency_ms"] is None


def test_connection_auth_failure_returns_auth_error() -> None:
    """AC: 错误信息区分认证失败 (HTTP 401)."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(return_value=_mock_response(401, reason="Unauthorized"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "认证失败" in body["error"]


def test_connection_model_not_found_returns_model_error() -> None:
    """AC: 错误信息区分模型不存在 (HTTP 404)."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(return_value=_mock_response(404, reason="Not Found"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "模型不存在" in body["error"]


def test_connection_connect_error_returns_connection_error() -> None:
    """AC: 连接失败时返回具体错误信息 (network connection error)."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "连接失败" in body["error"]


def test_connection_non_openai_response_returns_compat_error() -> None:
    """AC: 校验 OpenAI /v1/chat/completions 格式 (missing 'choices')."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(
        return_value=_mock_response(200, json_body={"unexpected": "body"})
    )
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "OpenAI" in body["error"] or "格式" in body["error"]


def test_connection_500_returns_generic_http_error() -> None:
    """AC: 其他 HTTP 错误也返回具体错误信息."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    mock_post = AsyncMock(return_value=_mock_response(500, reason="Internal Server Error"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "HTTP 500" in body["error"]


def test_connection_test_does_not_modify_model() -> None:
    """AC: 测试连接失败不阻塞模型保存操作 (test is side-effect free)."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    # Run a failing test
    mock_post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")
    assert resp.json()["success"] is False

    # Model should still exist and be unmodified
    get_resp = client.get("/api/models")
    assert get_resp.status_code == 200
    models = get_resp.json()
    assert len(models) == 1
    assert models[0]["id"] == model_id
    assert models[0]["name"] == "test-model"


def test_connection_test_nonexistent_model_returns_404() -> None:
    """Test endpoint returns 404 for a model that doesn't exist."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models/nonexistent-id/test")
    assert resp.status_code == 404


def test_connection_test_no_api_key_returns_auth_error() -> None:
    """When no API key is configured, returns auth failure error."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())
    model_id = _create_model_via_api(client)

    # Wipe the keychain so _resolve_api_key returns None
    keyring_service.delete_api_key(model_id)

    resp = client.post(f"/api/models/{model_id}/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "认证失败" in body["error"]


def test_connection_test_uses_env_fallback_key() -> None:
    """When keychain unavailable, falls back to api_key_env."""
    keyring.set_keyring(keyring.backends.fail.Keyring())
    _reset_models_file()
    client = TestClient(create_app())

    import os
    os.environ["TEST_MODEL_KEY"] = "sk-env-key"

    resp = client.post(
        "/api/models",
        json={
            "name": "env-model",
            "provider": "custom",
            "base_url": "https://api.example.com/v1",
            "api_key": "ignored",
            "api_key_env": "TEST_MODEL_KEY",
            "context_window_tokens": 4096,
        },
    )
    assert resp.status_code == 201
    model_id = resp.json()["id"]

    mock_post = AsyncMock(return_value=_mock_response(200))
    with patch("httpx.AsyncClient.post", mock_post):
        resp = client.post(f"/api/models/{model_id}/test")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True

    del os.environ["TEST_MODEL_KEY"]
