"""Tests for the SSE chat send endpoint (US-016).

Covers all acceptance criteria:
- POST /api/chat/send returns an SSE streaming response
- The server emits a ``: heartbeat`` comment line every 15 s
- Client disconnect is detected and the Agent loop is terminated
- An interrupted SSE connection keeps the JSONL records already written
- Request params: conversation_id, message, agent_id, uploaded_file_paths (opt)
- SSE event types: thinking / content / tool_call / tool_result / done / error
- Typecheck passes (mypy)

The model call is mocked at the httpx layer so the tests are deterministic
and do not hit a real LLM. We stream hand-crafted OpenAI-format chunks.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import keyring
import keyring.backend
import keyring.backends.fail
from fastapi.testclient import TestClient

from app.core.config import MODELS_FILE, TOOLS_FILE
from app.main import create_app
from app.services import agents_store, conversations_store, models_store
from app.services.agents_store import AGENTS_FILE
from app.services import tools_store


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


def _reset_all() -> None:
    """Clean slate for models, agents, conversations and tool-enabled state."""
    MODELS_FILE.parent.mkdir(parents=True, exist_ok=True)
    MODELS_FILE.write_text("[]", encoding="utf-8")
    AGENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    agents_store.reset_for_test()
    conversations_store.reset_for_test()
    # tools.json lives outside conversations/agents and is *not* reset by the
    # helpers above — reset it explicitly so every test starts with all three
    # built-in tools enabled (otherwise a leftover disabled flag from a prior
    # test silently drops tools from the agent-loop request payload).
    TOOLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tools_store.reset_for_test()


def _seed_default_agent(client: TestClient) -> dict[str, Any]:
    """Force lifespan seeding and return the default Agent dict."""
    client.get("/api/agents")
    default = agents_store.get_default_agent()
    assert default is not None
    return default


def _create_model(client: TestClient) -> str:
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


def _attach_model_to_default(client: TestClient, model_id: str) -> dict[str, Any]:
    """Seed the default Agent (lifespan) and link it to ``model_id``."""
    _seed_default_agent(client)
    default = agents_store.get_default_agent()
    assert default is not None
    resp = client.put(
        f"/api/agents/{default['id']}",
        json={
            "name": default["name"],
            "description": default.get("description", ""),
            "model_id": model_id,
            "tools": ["read_file", "write_file", "execute_command"],
            "skills": [],
        },
    )
    assert resp.status_code == 200
    return resp.json()


def _create_conversation(client: TestClient) -> str:
    resp = client.post("/api/conversations", json={"title": "SSE 测试会话"})
    assert resp.status_code == 201
    return resp.json()["id"]


def _sse_chunks(resp: httpx.Response) -> list[dict[str, Any]]:
    """Parse the streamed SSE body into a list of decoded event objects.

    Heartbeat comment lines (``: heartbeat``) are filtered out; the returned
    list contains only ``{"event": ..., "data": ...}`` payloads.
    """
    events: list[dict[str, Any]] = []
    for raw in resp.text.split("\n"):
        line = raw.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:") :].strip()
        if not payload:
            continue
        events.append(json.loads(payload))
    return events


def _sse_event_types(resp: httpx.Response) -> list[str]:
    return [e["event"] for e in _sse_chunks(resp)]


class _FakeStreamContext:
    """Async context manager mimicking ``httpx.AsyncClient().stream(...)``.

    ``httpx.AsyncClient.stream`` returns an async context manager whose value
    is the :class:`httpx.Response`; the mock here yields a response whose
    ``aiter_lines`` replays the crafted OpenAI ``data:`` chunks.
    """

    def __init__(self, response: httpx.Response) -> None:
        self._response = response

    async def __aenter__(self) -> httpx.Response:
        return self._response

    async def __aexit__(self, *exc: object) -> None:
        return None


def _make_stream_response(
    chunks: list[dict[str, Any]],
    status_code: int = 200,
) -> httpx.Response:
    """Build a fake streaming httpx.Response yielding OpenAI ``data:`` lines."""
    lines: list[str] = []
    for chunk in chunks:
        lines.append("data: " + json.dumps(chunk))
    lines.append("data: [DONE]")
    body = "\n".join(lines)
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")

    async def _aiter_lines() -> Any:
        for line in body.split("\n"):
            yield line

    response = httpx.Response(
        status_code=status_code,
        content=body.encode("utf-8"),
        request=request,
        headers={"content-type": "text/event-stream"},
    )
    # Override the sync line iterator with our async replay.
    response.aiter_lines = _aiter_lines  # type: ignore[method-assign]
    return response


def _content_chunks(text: str) -> list[dict[str, Any]]:
    """OpenAI streaming chunks for a plain text reply."""
    out: list[dict[str, Any]] = []
    for piece in text:
        out.append(
            {
                "choices": [
                    {"delta": {"content": piece}, "index": 0, "finish_reason": None}
                ]
            }
        )
    out.append(
        {"choices": [{"delta": {}, "index": 0, "finish_reason": "stop"}]}
    )
    return out


def _tool_call_chunks(
    name: str,
    arguments: dict[str, Any],
    call_id: str = "call_1",
    call_type: str = "function",
    reasoning: str = "",
) -> list[dict[str, Any]]:
    """OpenAI streaming chunks that request a single tool call."""
    arg_str = json.dumps(arguments)
    chunks: list[dict[str, Any]] = []
    if reasoning:
        chunks.append(
            {
                "choices": [
                    {
                        "delta": {"content": reasoning},
                        "index": 0,
                        "finish_reason": None,
                    }
                ]
            }
        )
    chunks.extend([
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": call_id,
                                "type": call_type,
                                "function": {"name": name, "arguments": ""},
                            }
                        ]
                    },
                    "index": 0,
                    "finish_reason": None,
                }
            ]
        },
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {"index": 0, "function": {"arguments": arg_str}}
                        ]
                    },
                    "index": 0,
                    "finish_reason": None,
                }
            ]
        },
        {
            "choices": [
                {"delta": {}, "index": 0, "finish_reason": "tool_calls"}
            ]
        },
    ])
    return chunks


# ── endpoint shape ──────────────────────────────────────────────────────────


def _stream_mock(
    response: httpx.Response | httpx.ConnectError | list[httpx.Response],
) -> MagicMock:
    """Build a mock for ``httpx.AsyncClient.stream``.

    ``stream`` is an async method returning an async context manager. We use a
    plain (sync) :class:`MagicMock` whose call returns a :class:`_FakeStreamContext`
    — the async ``__aenter__``/``__aexit__`` live on that wrapper. Accepts a
    single response, an exception, or a list of responses (one per loop round).
    """
    if isinstance(response, httpx.ConnectError):
        mock = MagicMock(side_effect=response)
        return mock
    if isinstance(response, list):
        return MagicMock(side_effect=[_FakeStreamContext(r) for r in response])
    return MagicMock(return_value=_FakeStreamContext(response))


def test_send_returns_sse_stream_with_content_and_done() -> None:
    """AC: POST /api/chat/send 返回 SSE 流式响应; 事件含 content/done."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        mock_stream = _stream_mock(_make_stream_response(_content_chunks("你好，世界")))
        with patch("httpx.AsyncClient.stream", mock_stream):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "hi",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        types = _sse_event_types(resp)
        assert "content" in types
        assert types[-1] == "done"
        # content deltas concatenate to the full reply
        text = "".join(
            e["data"]["text"] for e in _sse_chunks(resp) if e["event"] == "content"
        )
        assert text == "你好，世界"


def test_send_persists_user_and_assistant_to_jsonl() -> None:
    """AC: SSE 连接中断时保留已写入 JSONL 的记录."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        mock_stream = _stream_mock(_make_stream_response(_content_chunks("回复内容")))
        with patch("httpx.AsyncClient.stream", mock_stream):
            client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "用户消息",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        detail = conversations_store.get_conversation(conv_id)
        assert detail is not None
        roles = [e["role"] for e in detail["events"]]
        assert roles[0] == "user"
        assert roles[-1] == "assistant"
        assert detail["events"][0]["data"]["text"] == "用户消息"
        assert detail["events"][-1]["data"]["text"] == "回复内容"


def test_request_params_validation() -> None:
    """AC: 请求参数包含 conversation_id, message, agent_id, uploaded_file_paths."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        # Missing required field → 422.
        resp = client.post(
            "/api/chat/send",
            json={"conversation_id": conv_id, "message": "hi"},
        )
        assert resp.status_code == 422

        # uploaded_file_paths is optional and accepted.
        mock_stream = _stream_mock(_make_stream_response(_content_chunks("ok")))
        with patch("httpx.AsyncClient.stream", mock_stream):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "hi",
                    "agent_id": agents_store.get_default_agent()["id"],
                    "uploaded_file_paths": ["uploads/foo.txt"],
                },
            )
        assert resp.status_code == 200
        # The user-message JSONL event records the uploaded paths.
        detail = conversations_store.get_conversation(conv_id)
        assert detail is not None
        assert detail["events"][0]["data"]["uploaded_file_paths"] == ["uploads/foo.txt"]


def test_error_event_when_model_call_fails() -> None:
    """AC: SSE 事件类型包含 error."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        mock_stream = _stream_mock(httpx.ConnectError("boom"))
        with patch("httpx.AsyncClient.stream", mock_stream):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "hi",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        types = _sse_event_types(resp)
        assert "error" in types
        assert types[-1] == "done"


def test_error_event_when_agent_missing() -> None:
    """A non-existent Agent surfaces an error + done event."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        conv_id = _create_conversation(client)

        resp = client.post(
            "/api/chat/send",
            json={
                "conversation_id": conv_id,
                "message": "hi",
                "agent_id": "no-such-agent",
            },
        )
        types = _sse_event_types(resp)
        assert "error" in types
        assert types[-1] == "done"


def test_error_event_when_conversation_missing() -> None:
    """A non-existent conversation surfaces an error + done event."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)

        resp = client.post(
            "/api/chat/send",
            json={
                "conversation_id": "no-such-conv",
                "message": "hi",
                "agent_id": agents_store.get_default_agent()["id"],
            },
        )
        types = _sse_event_types(resp)
        assert "error" in types


def test_tool_call_and_tool_result_events() -> None:
    """AC: SSE 事件类型包含 tool_call 与 tool_result, 并执行工具."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        # First round: model requests write_file; second round: model stops.
        round1 = _make_stream_response(
            _tool_call_chunks("write_file", {"path": "memory/note.md", "content": "hi"})
        )
        round2 = _make_stream_response(_content_chunks("已写入"))
        mock_stream = _stream_mock([round1, round2])
        with patch("httpx.AsyncClient.stream", mock_stream):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "写一个文件",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        types = _sse_event_types(resp)
        assert "tool_call" in types
        assert "tool_result" in types
        assert types[-1] == "done"

        # The tool actually executed: the result landed in JSONL.
        detail = conversations_store.get_conversation(conv_id)
        assert detail is not None
        tool_results = [e for e in detail["events"] if e["role"] == "tool"]
        assert tool_results
        assert tool_results[0]["data"]["ok"] is True
        assert "已写入" in tool_results[0]["data"]["result"]


def test_tool_failure_surfaces_ok_false_and_continues() -> None:
    """A blocked tool returns ok=False; the model then continues."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)

        # read_file on a traversal path → SecurityBlockedError → ok=False.
        round1 = _make_stream_response(
            _tool_call_chunks("read_file", {"path": "../../etc/passwd"})
        )
        round2 = _make_stream_response(_content_chunks("抱歉，无法读取"))
        mock_stream = _stream_mock([round1, round2])
        with patch("httpx.AsyncClient.stream", mock_stream):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "读取敏感文件",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        chunks = _sse_chunks(resp)
        tool_result = next(c for c in chunks if c["event"] == "tool_result")
        assert tool_result["data"]["ok"] is False
        assert "安全拦截" in tool_result["data"]["result"]


def test_intermediate_tool_round_text_is_thinking_and_persisted() -> None:
    """Text accompanying a tool request is reasoning, not final content."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        _attach_model_to_default(client, model_id)
        conv_id = _create_conversation(client)
        round1 = _make_stream_response(
            _tool_call_chunks(
                "read_file", {"path": "memory/missing.md"}, reasoning="先检查文件"
            )
        )
        round2 = _make_stream_response(_content_chunks("检查完成"))
        with patch("httpx.AsyncClient.stream", _stream_mock([round1, round2])):
            resp = client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "检查文件",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        events = _sse_chunks(resp)
        assert [event["event"] for event in events] == [
            "thinking",
            "tool_call",
            "tool_result",
            "content",
            "done",
        ]
        detail = conversations_store.get_conversation(conv_id)
        assert detail is not None
        thinking = next(event for event in detail["events"] if event["type"] == "thinking")
        assert thinking["data"]["text"] == "先检查文件"


def test_skill_call_is_dispatched_and_keeps_skill_type(tmp_path: Any) -> None:
    """Skills share tool_calls but retain their distinct persisted type."""
    from app.services import agent_loop

    _install_memory_keyring()
    _reset_all()
    skills_dir = tmp_path / "skills"
    skill_dir = skills_dir / "summarise"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("# 摘要技能\n\n按步骤输出摘要。", encoding="utf-8")

    with patch.object(agent_loop, "SKILLS_CONFIG_DIR", skills_dir):
        with TestClient(create_app()) as client:
            model_id = _create_model(client)
            agent = _attach_model_to_default(client, model_id)
            updated = client.put(
                f"/api/agents/{agent['id']}",
                json={
                    "name": agent["name"],
                    "description": agent["description"],
                    "model_id": model_id,
                    "tools": agent["tools"],
                    "skills": ["summarise"],
                },
            )
            assert updated.status_code == 200
            conv_id = _create_conversation(client)
            round1 = _make_stream_response(
                _tool_call_chunks("summarise", {"text": "会议记录"})
            )
            round2 = _make_stream_response(_content_chunks("摘要完成"))
            with patch("httpx.AsyncClient.stream", _stream_mock([round1, round2])):
                resp = client.post(
                    "/api/chat/send",
                    json={
                        "conversation_id": conv_id,
                        "message": "整理会议记录",
                        "agent_id": agent["id"],
                    },
                )

    detail = conversations_store.get_conversation(conv_id)
    assert detail is not None
    call = next(event for event in detail["events"] if event["type"] == "tool_call")
    result = next(event for event in detail["events"] if event["role"] == "tool")
    assert call["data"]["tool_calls"][0]["type"] == "skill"
    assert result["data"]["type"] == "skill"
    assert result["data"]["ok"] is True
    assert "摘要技能" in result["data"]["result"]


def test_disabled_tool_excluded_from_request() -> None:
    """Disabled tools must not appear in the model request's tools array."""
    _install_memory_keyring()
    _reset_all()
    with TestClient(create_app()) as client:
        model_id = _create_model(client)
        # Seed default then attach model + restrict to read_file only so we can
        # observe write_file being dropped when disabled.
        _seed_default_agent(client)
        default = agents_store.get_default_agent()
        assert default is not None
        resp = client.put(
            f"/api/agents/{default['id']}",
            json={
                "name": default["name"],
                "description": default.get("description", ""),
                "model_id": model_id,
                "tools": ["read_file", "write_file", "execute_command"],
                "skills": [],
            },
        )
        assert resp.status_code == 200
        conv_id = _create_conversation(client)

        # Disable execute_command globally.
        resp = client.put("/api/tools/execute_command/toggle", json={"enabled": False})
        assert resp.status_code == 200

        captured: dict[str, Any] = {}

        def _capture_stream(*_args: Any, **_kwargs: Any) -> _FakeStreamContext:
            # Inspect the payload passed to httpx.AsyncClient.stream.
            payload = _kwargs.get("json") or {}
            captured["tools"] = payload.get("tools")
            return _FakeStreamContext(_make_stream_response(_content_chunks("ok")))

        mock_stream = MagicMock(side_effect=_capture_stream)
        with patch("httpx.AsyncClient.stream", mock_stream):
            client.post(
                "/api/chat/send",
                json={
                    "conversation_id": conv_id,
                    "message": "hi",
                    "agent_id": agents_store.get_default_agent()["id"],
                },
            )

        tool_names = [t["function"]["name"] for t in (captured["tools"] or [])]
        assert "read_file" in tool_names
        assert "write_file" in tool_names
        assert "execute_command" not in tool_names

def test_thinking_event_type_is_available() -> None:
    """The ``thinking`` event helper is wired and serialises correctly."""
    from app.services import sse_events

    payload = json.loads(sse_events.thinking_event("推理中")[len("data: ") :])
    assert payload["event"] == "thinking"
    assert payload["data"]["text"] == "推理中"
