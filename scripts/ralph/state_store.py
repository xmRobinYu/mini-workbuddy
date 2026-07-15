#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

import config

BASE_PRD_FILE = config.get_prd_file()
RUNTIME_PRD_FILE = config.get_runtime_prd_file(BASE_PRD_FILE)
STATE_DB_FILE = config.get_state_db_file(BASE_PRD_FILE)

STATE_FIELDS = {
    "passes",
    "blocked",
    "notes",
    "retryCount",
    "workflowMode",
    "startedAt",
    "completedAt",
    "totalElapsedSeconds",
    "lastPhaseStartedAt",
    "currentPhase",
}

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS story_state (
  story_id TEXT PRIMARY KEY,
  passes INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  workflow_mode TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  total_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  last_phase_started_at INTEGER,
  current_phase TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  created_at INTEGER NOT NULL
);
"""


class StateStoreError(RuntimeError):
    pass


def _connect(db_path: Path | None = None) -> sqlite3.Connection:
    target = db_path or STATE_DB_FILE
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    return conn


def _load_base_prd(path: Path | None = None) -> dict[str, Any]:
    target = path or BASE_PRD_FILE
    return json.loads(target.read_text(encoding="utf-8"))


def _validate_base_prd(prd: dict[str, Any]) -> None:
    if not isinstance(prd, dict):
        raise StateStoreError("prd root must be an object")
    stories = prd.get("userStories")
    if not isinstance(stories, list):
        raise StateStoreError("prd.userStories must be a list")
    seen_ids: set[str] = set()
    for index, story in enumerate(stories):
        if not isinstance(story, dict):
            raise StateStoreError(f"story at index {index} must be an object")
        story_id = story.get("id")
        if not isinstance(story_id, str) or not story_id.strip():
            raise StateStoreError(f"story at index {index} is missing a non-empty id")
        if story_id in seen_ids:
            raise StateStoreError(f"duplicate story id: {story_id}")
        seen_ids.add(story_id)


def ensure_initialized(
    *,
    prd_path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    prd = _load_base_prd(prd_path)
    _validate_base_prd(prd)
    with _connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        now = int(time.time())
        for story in prd.get("userStories", []):
            conn.execute(
                """
                INSERT INTO story_state (
                  story_id, passes, blocked, notes, retry_count, workflow_mode, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(story_id) DO UPDATE SET
                  workflow_mode=excluded.workflow_mode
                """,
                (
                    story["id"],
                    1 if story.get("passes", False) else 0,
                    1 if story.get("blocked", False) else 0,
                    str(story.get("notes") or ""),
                    int(story.get("retryCount", 0) or 0),
                    str(story.get("workflowMode") or "") or None,
                    now,
                ),
            )
        conn.commit()
    merged = load_runtime_prd(prd_path=prd_path, db_path=db_path)
    export_runtime_prd(merged, runtime_prd_path=runtime_prd_path)
    return merged


def _state_row_to_patch(row: sqlite3.Row | None) -> dict[str, Any]:
    if row is None:
        return {}
    patch: dict[str, Any] = {
        "passes": bool(row["passes"]),
        "blocked": bool(row["blocked"]),
        "notes": row["notes"] or "",
        "retryCount": int(row["retry_count"] or 0),
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
        "totalElapsedSeconds": int(row["total_elapsed_seconds"] or 0),
        "lastPhaseStartedAt": row["last_phase_started_at"],
        "currentPhase": row["current_phase"] or "",
    }
    workflow_mode = row["workflow_mode"]
    if workflow_mode:
        patch["workflowMode"] = workflow_mode
    return patch


def load_runtime_prd(*, prd_path: Path | None = None, db_path: Path | None = None) -> dict[str, Any]:
    prd = _load_base_prd(prd_path)
    _validate_base_prd(prd)
    with _connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        rows = conn.execute(
            """
            SELECT story_id, passes, blocked, notes, retry_count, workflow_mode,
                   started_at, completed_at, total_elapsed_seconds, last_phase_started_at, current_phase
            FROM story_state
            """
        ).fetchall()
    patches = {str(row["story_id"]): _state_row_to_patch(row) for row in rows}
    for story in prd.get("userStories", []):
        patch = patches.get(str(story.get("id")), {})
        story.update(patch)
    return prd


def export_runtime_prd(
    prd: dict[str, Any],
    *,
    runtime_prd_path: Path | None = None,
) -> None:
    target = runtime_prd_path or RUNTIME_PRD_FILE
    tmp_path = target.with_suffix(target.suffix + ".tmp")
    tmp_path.write_text(json.dumps(prd, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(target)


def get_story(story_id: str, *, prd_path: Path | None = None, db_path: Path | None = None) -> dict[str, Any]:
    prd = load_runtime_prd(prd_path=prd_path, db_path=db_path)
    for story in prd.get("userStories", []):
        if story.get("id") == story_id:
            return story
    raise StateStoreError(f"story not found: {story_id}")


def update_story_fields(
    story_id: str,
    updates: dict[str, Any],
    *,
    prd_path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_prd_path)
    if not updates:
        raise StateStoreError("no story updates provided")
    illegal = sorted(set(updates) - STATE_FIELDS)
    if illegal:
        raise StateStoreError(f"field is not mutable via state store: {', '.join(illegal)}")

    fields = []
    values: list[Any] = []
    mapping = {
        "passes": "passes",
        "blocked": "blocked",
        "notes": "notes",
        "retryCount": "retry_count",
        "workflowMode": "workflow_mode",
        "startedAt": "started_at",
        "completedAt": "completed_at",
        "totalElapsedSeconds": "total_elapsed_seconds",
        "lastPhaseStartedAt": "last_phase_started_at",
        "currentPhase": "current_phase",
    }
    for key, column in mapping.items():
        if key not in updates:
            continue
        value = updates[key]
        if key in {"passes", "blocked"}:
            value = 1 if bool(value) else 0
        elif key in {"retryCount", "startedAt", "completedAt", "totalElapsedSeconds", "lastPhaseStartedAt"}:
            value = int(value)
        elif key in {"notes", "workflowMode", "currentPhase"}:
            value = str(value)
        fields.append(f"{column} = ?")
        values.append(value)
    fields.append("updated_at = ?")
    values.append(int(time.time()))
    values.append(story_id)

    with _connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        cursor = conn.execute(
            f"UPDATE story_state SET {', '.join(fields)} WHERE story_id = ?",
            values,
        )
        if cursor.rowcount == 0:
            raise StateStoreError(f"story not found in state db: {story_id}")
        conn.commit()
    merged = load_runtime_prd(prd_path=prd_path, db_path=db_path)
    export_runtime_prd(merged, runtime_prd_path=runtime_prd_path)
    return get_story(story_id, prd_path=prd_path, db_path=db_path)


def get_current_story_id(*, prd_path: Path | None = None, db_path: Path | None = None) -> str | None:
    prd = load_runtime_prd(prd_path=prd_path, db_path=db_path)
    for story in prd.get("userStories", []):
        if not story.get("passes", False) and not story.get("blocked", False):
            return str(story.get("id"))
    return None


def all_stories_resolved(*, prd_path: Path | None = None, db_path: Path | None = None) -> bool:
    prd = load_runtime_prd(prd_path=prd_path, db_path=db_path)
    return all(story.get("passes", False) or story.get("blocked", False) for story in prd.get("userStories", []))


def record_run_event(
    story_id: str,
    *,
    phase: str,
    status: str,
    message: str = "",
    exit_code: int | None = None,
    db_path: Path | None = None,
) -> None:
    with _connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        conn.execute(
            "INSERT INTO run_events (story_id, phase, status, message, exit_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (story_id, phase, status, message, exit_code, int(time.time())),
        )
        conn.commit()


def get_context_limit_events(
    *,
    db_path: Path | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    with _connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        rows = conn.execute(
            """
            SELECT story_id, message, created_at
            FROM run_events
            WHERE status = 'context_limit'
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def mark_story_phase_started(
    story_id: str,
    *,
    phase: str,
    started_at: int | None = None,
    prd_path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_prd_path)
    ts = int(started_at or time.time())
    story = get_story(story_id, prd_path=prd_path, db_path=db_path)
    updates: dict[str, Any] = {
        "lastPhaseStartedAt": ts,
        "currentPhase": phase,
    }
    if not story.get("startedAt"):
        updates["startedAt"] = ts
    return update_story_fields(
        story_id,
        updates,
        prd_path=prd_path,
        db_path=db_path,
        runtime_prd_path=runtime_prd_path,
    )


def mark_story_phase_finished(
    story_id: str,
    *,
    mark_complete: bool = False,
    finished_at: int | None = None,
    prd_path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    ensure_initialized(prd_path=prd_path, db_path=db_path, runtime_prd_path=runtime_prd_path)
    ts = int(finished_at or time.time())
    story = get_story(story_id, prd_path=prd_path, db_path=db_path)
    last_phase_started_at = story.get("lastPhaseStartedAt")
    total_elapsed = int(story.get("totalElapsedSeconds", 0) or 0)
    if last_phase_started_at:
        total_elapsed += max(0, ts - int(last_phase_started_at))
    updates: dict[str, Any] = {
        "totalElapsedSeconds": total_elapsed,
        "lastPhaseStartedAt": 0,
        "currentPhase": "",
    }
    if mark_complete and not story.get("completedAt"):
        updates["completedAt"] = ts
    return update_story_fields(
        story_id,
        updates,
        prd_path=prd_path,
        db_path=db_path,
        runtime_prd_path=runtime_prd_path,
    )
