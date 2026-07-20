"""JSON file persistence for model configurations.

Reads and writes ``workspace/config/models.json`` under an exclusive file lock
so concurrent requests cannot corrupt the list. All write helpers accept and
return plain ``dict`` objects matching the ``ModelRead`` schema.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from filelock import FileLock

from app.core.config import CONFIG_DIR, MODELS_FILE

LOCK_FILE = CONFIG_DIR / "models.json.lock"


def _ensure_file() -> None:
    """Make sure models.json exists before we try to read or lock it."""
    if not MODELS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        MODELS_FILE.write_text("[]", encoding="utf-8")


def _migrate_record(record: dict[str, Any]) -> dict[str, Any]:
    """Backfill/normalise fields so legacy ``models.json`` rows never break reads.

    Older records (pre US-002) lack the ``model`` supplier-model field and the
    ``is_default`` flag. ``ModelRead`` declares both, so any missing field would
    raise a pydantic ``ValidationError`` at serialisation time and turn
    ``GET /api/models`` into a 500. We patch each record on read:

    - ``model``: fall back to the display ``name`` when absent/empty.
    - ``is_default``: default to ``False`` when absent/non-bool.

    The returned dict is the same object that was passed in (mutated in place),
    so callers that later write the list back will persist the migration.
    """
    if not record.get("model"):
        record["model"] = record.get("name") or ""
    if not isinstance(record.get("is_default"), bool):
        record["is_default"] = False
    return record


def _read_all() -> list[dict[str, Any]]:
    _ensure_file()
    raw = MODELS_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        return []
    return [_migrate_record(item) for item in data if isinstance(item, dict)]


def _write_all(models: list[dict[str, Any]]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_FILE.write_text(
        json.dumps(models, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def list_models() -> list[dict[str, Any]]:
    """Return all stored model configs (lock-guarded read)."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        return _read_all()


def get_model(model_id: str) -> dict[str, Any] | None:
    """Return a single model dict by id, or ``None`` if not found."""
    for model in list_models():
        if model.get("id") == model_id:
            return model
    return None


def add_model(model: dict[str, Any]) -> dict[str, Any]:
    """Append a new model dict (caller supplies all fields incl. id/timestamps)."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        models = _read_all()
        models.append(model)
        _write_all(models)
        return model


def update_model(model_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    """Replace fields on an existing model. Returns the updated dict or None."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        models = _read_all()
        for model in models:
            if model.get("id") == model_id:
                model.update(updates)
                _write_all(models)
                return model
        return None


def delete_model(model_id: str) -> bool:
    """Remove a model by id. Returns True if a row was deleted."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        models = _read_all()
        remaining = [m for m in models if m.get("id") != model_id]
        if len(remaining) == len(models):
            return False
        _write_all(remaining)
        return True


def generate_id() -> str:
    """Generate a stable unique id for a new model config."""
    return str(uuid.uuid4())


def get_default_model() -> dict[str, Any] | None:
    """Return the model flagged ``is_default=True``, or ``None`` if none."""
    for model in list_models():
        if model.get("is_default") is True:
            return model
    return None


def set_default_model(model_id: str) -> dict[str, Any] | None:
    """Flag ``model_id`` as the sole default model.

    Clears ``is_default`` on every other model in a single locked write so the
    "at most one default" invariant always holds. Returns the updated model
    dict, or ``None`` when ``model_id`` does not exist.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        models = _read_all()
        found = False
        for model in models:
            if model.get("id") == model_id:
                model["is_default"] = True
                model["updated_at"] = _now_iso()
                found = True
            elif model.get("is_default") is True:
                model["is_default"] = False
        if not found:
            return None
        _write_all(models)
        for model in models:
            if model.get("id") == model_id:
                return model
        return None  # pragma: no cover - found implies present


def _now_iso() -> str:
    """Current UTC ISO-8601 timestamp (avoids importing schema into store)."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def reset_for_test(models_file: Path | None = None) -> None:
    """Test helper: wipe models.json so each test starts from an empty list."""
    target = models_file or MODELS_FILE
    if target.exists():
        target.write_text("[]", encoding="utf-8")
    lock_path = target.with_suffix(".json.lock")
    if lock_path.exists():
        lock_path.unlink()
