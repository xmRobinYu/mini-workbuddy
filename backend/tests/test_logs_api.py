"""Tests for the log projection API (US-013).

Covers the acceptance criteria:
- GET /api/logs projects execution events from conversation JSONL (no new DB)
- type / q / level / status / limit filters work
- logs come from real backend projection, not a static fixture
- read-only: the endpoint never mutates the conversations store
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import CONVERSATIONS_DIR
from app.main import create_app
from app.services import conversations_store


def _reset() -> None:
    """Start each test from a clean conversations directory."""
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
    path = CONVERSATIONS_DIR / conv_id / f"{conv_id}.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def _tool_call_event(call_id: str, name: str, args: dict) -> dict:
    return {
        "role": "assistant",
        "type": "tool_call",
        "timestamp": "2026-07-21T10:00:00+00:00",
        "tool_call_id": call_id,
        "data": {
            "text": "",
            "tool_calls": [
                {
                    "id": call_id,
                    "type": "tool",
                    "function": {"name": name, "arguments": args},
                }
            ],
        },
    }


def _tool_result_event(call_id: str, name: str, result: str, ok: bool = True) -> dict:
    return {
        "role": "tool",
        "type": "tool_result",
        "timestamp": "2026-07-21T10:00:01+00:00",
        "tool_call_id": call_id,
        "data": {"name": name, "type": "tool", "result": result, "ok": ok},
    }


def _assistant_message_event(text: str) -> dict:
    return {
        "role": "assistant",
        "type": "message",
        "timestamp": "2026-07-21T10:00:02+00:00",
        "data": {"text": text},
    }


def _tool_call_event_string_args(call_id: str, name: str, args_json: str) -> dict:
    """Like :func:`_tool_call_event` but persists ``arguments`` as a JSON
    string — the shape the agent loop actually writes to the JSONL (per the
    OpenAI tool-call spec). The projection must parse this, not crash."""
    return {
        "role": "assistant",
        "type": "tool_call",
        "timestamp": "2026-07-21T10:00:00+00:00",
        "tool_call_id": call_id,
        "data": {
            "text": "",
            "tool_calls": [
                {
                    "id": call_id,
                    "type": "tool",
                    "function": {"name": name, "arguments": args_json},
                }
            ],
        },
    }


# ── projection ──────────────────────────────────────────────────────────────


def test_projects_model_and_tool_events() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="调试会话")
        cid = created["id"]
        _append_event(cid, _tool_call_event("call-1", "read_file", {"path": "src/a.ts"}))
        _append_event(cid, _tool_result_event("call-1", "read_file", "file contents here"))
        _append_event(cid, _assistant_message_event("已读取文件"))

        resp = client.get("/api/logs")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # tool_result + assistant message → 2 projected rows (tool_call + user
    # messages are deliberately not projected).
    assert body["total"] == 2
    events = [r["event"] for r in body["items"]]
    assert "read_file" in events
    assert "chat.completion" in events


def test_skill_result_classified_as_skill() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(cid, _tool_call_event("call-s", "summarize", {"query": "x"}))
        _append_event(
            cid,
            {
                "role": "tool",
                "type": "tool_result",
                "timestamp": "2026-07-21T10:00:03+00:00",
                "tool_call_id": "call-s",
                "data": {
                    "name": "summarize",
                    "type": "skill",
                    "result": "summary",
                    "ok": True,
                },
            },
        )
        resp = client.get("/api/logs?type=skill")
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["type"] == "skill"
    assert body["items"][0]["status"] == "ok"


def test_failed_tool_result_is_error_level() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(cid, _tool_call_event("call-e", "execute_command", {"command": "git log"}))
        _append_event(
            cid,
            _tool_result_event("call-e", "execute_command", "TimeoutError", ok=False),
        )
        resp = client.get("/api/logs?status=error")
    body = resp.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["status"] == "error"
    assert row["level"] == "error"


def test_input_joined_from_tool_call_by_id() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(cid, _tool_call_event("call-i", "write_file", {"path": "src/x.ts", "content": "abc"}))
        _append_event(cid, _tool_result_event("call-i", "write_file", "ok"))
        resp = client.get("/api/logs?type=tool")
    body = resp.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["input"] == {"path": "src/x.ts", "content": "abc"}
    assert row["output"] == "ok"


# ── filters ─────────────────────────────────────────────────────────────────


def test_type_filter() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(cid, _tool_call_event("c1", "read_file", {"path": "a"}))
        _append_event(cid, _tool_result_event("c1", "read_file", "out"))
        _append_event(cid, _assistant_message_event("回复"))
        resp = client.get("/api/logs?type=model")
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["type"] == "model"


def test_q_filter_matches_detail_and_event() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="会议纪要")
        cid = created["id"]
        _append_event(cid, _tool_call_event("c1", "read_file", {"path": "notes.md"}))
        _append_event(cid, _tool_result_event("c1", "read_file", "会议内容"))
        _append_event(cid, _assistant_message_event("无关内容"))
        resp = client.get("/api/logs?q=会议")
    body = resp.json()
    # matches: the conversation title (会议纪要) is part of each row's q
    # haystack, and the tool result detail/output also contains 会议.
    assert body["total"] == 1
    assert body["items"][0]["event"] == "read_file"


def test_limit_truncates_results() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        for i in range(5):
            _append_event(cid, _assistant_message_event(f"回复 {i}"))
        resp = client.get("/api/logs?limit=2")
    body = resp.json()
    assert body["limit"] == 2
    assert body["total"] == 2
    assert len(body["items"]) == 2


def test_empty_when_no_conversations() -> None:
    _reset()
    with _client() as client:
        resp = client.get("/api/logs")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "limit": 200}


def test_response_shape_matches_schema() -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="形状")
        cid = created["id"]
        _append_event(cid, _tool_call_event("c1", "read_file", {"path": "a"}))
        _append_event(cid, _tool_result_event("c1", "read_file", "out"))
        resp = client.get("/api/logs")
    row = resp.json()["items"][0]
    assert set(row) >= {
        "id", "conversation_id", "conversation_title", "time", "type",
        "event", "agent", "level", "status", "latency", "detail",
        "input", "output",
    }
    assert row["conversation_id"] == cid
    assert row["conversation_title"] == "形状"


def test_logs_are_read_only() -> None:
    """GET /api/logs must not mutate the conversations store."""
    _reset()
    with _client() as client:
        created = _make_conversation(client, title="只读")
        cid = created["id"]
        _append_event(cid, _assistant_message_event("hello"))
        before = (CONVERSATIONS_DIR / cid / f"{cid}.jsonl").read_text(encoding="utf-8")
        client.get("/api/logs")
        client.get("/api/logs?type=model&q=hello&limit=1")
        after = (CONVERSATIONS_DIR / cid / f"{cid}.jsonl").read_text(encoding="utf-8")
    assert before == after


def test_corrupt_jsonl_lines_do_not_break_projection(tmp_path: Path) -> None:
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        # Append a valid event, then a corrupt line, then another valid event.
        _append_event(cid, _assistant_message_event("第一条"))
        path = CONVERSATIONS_DIR / cid / f"{cid}.jsonl"
        with path.open("a", encoding="utf-8") as fh:
            fh.write("{not valid json\n")
        _append_event(cid, _assistant_message_event("第二条"))
        resp = client.get("/api/logs")
    body = resp.json()
    # Both valid model events survive; the corrupt line is skipped.
    assert body["total"] == 2


def test_tool_call_arguments_as_json_string_are_parsed() -> None:
    """The agent loop persists ``arguments`` as a JSON string. The projection
    must parse it back into a dict for the detail line and the ``input``
    field — regression test for a 500 when arguments was a str."""
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(
            cid,
            _tool_call_event_string_args("call-str", "read_file", '{"path": "memory.md"}'),
        )
        _append_event(cid, _tool_result_event("call-str", "read_file", "文件内容"))
        resp = client.get("/api/logs?type=tool")
    body = resp.json()
    assert resp.status_code == 200, resp.text
    assert body["total"] == 1
    row = body["items"][0]
    # The parsed arguments surface both in the summary and the input field.
    assert row["detail"] == "读取 memory.md"
    assert row["input"] == {"path": "memory.md"}


def test_malformed_arguments_string_does_not_break_projection() -> None:
    """A tool call whose ``arguments`` string is not valid JSON must degrade
    gracefully (empty input) rather than 500."""
    _reset()
    with _client() as client:
        created = _make_conversation(client)
        cid = created["id"]
        _append_event(
            cid,
            _tool_call_event_string_args("call-bad", "execute_command", "not-json{"),
        )
        _append_event(cid, _tool_result_event("call-bad", "execute_command", "ok"))
        resp = client.get("/api/logs?type=tool")
    body = resp.json()
    assert resp.status_code == 200, resp.text
    assert body["total"] == 1
    row = body["items"][0]
    assert row["input"] is None
    assert row["detail"] == "execute_command"

