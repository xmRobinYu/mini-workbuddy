"""File upload and Agent output-file service (US-012).

Two concerns live here:

- *uploads* — files the user attaches as context. They are stored either under
  the conversation's directory (when a ``conversation_id`` is supplied) or in a
  shared ``uploads/`` temp directory. A hard 5 MB cap is enforced on the
  received byte stream before anything is written.
- *outputs* — files produced by the Agent loop under
  ``workspace/conversations/{id}/outputs/``. The store lists them (filename /
  size / mtime) and streams their bytes back for download/preview.

All path handling funnels through :func:`is_safe_workspace_path` so a forged
filename (``../etc/passwd``) or conversation id cannot escape ``workspace/``.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.core.config import CONVERSATIONS_DIR, WORKSPACE_DIR
from app.core.path_security import is_safe_workspace_path

# ── Limits ──────────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB single-file cap (acceptance criterion)

# Shared temp location when no conversation id is supplied.
UPLOADS_DIR = WORKSPACE_DIR / "uploads"


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _outputs_dir(conversation_id: str) -> Path:
    """Return the ``outputs/`` directory owned by ``conversation_id``."""
    return CONVERSATIONS_DIR / conversation_id / "outputs"


def _safe_filename(filename: str) -> str:
    """Return a basename-only filename, falling back to a generated name.

    Strips any directory component and rejects ``..``/path separators so an
    attacker cannot traverse out of the target directory via the filename.
    """
    # ``Path`` extracts the final component regardless of platform separators.
    base = Path(filename).name
    base = base.strip()
    if not base or base in {".", ".."}:
        return f"upload-{uuid.uuid4().hex[:8]}"
    return base


def _ensure_uploads_dir() -> Path:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


def store_upload(
    upload: UploadFile,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """Persist ``upload`` and return a summary dict.

    The 5 MB limit is enforced *while reading* so we never buffer a full
    oversized file in memory. Returns a dict with keys: filename,
    stored_filename, size, path, content_type.
    """
    original_name = _safe_filename(upload.filename or "")
    content_type = upload.content_type or ""

    # Decide the destination directory.
    if conversation_id:
        dest_dir = CONVERSATIONS_DIR / conversation_id / "uploads"
    else:
        dest_dir = _ensure_uploads_dir()

    # Guard against path traversal via a forged conversation id.
    if not is_safe_workspace_path(dest_dir):
        raise ValueError("非法的会话 id：目标目录越界 workspace/")

    dest_dir.mkdir(parents=True, exist_ok=True)

    # Unique prefix to avoid collisions across uploads of the same name.
    stored_filename = f"{uuid.uuid4().hex[:8]}_{original_name}"
    dest_path = dest_dir / stored_filename

    size = 0
    try:
        with dest_path.open("wb") as out:
            while True:
                chunk = upload.file.read(64 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    out.close()
                    dest_path.unlink(missing_ok=True)
                    raise ValueError(
                        f"文件大小超过限制：单文件最大 {MAX_UPLOAD_BYTES} 字节"
                    )
                out.write(chunk)
    except Exception:
        # Clean up partial file on any failure so we never leave a truncated
        # upload behind.
        dest_path.unlink(missing_ok=True)
        raise

    rel_path = str(dest_path.relative_to(WORKSPACE_DIR.resolve()))
    return {
        "filename": original_name,
        "stored_filename": stored_filename,
        "size": size,
        "path": rel_path,
        "content_type": content_type,
    }


def list_outputs(conversation_id: str) -> list[dict[str, Any]]:
    """Return output-file summaries for ``conversation_id``.

    Returns an empty list when the conversation or its ``outputs/`` directory
    does not exist (acceptance criterion).
    """
    outputs_dir = _outputs_dir(conversation_id)
    if not outputs_dir.exists() or not outputs_dir.is_dir():
        return []

    files: list[dict[str, Any]] = []
    for entry in outputs_dir.iterdir():
        if entry.is_dir():
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        from datetime import datetime, timezone

        modified_at = (
            datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )
        files.append(
            {
                "filename": entry.name,
                "size": stat.st_size,
                "modified_at": modified_at,
            }
        )
    files.sort(key=lambda f: f["filename"])
    return files


def resolve_output_path(conversation_id: str, filename: str) -> Path | None:
    """Return the absolute path of an output file, or ``None`` if missing.

    The filename is sanitised to a basename so traversal attempts resolve to a
    non-existent file inside ``outputs/`` rather than escaping it.
    """
    safe_name = _safe_filename(filename)
    candidate = _outputs_dir(conversation_id) / safe_name
    # Belt-and-braces: ensure the resolved path is still inside workspace/.
    if not is_safe_workspace_path(candidate):
        return None
    if not candidate.is_file():
        return None
    return candidate


def reset_for_test() -> None:
    """Test helper: wipe the shared uploads temp directory."""
    if UPLOADS_DIR.exists():
        import shutil

        shutil.rmtree(UPLOADS_DIR, ignore_errors=True)


__all__ = [
    "MAX_UPLOAD_BYTES",
    "store_upload",
    "list_outputs",
    "resolve_output_path",
    "reset_for_test",
]
