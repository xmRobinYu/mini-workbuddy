"""Tests for the model management CRUD API (US-003).

Covers all acceptance criteria:
- GET/POST/PUT/DELETE /api/models
- models.json schema (id, name, provider, base_url, api_key_ref,
  api_key_env, context_window_tokens, created_at, updated_at)
- no plaintext API key in models.json
- base_url URL validation + context_window_tokens positive-integer validation
"""

from __future__ import annotations

import json

import keyring
import keyring.backend
import keyring.backends.fail
from fastapi.testclient import TestClient

from app.core.config import MODELS_FILE
from app.main import create_app
from app.services import keyring_service, models_store


class _MemoryKeyring(keyring.backend.KeyringBackend):
    """In-memory keyring backend for deterministic test-only secret storage."""

    priority = 1  # noqa: RUF012 - keyring requires a class attr

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


def _install_fail_keyring() -> None:
    """Simulate a headless environment without a usable keychain."""
    keyring.set_keyring(keyring.backends.fail.Keyring())


def _reset_models_file() -> None:
    """Ensure each test starts from an empty models.json."""
    MODELS_FILE.parent.mkdir(parents=True, exist_ok=True)
    MODELS_FILE.write_text("[]", encoding="utf-8")


def _read_models_json() -> list[dict]:
    return json.loads(MODELS_FILE.read_text(encoding="utf-8"))


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "name": "DeepSeek V3",
        "model": "deepseek-chat",
        "provider": "deepseek",
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-test-secret-123",
        "context_window_tokens": 100000,
    }
    base.update(overrides)
    return base


def test_create_and_list_model_with_keychain() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models", json=_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body) >= {
        "id", "name", "model", "provider", "base_url", "api_key_ref",
        "api_key_env", "context_window_tokens", "is_default",
        "created_at", "updated_at",
    }
    assert body["name"] == "DeepSeek V3"
    assert body["model"] == "deepseek-chat"
    assert body["provider"] == "deepseek"
    assert body["context_window_tokens"] == 100000
    assert body["is_default"] is False
    assert body["api_key_ref"] == f"keychain://{body['id']}"
    assert body["api_key_env"] is None

    # GET returns the same model.
    resp = client.get("/api/models")
    assert resp.status_code == 200
    models = resp.json()
    assert len(models) == 1
    assert models[0]["id"] == body["id"]


def test_models_json_has_no_plaintext_key() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    client.post("/api/models", json=_payload(api_key="sk-super-secret"))

    raw = MODELS_FILE.read_text(encoding="utf-8")
    assert "sk-super-secret" not in raw
    stored = _read_models_json()
    assert len(stored) == 1
    assert "api_key" not in stored[0]
    assert stored[0]["api_key_ref"] == f"keychain://{stored[0]['id']}"


def test_keychain_secret_actually_stored() -> None:
    backend = _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models", json=_payload(api_key="sk-real-key"))
    model_id = resp.json()["id"]
    assert backend.get_password(keyring_service.SERVICE_NAME, model_id) == "sk-real-key"


def test_create_without_keychain_requires_env_fallback() -> None:
    _install_fail_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    # No keychain AND no api_key_env -> 400.
    resp = client.post("/api/models", json=_payload())
    assert resp.status_code == 400

    # With api_key_env -> stored with null api_key_ref.
    resp = client.post("/api/models", json=_payload(api_key_env="DEEPSEEK_API_KEY"))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["api_key_ref"] is None
    assert body["api_key_env"] == "DEEPSEEK_API_KEY"


def test_update_model_full_replacement() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    created = client.post("/api/models", json=_payload()).json()
    model_id = created["id"]

    update = _payload(
        name="Qwen Max",
        provider="alibaba",
        base_url="https://dashscope.aliyuncs.com/v1",
        context_window_tokens=32000,
        api_key="sk-new-key",
    )
    resp = client.put(f"/api/models/{model_id}", json=update)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Qwen Max"
    assert body["provider"] == "alibaba"
    assert body["context_window_tokens"] == 32000
    assert body["created_at"] == created["created_at"]
    assert body["updated_at"] >= created["updated_at"]


def test_update_without_api_key_keeps_existing_ref() -> None:
    backend = _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    created = client.post("/api/models", json=_payload(api_key="sk-original")).json()
    model_id = created["id"]
    original_ref = created["api_key_ref"]

    update = _payload(api_key=None)
    resp = client.put(f"/api/models/{model_id}", json=update)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["api_key_ref"] == original_ref
    # Keychain secret unchanged.
    assert backend.get_password(keyring_service.SERVICE_NAME, model_id) == "sk-original"


def test_update_nonexistent_returns_404() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.put("/api/models/does-not-exist", json=_payload())
    assert resp.status_code == 404


def test_delete_model_removes_config_and_secret() -> None:
    backend = _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    created = client.post("/api/models", json=_payload(api_key="sk-to-delete")).json()
    model_id = created["id"]

    resp = client.delete(f"/api/models/{model_id}")
    assert resp.status_code == 204
    assert client.get("/api/models").json() == []
    assert backend.get_password(keyring_service.SERVICE_NAME, model_id) is None


def test_delete_nonexistent_returns_404() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.delete("/api/models/missing")
    assert resp.status_code == 404


def test_invalid_base_url_rejected() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models", json=_payload(base_url="not-a-url"))
    assert resp.status_code == 422


def test_non_positive_context_window_rejected() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models", json=_payload(context_window_tokens=0))
    assert resp.status_code == 422

    resp = client.post("/api/models", json=_payload(context_window_tokens=-5))
    assert resp.status_code == 422


def test_invalid_provider_rejected() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.post("/api/models", json=_payload(provider="openai"))
    assert resp.status_code == 422


def test_get_returns_models_from_models_json() -> None:
    """GET reads directly from workspace/config/models.json (AC #1)."""
    _install_memory_keyring()
    _reset_models_file()
    # Seed models.json directly to prove GET reads the file.
    models_store.add_model({
        "id": "seed-1",
        "name": "Seeded",
        "model": "seeded-model",
        "provider": "custom",
        "base_url": "https://example.com/v1",
        "api_key_ref": "keychain://seed-1",
        "api_key_env": None,
        "context_window_tokens": 8000,
        "is_default": False,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    })
    client = TestClient(create_app())

    resp = client.get("/api/models")
    assert resp.status_code == 200
    models = resp.json()
    assert len(models) == 1
    assert models[0]["id"] == "seed-1"
    assert models[0]["provider"] == "custom"


def test_create_requires_supplier_model_field() -> None:
    """AC: model 字段必填；缺失时 422."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    payload = _payload()
    del payload["model"]
    resp = client.post("/api/models", json=payload)
    assert resp.status_code == 422


def test_create_with_is_default_clears_other_defaults() -> None:
    """AC: is_default=True 时保证全局仅一个默认模型."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    first = client.post("/api/models", json=_payload(is_default=True)).json()
    second = client.post("/api/models", json=_payload(is_default=True)).json()

    models = client.get("/api/models").json()
    defaults = [m for m in models if m["is_default"] is True]
    assert len(defaults) == 1
    assert defaults[0]["id"] == second["id"]
    # The first model must have lost its default flag.
    assert next(m for m in models if m["id"] == first["id"])["is_default"] is False


def test_put_default_marks_sole_default() -> None:
    """AC: PUT /api/models/{id}/default 保证全局仅一个默认模型."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    first = client.post("/api/models", json=_payload(is_default=True)).json()
    second = client.post("/api/models", json=_payload()).json()

    resp = client.put(f"/api/models/{second['id']}/default")
    assert resp.status_code == 200
    assert resp.json()["is_default"] is True

    models = client.get("/api/models").json()
    defaults = [m for m in models if m["is_default"] is True]
    assert len(defaults) == 1
    assert defaults[0]["id"] == second["id"]


def test_put_default_nonexistent_returns_404() -> None:
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    resp = client.put("/api/models/does-not-exist/default")
    assert resp.status_code == 404


def test_update_propagates_is_default() -> None:
    """AC: PUT /api/models/{id} 支持读写 is_default."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    first = client.post("/api/models", json=_payload(is_default=True)).json()
    second = client.post("/api/models", json=_payload()).json()

    resp = client.put(
        f"/api/models/{second['id']}",
        json=_payload(is_default=True, api_key=None),
    )
    assert resp.status_code == 200
    assert resp.json()["is_default"] is True

    models = client.get("/api/models").json()
    defaults = [m for m in models if m["is_default"] is True]
    assert len(defaults) == 1
    assert defaults[0]["id"] == second["id"]
    assert next(m for m in models if m["id"] == first["id"])["is_default"] is False


def test_model_field_persisted_and_returned() -> None:
    """AC: model 字段被持久化并可读回."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    created = client.post("/api/models", json=_payload(model="qwen-max")).json()
    assert created["model"] == "qwen-max"

    stored = _read_models_json()
    assert stored[0]["model"] == "qwen-max"

    fetched = client.get("/api/models").json()
    assert fetched[0]["model"] == "qwen-max"


def test_model_response_never_contains_plaintext_key() -> None:
    """AC: 读取模型响应永不包含明文 api_key."""
    _install_memory_keyring()
    _reset_models_file()
    client = TestClient(create_app())

    created = client.post(
        "/api/models", json=_payload(api_key="sk-plaintext-secret")
    ).json()
    assert "api_key" not in created

    listed = client.get("/api/models").json()
    assert "api_key" not in listed[0]

    raw = MODELS_FILE.read_text(encoding="utf-8")
    assert "sk-plaintext-secret" not in raw
