"""Tests for the memory management API (US-012).

Covers the happy-path acceptance criteria:
- GET /api/memory/long-term returns the body + size stats
- PUT /api/memory/long-term replaces the body and enforces the 50 KB cap
- GET /api/memory/short-term returns daily files newest-first with stats
- GET /api/memory/stats returns the dashboard summary
- read/write is confined to workspace/memory
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app.core.config import MEMORY_DIR
from app.main import create_app
from app.services import memory_store


def _patch_memory_paths(monkeypatch: MonkeyPatch, tmp_path: Path) -> tuple[Path, Path]:
    """Redirect the memory store onto an isolated tmp workspace."""
    memory_dir = tmp_path / "memory"
    long_term_file = tmp_path / "memory.md"
    archive_dir = memory_dir / "archive"
    monkeypatch.setattr(memory_store, "MEMORY_DIR", memory_dir)
    monkeypatch.setattr(memory_store, "MEMORY_ARCHIVE_DIR", archive_dir)
    monkeypatch.setattr(memory_store, "LONG_TERM_MEMORY_FILE", long_term_file)
    monkeypatch.setattr(memory_store, "MEMORY_LOCK_FILE", tmp_path / "memory.lock")
    # config.MEMORY_DIR is imported by other modules; keep them in sync so the
    # API endpoints (which route through memory_store) see the tmp tree.
    import app.core.config as config

    monkeypatch.setattr(config, "MEMORY_DIR", memory_dir)
    monkeypatch.setattr(config, "MEMORY_ARCHIVE_DIR", archive_dir)
    return long_term_file, memory_dir


def _client() -> TestClient:
    return TestClient(create_app())


# ── long-term ──────────────────────────────────────────────────────────────


def test_get_long_term_memory_empty_when_absent(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    _patch_memory_paths(monkeypatch, tmp_path)
    with _client() as client:
        resp = client.get("/api/memory/long-term")
    assert resp.status_code == 200
    body = resp.json()
    assert body["content"] == ""
    assert body["bytes"] == 0
    assert body["items"] == 0
    assert body["max_bytes"] == memory_store.LONG_TERM_MEMORY_MAX_BYTES


def test_put_then_get_long_term_memory_round_trip(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, _ = _patch_memory_paths(monkeypatch, tmp_path)
    with _client() as client:
        put = client.put("/api/memory/long-term", json={"content": "偏好中文\n项目名 WorkBuddy"})
        assert put.status_code == 200
        body = put.json()
        assert body["content"] == "偏好中文\n项目名 WorkBuddy\n"
        assert body["items"] == 2

        got = client.get("/api/memory/long-term")
        assert got.status_code == 200
        assert got.json()["content"] == "偏好中文\n项目名 WorkBuddy\n"
    assert long_term_file.read_text(encoding="utf-8") == "偏好中文\n项目名 WorkBuddy\n"


def test_put_long_term_memory_rejects_oversized_body(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    _patch_memory_paths(monkeypatch, tmp_path)
    too_big = "x" * (memory_store.LONG_TERM_MEMORY_MAX_BYTES + 1)
    with _client() as client:
        resp = client.put("/api/memory/long-term", json={"content": too_big})
    assert resp.status_code == 413
    assert "上限" in resp.json()["detail"]


def test_put_long_term_memory_is_confined_to_workspace(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)
    with _client() as client:
        client.put("/api/memory/long-term", json={"content": "长期记忆\n"})
    # The body must land on the configured long-term file under the tmp tree,
    # never escaping workspace/memory + workspace/memory.md.
    assert long_term_file.read_text(encoding="utf-8") == "长期记忆\n"
    # No file was written outside the configured long-term path.
    assert list(tmp_path.glob("*.md")) == [long_term_file]


# ── short-term ─────────────────────────────────────────────────────────────


def test_get_short_term_memory_lists_daily_files_newest_first(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    _, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "2026-07-15.md").write_text("第一条\n第二条\n", encoding="utf-8")
    (memory_dir / "2026-07-16.md").write_text("新的一天\n", encoding="utf-8")
    with _client() as client:
        resp = client.get("/api/memory/short-term")
    assert resp.status_code == 200
    body = resp.json()
    dates = [f["date"] for f in body["files"]]
    assert dates == ["2026-07-16", "2026-07-15"]  # newest-first
    assert body["files"][0]["items"] == 1
    assert body["files"][1]["items"] == 2
    assert body["total_items"] == 3


def test_get_short_term_memory_empty_when_no_files(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    _patch_memory_paths(monkeypatch, tmp_path)
    with _client() as client:
        resp = client.get("/api/memory/short-term")
    assert resp.status_code == 200
    assert resp.json() == {"files": [], "total_items": 0}


# ── stats ──────────────────────────────────────────────────────────────────


def test_memory_stats_aggregates_long_and_short_term(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)
    long_term_file.write_text("长期一\n长期二\n", encoding="utf-8")
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "2026-07-16.md").write_text("短期一\n", encoding="utf-8")
    with _client() as client:
        resp = client.get("/api/memory/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["long_term_items"] == 2
    assert body["long_term_bytes"] == len("长期一\n长期二\n".encode("utf-8"))
    assert body["long_term_max_bytes"] == memory_store.LONG_TERM_MEMORY_MAX_BYTES
    assert body["short_term_files"] == 1
    assert body["short_term_items"] == 1
    assert body["archived_items"] == 0
