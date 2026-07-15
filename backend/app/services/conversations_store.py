"""JSONL file persistence for chat conversations (US-011).

Each conversation lives at ``workspace/conversations/{id}/{id}.jsonl`` — one
JSON object per interaction event. A sidecar ``{id}.meta.json`` file holds the
mutable metadata (title + timestamps) so renaming and listing never require
parsing the (potentially large) JSONL body.

Concurrency model mirrors :mod:`models_store` / :mod:`agents_store`: every
read/write of a conversation's files is guarded by a per-conversation
``filelock`` so concurrent appends serialise, while different conversations
stay independent.

Corrupt JSONL lines are skipped with a warning log rather than aborting the
read, so a single damaged line cannot make a whole conversation unreadable
(acceptance criterion: "JSONL 文件损坏时跳过损坏行并记录警告日志").
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from filelock import FileLock

from app.core.config import CONVERSATIONS_DIR

logger = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _conv_dir(conversation_id: str) -> Path:
    """Return the on-disk directory owned by ``conversation_id``."""
    return CONVERSATIONS_DIR / conversation_id


def _jsonl_path(conversation_id: str) -> Path:
    return _conv_dir(conversation_id) / f"{conversation_id}.jsonl"


def _meta_path(conversation_id: str) -> Path:
    return _conv_dir(conversation_id) / f"{conversation_id}.meta.json"


def _lock_path(conversation_id: str) -> Path:
    return _conv_dir(conversation_id) / f"{conversation_id}.jsonl.lock"


def generate_id() -> str:
    """Generate a stable unique id for a new conversation (UUID4)."""
    return str(uuid.uuid4())


def _default_title(timestamp: str) -> str:
    """Human-readable default title derived from a creation timestamp."""
    return f"新会话 {timestamp}"


def _write_meta(meta: dict[str, Any]) -> None:
    """Overwrite the sidecar metadata file."""
    path = _meta_path(meta["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _read_meta(conversation_id: str) -> dict[str, Any] | None:
    """Return the metadata dict, or ``None`` if the conversation does not exist."""
    path = _meta_path(conversation_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("会话 %s 的 meta.json 损坏，已跳过", conversation_id)
        return None
    if not isinstance(data, dict):
        return None
    return data


def _read_events(conversation_id: str) -> list[dict[str, Any]]:
    """Read the JSONL body, skipping (and logging) corrupt lines."""
    path = _jsonl_path(conversation_id)
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    for lineno, raw in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            logger.warning(
                "会话 %s 的 JSONL 第 %d 行损坏，已跳过该行",
                conversation_id,
                lineno,
            )
            continue
        if isinstance(obj, dict):
            events.append(obj)
    return events


# ── public API ──────────────────────────────────────────────────────────────


def list_conversations() -> list[dict[str, Any]]:
    """Return all conversation summaries, newest-first by ``updated_at``."""
    summaries: list[dict[str, Any]] = []
    if not CONVERSATIONS_DIR.exists():
        return summaries
    for entry in CONVERSATIONS_DIR.iterdir():
        if not entry.is_dir():
            continue
        meta = _read_meta(entry.name)
        if meta is None:
            continue
        summaries.append(
            {
                "id": meta.get("id", entry.name),
                "title": meta.get("title", ""),
                "created_at": meta.get("created_at", ""),
                "updated_at": meta.get("updated_at", ""),
            }
        )
    summaries.sort(key=lambda s: s["updated_at"], reverse=True)
    return summaries


def get_conversation(conversation_id: str) -> dict[str, Any] | None:
    """Return a conversation's metadata + full ordered events, or ``None``."""
    meta = _read_meta(conversation_id)
    if meta is None:
        return None
    events = _read_events(conversation_id)
    return {
        "id": meta.get("id", conversation_id),
        "title": meta.get("title", ""),
        "created_at": meta.get("created_at", ""),
        "updated_at": meta.get("updated_at", ""),
        "events": events,
    }


def create_conversation(title: str | None = None) -> dict[str, Any]:
    """Create a new conversation: allocate id, directory, empty JSONL + meta.

    Returns the summary dict (id/title/created_at/updated_at).
    """
    conversation_id = generate_id()
    timestamp = _utcnow_iso()
    resolved_title = title.strip() if (title and title.strip()) else _default_title(timestamp)

    directory = _conv_dir(conversation_id)
    directory.mkdir(parents=True, exist_ok=True)
    # Materialise an empty JSONL file so GET on a fresh conversation returns [].
    _jsonl_path(conversation_id).write_text("", encoding="utf-8")

    meta = {
        "id": conversation_id,
        "title": resolved_title,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    lock = FileLock(str(_lock_path(conversation_id)))
    with lock:
        _write_meta(meta)
    return {
        "id": conversation_id,
        "title": resolved_title,
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def rename_conversation(conversation_id: str, title: str) -> dict[str, Any] | None:
    """Rename a conversation. Returns the updated summary, or ``None`` if absent."""
    lock = FileLock(str(_lock_path(conversation_id)))
    with lock:
        meta = _read_meta(conversation_id)
        if meta is None:
            return None
        meta["title"] = title
        meta["updated_at"] = _utcnow_iso()
        _write_meta(meta)
        return {
            "id": meta.get("id", conversation_id),
            "title": meta["title"],
            "created_at": meta.get("created_at", ""),
            "updated_at": meta["updated_at"],
        }


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation's JSONL, meta, outputs/ dir and parent directory.

    Returns ``True`` if the conversation directory existed and was removed.
    """
    directory = _conv_dir(conversation_id)
    # A conversation exists iff its directory is on disk. We must check this
    # *before* acquiring the lock (the lock file lives inside the directory),
    # so a missing-id DELETE correctly returns False instead of materialising
    # an empty directory just to host a lock file.
    if not directory.exists():
        return False
    lock = FileLock(str(_lock_path(conversation_id)))
    with lock:
        if not directory.exists():
            return False
        shutil.rmtree(directory, ignore_errors=True)
    return True


def search_conversations(keyword: str) -> list[dict[str, Any]]:
    """Return conversations whose title or JSONL content matches ``keyword``.

    Title matching is case-insensitive substring. Content matching scans the
    raw JSONL text of each conversation (case-insensitive) so it works without
    parsing every event. Corrupt lines are skipped during read anyway, but
    here we scan the raw text for the keyword presence directly.
    """
    term = keyword.strip().lower()
    if not term:
        return []
    matches: list[dict[str, Any]] = []
    for summary in list_conversations():
        cid = summary["id"]
        title_hit = term in summary["title"].lower()
        content_hit = False
        jsonl = _jsonl_path(cid)
        if jsonl.exists():
            try:
                content_hit = term in jsonl.read_text(encoding="utf-8").lower()
            except OSError:
                content_hit = False
        if title_hit or content_hit:
            matches.append(summary)
    return matches


def append_event(conversation_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Append a single interaction event to the conversation's JSONL.

    The write is guarded by the per-conversation ``filelock`` so concurrent
    appends serialise, and the sidecar metadata's ``updated_at`` is bumped so
    the conversation floats to the top of list/search ordering. Corrupt or
    missing conversations are tolerated: a missing directory is materialised
    on demand (the event is never lost).

    Returns the same ``event`` dict for convenience.
    """
    event.setdefault("role", "")
    event.setdefault("type", "")
    event.setdefault("timestamp", _utcnow_iso())
    event.setdefault("data", {})
    event.setdefault("reasoning", "")
    event.setdefault("tool_call_id", "")

    directory = _conv_dir(conversation_id)
    directory.mkdir(parents=True, exist_ok=True)
    jsonl = _jsonl_path(conversation_id)
    lock = FileLock(str(_lock_path(conversation_id)))
    with lock:
        # Atomic append: read existing lines, append the new event, write to a
        # sibling ``.tmp`` file then ``os.rename`` it over the real JSONL.
        # A plain append-mode write could leave a half-written trailing line
        # if the process is interrupted mid-``write``; the tmp+rename swap is
        # atomic at the filesystem level so the JSONL is never observed in a
        # torn state. (US-019 acceptance criterion.)
        existing = ""
        if jsonl.exists():
            existing = jsonl.read_text(encoding="utf-8")
        blob = existing + json.dumps(event, ensure_ascii=False) + "\n"
        tmp_path = jsonl.with_suffix(jsonl.suffix + ".tmp")
        tmp_path.write_text(blob, encoding="utf-8")
        os.rename(tmp_path, jsonl)
        # Bump updated_at so list/search reflect the new activity.
        meta = _read_meta(conversation_id)
        if meta is not None:
            meta["updated_at"] = _utcnow_iso()
            _write_meta(meta)
    return event


def reset_for_test() -> None:
    """Test helper: wipe the entire conversations directory for a clean slate."""
    if CONVERSATIONS_DIR.exists():
        shutil.rmtree(CONVERSATIONS_DIR, ignore_errors=True)
    CONVERSATIONS_DIR.mkdir(parents=True, exist_ok=True)


__all__ = [
    "generate_id",
    "list_conversations",
    "get_conversation",
    "create_conversation",
    "rename_conversation",
    "delete_conversation",
    "search_conversations",
    "append_event",
    "reset_for_test",
]
