"""Model management CRUD API.

Endpoints:
- GET    /api/models          list all configured models
- POST   /api/models          add a model (key stored in OS keychain)
- PUT    /api/models/{id}     replace a model config
- DELETE /api/models/{id}     remove a model config

Plaintext API keys are never persisted to ``models.json``; they are stored in
the OS keychain and referenced via ``keychain://<id>``. When the keychain is
unavailable the caller must supply ``api_key_env`` and ``api_key_ref`` stays
``null``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.schemas.model import ModelCreate, ModelRead, ModelUpdate, now_iso
from app.schemas.model_test import ModelTestResult
from app.services import keyring_service
from app.services.keyring_service import (
    KeychainUnavailableError,
    delete_api_key,
    ref_to_key_id,
    store_api_key,
)
from app.services.models_store import (
    add_model,
    delete_model,
    generate_id,
    get_model,
    list_models,
    update_model,
)
from app.services.model_tester import test_model_connection

router = APIRouter(prefix="/models", tags=["models"])


def _serialise(model: dict[str, Any]) -> ModelRead:
    """Validate a stored dict through the read schema before returning it."""
    return ModelRead.model_validate(model)


def _store_secret(model_id: str, api_key: str, api_key_env: str | None) -> tuple[str | None, str | None]:
    """Persist ``api_key`` to the keychain, or fall back to env reference.

    Returns ``(api_key_ref, api_key_env)`` to embed in the stored model dict.
    Raises 400 when neither keychain nor an env fallback is available.
    """
    try:
        api_key_ref = store_api_key(model_id, api_key)
        return api_key_ref, api_key_env
    except KeychainUnavailableError:
        if not api_key_env:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OS keychain 不可用，必须提供 api_key_env 作为降级方案",
            )
        # Keychain unavailable but caller supplied an env-var fallback.
        return None, api_key_env


@router.get("", response_model=list[ModelRead])
async def list_models_endpoint() -> list[ModelRead]:
    """Return all configured models from models.json (no plaintext keys)."""
    return [_serialise(m) for m in list_models()]


@router.post("", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
async def create_model_endpoint(payload: ModelCreate) -> ModelRead:
    """Add a new model. The plaintext key goes to the keychain only."""
    model_id = generate_id()
    api_key_ref, api_key_env = _store_secret(model_id, payload.api_key, payload.api_key_env)
    timestamp = now_iso()
    stored = {
        "id": model_id,
        "name": payload.name,
        "provider": payload.provider.value,
        "base_url": str(payload.base_url),
        "api_key_ref": api_key_ref,
        "api_key_env": api_key_env,
        "context_window_tokens": payload.context_window_tokens,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    add_model(stored)
    return _serialise(stored)


@router.put("/{model_id}", response_model=ModelRead)
async def update_model_endpoint(model_id: str, payload: ModelUpdate) -> ModelRead:
    """Replace a model config. Omit ``api_key`` to keep the existing secret."""
    existing = get_model(model_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="模型不存在"
        )

    if payload.api_key:
        # Re-store the secret under the same id; refresh the ref.
        api_key_ref, api_key_env = _store_secret(
            model_id, payload.api_key, payload.api_key_env
        )
    else:
        # Keep the existing secret reference. If the caller supplied a new
        # api_key_env, prefer it; otherwise retain the previous fallback.
        api_key_ref = existing.get("api_key_ref")
        api_key_env = payload.api_key_env if payload.api_key_env is not None else existing.get("api_key_env")

    updates = {
        "name": payload.name,
        "provider": payload.provider.value,
        "base_url": str(payload.base_url),
        "api_key_ref": api_key_ref,
        "api_key_env": api_key_env,
        "context_window_tokens": payload.context_window_tokens,
        "updated_at": now_iso(),
    }
    updated = update_model(model_id, updates)
    if updated is None:  # pragma: no cover - race with DELETE
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="模型不存在"
        )
    return _serialise(updated)


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_endpoint(model_id: str) -> None:
    """Delete a model config and its keychain secret (best-effort)."""
    existing = get_model(model_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="模型不存在"
        )
    key_id = ref_to_key_id(existing.get("api_key_ref"))
    if key_id:
        delete_api_key(key_id)
    delete_model(model_id)


@router.post("/{model_id}/test", response_model=ModelTestResult)
async def test_model_endpoint(model_id: str) -> ModelTestResult:
    """Probe a model's OpenAI-compatible endpoint to verify connectivity.

    This does not modify the stored model config; a failed test never blocks
    model save operations.
    """
    existing = get_model(model_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="模型不存在"
        )
    result = await test_model_connection(existing)
    return ModelTestResult(**result)

__all__ = ["router"]
