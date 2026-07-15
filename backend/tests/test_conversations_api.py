"""Tests for the conversation management API (US-011).

Covers all acceptance criteria:
- GET /api/conversations returns the conversation list (title/timestamps)
- POST /api/conversations creates a conversation with a UUID id + on-disk dir
- GET /api/conversations/{id} returns the full interaction records from JSONL
- PUT /api/conversations/{id} renames the title
- DELETE /api/conversations/{id} removes the JSONL + outputs/ directory
- GET /api/conversations/search?keyword= filters by title or content
- Corrupt JSONL lines are skipped with a warning log
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import CONVERSATIONS_DIR
from app.main import create_app
from app.services import conversations_store


def _reset() -> None:
    """Ensure each test starts from a clean conversations directory."""
    conversations_store.reset_for_test()


def _client() -> TestClient:
    return TestClient(create_app())


def _make_conversation(client: TestClient, title: str | None = None) -> dict:
    body: dict[str, object] = {}
    if title is not None:
        body["title"] = title
    resp = client.post("/api/conversations", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _append_event(conv_id: str, event: dict) -> None:
    """Append a raw event line to a conversation's JSONL (test helper)."""
    path = CONVERSATIONS_DIR / conv_id / f"{conv_id}.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False) + "\n")


# ── list ───────────────────────────────────────────────────────────────────


def test_list_returns_summary_fields() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="我的会话")
        resp = client.get("/api/conversations")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    item = items[0]
    assert set(item) >= {"id", "title", "created_at", "updated_at"}
    assert item["id"] == created["id"]
    assert item["title"] == "我的会话"


def test_list_empty_when_no_conversations() -> None:
    _reset()
    with _client() as client:
        resp = client.get("/api/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


# ── create ─────────────────────────────────────────────────────────────────


def test_create_generates_uuid_and_directory() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="新会话")
    conv_id = created["id"]
    # The id is a valid UUID4.
    assert len(conv_id) == 36 and conv_id.count("-") == 4
    # The on-disk directory + empty JSONL were created.
    directory = CONVERSATIONS_DIR / conv_id
    assert directory.is_dir()
    assert (directory / f"{conv_id}.jsonl").exists()


def test_create_without_title_uses_default() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title=None)
    assert created["title"]
    assert created["title"].startswith("新会话 ")


def test_create_appears_in_list() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="出现在列表")
        listed = client.get("/api/conversations").json()
    ids = [c["id"] for c in listed]
    assert created["id"] in ids


# ── get / detail ───────────────────────────────────────────────────────────


def test_get_returns_full_events() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="详情测试")
        conv_id = created["id"]
        _append_event(conv_id, {"role": "user", "type": "message", "data": {"text": "你好"}})
        _append_event(conv_id, {"role": "assistant", "type": "message", "data": {"text": "你好！"}})
        resp = client.get(f"/api/conversations/{conv_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == conv_id
    assert body["title"] == "详情测试"
    assert len(body["events"]) == 2
    assert body["events"][0]["data"]["text"] == "你好"
    assert body["events"][1]["data"]["text"] == "你好！"


def test_get_empty_events_for_fresh_conversation() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="空会话")
        resp = client.get(f"/api/conversations/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_get_nonexistent_returns_404() -> None:
    _reset()
    with _client() as client:
        resp = client.get("/api/conversations/does-not-exist")
    assert resp.status_code == 404


# ── rename ─────────────────────────────────────────────────────────────────


def test_rename_updates_title() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="原标题")
        resp = client.put(
            f"/api/conversations/{created['id']}", json={"title": "新标题"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "新标题"
    # Persisted: shows up in the list with the new title.
    with _client() as client:
        listed = client.get("/api/conversations").json()
    assert any(c["title"] == "新标题" for c in listed)


def test_rename_nonexistent_returns_404() -> None:
    _reset()
    with _client() as client:
        resp = client.put(
            "/api/conversations/nope", json={"title": "x"}
        )
    assert resp.status_code == 404


def test_rename_rejects_blank_title() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="原标题")
        resp = client.put(
            f"/api/conversations/{created['id']}", json={"title": "  "}
        )
    assert resp.status_code == 422


# ── delete ─────────────────────────────────────────────────────────────────


def test_delete_removes_jsonl_and_outputs_dir() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="待删除")
        conv_id = created["id"]
        directory = CONVERSATIONS_DIR / conv_id
        # Simulate an outputs/ directory produced by the Agent loop.
        (directory / "outputs").mkdir(parents=True, exist_ok=True)
        (directory / "outputs" / "result.txt").write_text("out", encoding="utf-8")
        _append_event(conv_id, {"role": "user", "data": {"text": "hi"}})
        resp = client.delete(f"/api/conversations/{conv_id}")
    assert resp.status_code == 204
    assert not directory.exists()


def test_delete_nonexistent_returns_404() -> None:
    _reset()
    with _client() as client:
        resp = client.delete("/api/conversations/missing")
    assert resp.status_code == 404


# ── search ─────────────────────────────────────────────────────────────────


def test_search_matches_title() -> None:
    _reset()
    with _client() as client:
        _make_conversation(client, title="Python 学习笔记")
        _make_conversation(client, title="机器学习入门")
        resp = client.get("/api/conversations/search", params={"keyword": "Python"})
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.json()]
    assert titles == ["Python 学习笔记"]


def test_search_matches_content() -> None:
    _reset()
    with _client() as client:
        c1 = _make_conversation(client, title="会话一")
        c2 = _make_conversation(client, title="会话二")
        _append_event(c1["id"], {"role": "user", "data": {"text": "今天天气不错"}})
        _append_event(c2["id"], {"role": "user", "data": {"text": "无关内容"}})
        resp = client.get("/api/conversations/search", params={"keyword": "天气"})
    assert resp.status_code == 200
    ids = [c["id"] for c in resp.json()]
    assert c1["id"] in ids
    assert c2["id"] not in ids


def test_search_empty_keyword_returns_empty() -> None:
    _reset()
    with _client() as client:
        _make_conversation(client, title="会话")
        resp = client.get("/api/conversations/search", params={"keyword": "   "})
    assert resp.status_code == 200
    assert resp.json() == []


# ── corrupt JSONL handling ─────────────────────────────────────────────────


def test_corrupt_lines_skipped(caplog) -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="损坏测试")
        conv_id = created["id"]
        path = Path(CONVERSATIONS_DIR / conv_id / f"{conv_id}.jsonl")
        # Two valid events + one corrupt line in the middle.
        with path.open("w", encoding="utf-8") as fh:
            fh.write(json.dumps({"role": "user", "data": {"text": "a"}}) + "\n")
            fh.write("this is not json\n")
            fh.write(json.dumps({"role": "assistant", "data": {"text": "b"}}) + "\n")
        with caplog.at_level("WARNING"):
            resp = client.get(f"/api/conversations/{conv_id}")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 2
    assert any("损坏" in rec.getMessage() for rec in caplog.records)
