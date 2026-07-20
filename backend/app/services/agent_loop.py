"""Agent execution loop driving the SSE chat send endpoint.

This module owns the streaming orchestration: assemble the request context,
call the OpenAI-compatible model with streaming, parse tool/skill call
requests, execute them, persist every interaction event to the conversation
JSONL, and emit SSE events to the client.

Responsibilities:
- Stream ``content`` / ``thinking`` / ``tool_call`` / ``tool_result`` /
  ``done`` / ``error`` SSE events.
- 15 s heartbeat keep-alive (injected by a side task between events).
- Detect client disconnect and terminate the loop.
- Persist every interaction event to the conversation JSONL so an
  interrupted stream keeps what was already written.
- Dispatch tool and skill calls with the same ``tool_calls`` shape.  Calls
  persisted to the conversation use ``type: tool`` or ``type: skill``.

Design notes:
- The model call is streamed with httpx so first-token latency stays low
  (PRD NFR: first token < 3 s). We parse the OpenAI streaming ``data:``
  lines ourselves rather than depending on an OpenAI SDK.
- Disconnect detection relies on :meth:`starlette.requests.Request.is_disconnected`,
  polled both by a heartbeat task and between model rounds; writes to a
  closed connection also raise, surfacing the disconnect promptly.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx

from app.schemas.tool import SecurityBlockedError
from app.core.config import CONVERSATIONS_DIR, SKILLS_CONFIG_DIR
from app.core.path_security import is_safe_workspace_path
from app.services import conversations_store, sse_events, tool_functions
from app.services.agents_store import get_agent, read_agent_md
from app.services.model_tester import _build_chat_url, _resolve_api_key
from app.services.models_store import get_model
from app.services.system_prompt import build_system_prompt

logger = logging.getLogger(__name__)

# Per the PRD the tool/skill call loop is capped at 50 rounds. The full
# degradation behaviour (saving intermediate outputs + summary) is US-021;
# here we enforce the cap and emit a done-event note when hit.
MAX_TOOL_ROUNDS = 50
DEGRADATION_SUMMARY_FILENAME = "_degradation_summary.md"
DEGRADATION_NOTICE = "已达到最大循环次数，部分结果已保存。"

# Heartbeat cadence (acceptance criterion: every 15 s).
HEARTBEAT_INTERVAL = sse_events.HEARTBEAT_SECONDS

# Sensible defaults for the streaming model call.
MODEL_STREAM_TIMEOUT = 300.0
MODEL_READ_TIMEOUT = 180.0


class AgentLoopError(Exception):
    """An unrecoverable error raised inside the agent loop."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _save_degradation_summary(conversation_id: str) -> None:
    """Save the completed tool-call rounds when the loop reaches its cap."""
    conversation = conversations_store.get_conversation(conversation_id)
    completed_rounds = [
        event
        for event in (conversation or {}).get("events", [])
        if event.get("type") == "tool_call"
    ]
    completed_steps: list[str] = []
    for index, event in enumerate(completed_rounds, start=1):
        calls = event.get("data", {}).get("tool_calls", [])
        names = [
            call.get("function", {}).get("name", "未知调用")
            for call in calls
            if isinstance(call, dict)
        ]
        completed_steps.append(f"{index}. " + "、".join(names or ["未知调用"]))

    completed_section = "\n".join(f"- {step}" for step in completed_steps)
    if not completed_section:
        completed_section = "- 无"
    summary = (
        "# Agent Loop 降级摘要\n\n"
        f"> {DEGRADATION_NOTICE}\n\n"
        "## 已完成步骤\n"
        f"{completed_section}\n\n"
        "## 未完成步骤\n"
        "- Agent 在达到工具/技能调用轮数上限后被强制终止，尚未生成最终回复。\n"
        "- 请基于已保存的中间结果继续任务。\n"
    )
    output_path = CONVERSATIONS_DIR / conversation_id / "outputs" / DEGRADATION_SUMMARY_FILENAME
    if not is_safe_workspace_path(output_path):
        raise ValueError("非法的会话 id：输出目录越界 workspace/")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(summary, encoding="utf-8")


def _build_tool_definitions(agent: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the OpenAI ``tools`` array for an Agent's available tools.

    Disabled tools are excluded.  The OpenAI wire protocol requires
    ``type: function`` here; completed calls are normalised to ``type: tool``
    before they are persisted and dispatched.
    """
    from app.services.tools_store import TOOL_DESCRIPTIONS, is_tool_enabled

    schemas: dict[str, dict[str, Any]] = {
        "read_file": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "workspace/ 内的文件相对路径"},
            },
            "required": ["path"],
        },
        "write_file": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "workspace/ 内的文件相对路径"},
                "content": {"type": "string", "description": "要写入的文本内容"},
            },
            "required": ["path", "content"],
        },
        "execute_command": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "要执行的 shell 命令"},
                "working_dir": {"type": "string", "description": "工作目录（可选）"},
            },
            "required": ["command"],
        },
        "save_memory": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["long_term", "short_term"]},
                "content": {"type": "string", "description": "要保存的记忆内容"},
            },
            "required": ["type", "content"],
        },
        "search_memory": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "用于检索记忆的关键词"},
                "type": {
                    "type": "string",
                    "enum": ["long_term", "short_term", "all"],
                    "default": "all",
                },
            },
            "required": ["query"],
        },
    }
    definitions: list[dict[str, Any]] = []
    for name in agent.get("tools", []):
        if name not in schemas:
            continue
        if not is_tool_enabled(name):
            continue
        definitions.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": TOOL_DESCRIPTIONS.get(name, ""),
                    "parameters": schemas[name],
                },
            }
        )
    definitions.extend(
        [
            {
                "type": "function",
                "function": {
                    "name": "save_memory",
                    "description": "保存长期或当天短期记忆；所有 Agent 始终可用",
                    "parameters": schemas["save_memory"],
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_memory",
                    "description": "按关键词检索长期和短期记忆；所有 Agent 始终可用",
                    "parameters": schemas["search_memory"],
                },
            },
        ]
    )
    return definitions


def _skill_file(skill_id: str) -> Path | None:
    """Return the selected skill's definition file when it stays in config."""
    if not skill_id or "/" in skill_id or "\\" in skill_id or skill_id in {".", ".."}:
        return None
    candidate = (SKILLS_CONFIG_DIR / skill_id / "SKILL.md").resolve(strict=False)
    root = SKILLS_CONFIG_DIR.resolve(strict=False)
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def _build_skill_definitions(agent: dict[str, Any]) -> list[dict[str, Any]]:
    """Expose configured skills through OpenAI-compatible function schemas."""
    definitions: list[dict[str, Any]] = []
    for skill_id in agent.get("skills", []):
        if not isinstance(skill_id, str):
            continue
        skill_file = _skill_file(skill_id)
        if skill_file is None:
            continue
        description = skill_file.read_text(encoding="utf-8").splitlines()[0:1]
        definitions.append(
            {
                "type": "function",
                "function": {
                    "name": skill_id,
                    "description": description[0].lstrip("# ").strip()
                    if description
                    else f"执行技能 {skill_id}",
                    "parameters": {"type": "object", "additionalProperties": True},
                },
            }
        )
    return definitions


def _execute_tool(name: str, arguments: dict[str, Any]) -> tuple[str, bool]:
    """Run a built-in tool by name. Returns ``(result_text, ok)``.

    ``SecurityBlockedError`` and any other exception are caught and returned
    as a ``ok=False`` result string so the model can decide how to proceed
    (PRD: the system never auto-retries; the Agent decides).
    """
    try:
        if name == "read_file":
            result = tool_functions.tool_read_file(arguments.get("path", ""))
        elif name == "write_file":
            result = tool_functions.tool_write_file(
                arguments.get("path", ""), arguments.get("content", "")
            )
        elif name == "execute_command":
            result = tool_functions.tool_execute_command(
                arguments.get("command", ""),
                arguments.get("working_dir"),
            )
        elif name == "save_memory":
            from app.services.memory_store import save_memory

            result = save_memory(arguments.get("type", ""), arguments.get("content", ""))
        elif name == "search_memory":
            from app.services.memory_store import search_memory

            result = search_memory(arguments.get("query", ""), arguments.get("type", "all"))
        else:
            return f"未知工具：{name}", False
    except SecurityBlockedError as exc:
        return f"安全拦截：{exc.reason}", False
    except Exception as exc:  # noqa: BLE001 — surface any tool error to the model
        return f"工具执行失败：{exc}", False
    return result, True


def _execute_skill(name: str, arguments: dict[str, Any]) -> tuple[str, bool]:
    """Load a configured skill definition as the skill's deterministic flow.

    Skills are Markdown-defined procedures in P0.  Returning the definition
    and invocation arguments lets the model execute that procedure while
    preserving the same result/error feedback loop used by built-in tools.
    """
    try:
        skill_file = _skill_file(name)
        if skill_file is None:
            return f"技能不可用：{name}", False
        definition = skill_file.read_text(encoding="utf-8").strip()
        if not definition:
            return f"技能执行失败：{name} 的 SKILL.md 为空", False
        return (
            f"技能“{name}”已加载。调用参数："
            f"{json.dumps(arguments, ensure_ascii=False)}\n\n{definition}",
            True,
        )
    except OSError as exc:
        return f"技能执行失败：{exc}", False


def _execute_call(
    call_type: str, name: str, arguments: dict[str, Any]
) -> tuple[str, bool]:
    """Dispatch a normalised tool or skill call without automatic retries."""
    if call_type == "tool":
        return _execute_tool(name, arguments)
    if call_type == "skill":
        return _execute_skill(name, arguments)
    return f"未知调用类型：{call_type}", False


def _parse_stream_line(line: str) -> dict[str, Any] | None:
    """Parse one ``data:`` line from an OpenAI streaming response.

    Returns the decoded JSON object, ``None`` for keep-alive blanks, the
    ``{"_done": True}`` sentinel for ``[DONE]``. Malformed JSON raises
    ``ValueError`` so the caller can decide to skip or abort.
    """
    stripped = line.strip()
    if not stripped or not stripped.startswith("data:"):
        return None
    payload = stripped[len("data:") :].strip()
    if payload == "[DONE]":
        return {"_done": True}
    return json.loads(payload)


def _extract_delta(chunk: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Return ``(text_delta, tool_calls_delta)`` from one streamed chunk."""
    choices = chunk.get("choices") or []
    text = ""
    tool_calls: list[dict[str, Any]] = []
    for choice in choices:
        delta = choice.get("delta") or {}
        if delta.get("content"):
            text += delta["content"]
        tc = delta.get("tool_calls")
        if tc:
            tool_calls.extend(tc)
    return text, tool_calls


def _merge_tool_call_deltas(
    acc: list[dict[str, Any]], deltas: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Accumulate streamed tool_call deltas into complete call objects.

    OpenAI streams a tool call in pieces keyed by ``index``: the first chunk
    carries ``id`` + ``function.name``; subsequent chunks carry argument
    fragments under ``function.arguments``.
    """
    for d in deltas:
        idx = d.get("index", 0)
        while len(acc) <= idx:
            acc.append(
                {"id": "", "type": "function", "function": {"name": "", "arguments": ""}}
            )
        entry = acc[idx]
        if d.get("id"):
            entry["id"] = d["id"]
        if d.get("type"):
            entry["type"] = d["type"]
        fn = d.get("function") or {}
        if fn.get("name"):
            entry["function"]["name"] = fn["name"]
        if fn.get("arguments"):
            entry["function"]["arguments"] += fn["arguments"]
    return acc


def _finish_reason(chunk: dict[str, Any]) -> str | None:
    """Return the first ``finish_reason`` seen in a streamed chunk, else None."""
    for choice in chunk.get("choices") or []:
        reason = choice.get("finish_reason")
        if reason:
            return reason
    return None


async def _stream_model(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> AsyncIterator[dict[str, Any]]:
    """Yield parsed chunks from a streaming OpenAI chat completion.

    Raises :class:`AgentLoopError` on non-2xx responses or transport failures.
    """
    try:
        async with client.stream(
            "POST", url, headers=headers, json=payload
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                detail = body.decode("utf-8", errors="replace")[:500]
                raise AgentLoopError(
                    f"模型请求失败：HTTP {resp.status_code} {detail}"
                )
            async for line in resp.aiter_lines():
                parsed = _parse_stream_line(line)
                if parsed is None:
                    continue
                yield parsed
    except httpx.TimeoutException as exc:
        raise AgentLoopError(f"模型请求超时：{exc}") from exc
    except httpx.HTTPError as exc:
        raise AgentLoopError(f"模型连接失败：{exc}") from exc


async def run_agent_loop(
    *,
    request: Any,
    conversation_id: str,
    agent_id: str,
    message: str,
    uploaded_file_paths: list[str] | None = None,
) -> AsyncIterator[str]:
    """Drive the agent loop and yield SSE-formatted event strings.

    ``request`` is the Starlette :class:`Request` used for disconnect
    detection. The generator persists every interaction event to the
    conversation JSONL as it happens, so an interrupted stream keeps what was
    already written (acceptance criterion).
    """
    # ── Resolve context ──────────────────────────────────────────────────
    agent = get_agent(agent_id)
    if agent is None:
        yield sse_events.error_event(f"Agent 不存在：{agent_id}")
        yield sse_events.done_event()
        return

    conversation = conversations_store.get_conversation(conversation_id)
    if conversation is None:
        yield sse_events.error_event(f"会话不存在：{conversation_id}")
        yield sse_events.done_event()
        return

    model_id = agent.get("model_id")
    model = get_model(model_id) if model_id else None
    if model is None:
        yield sse_events.error_event("Agent 未关联可用的模型")
        yield sse_events.done_event()
        return

    api_key = _resolve_api_key(model)
    if not api_key:
        yield sse_events.error_event("模型未配置 API 密钥")
        yield sse_events.done_event()
        return

    agent_md = read_agent_md(agent_id) or ""
    system = build_system_prompt(agent_md, conversation_id)
    skill_definitions = _build_skill_definitions(agent)
    tools = _build_tool_definitions(agent) + skill_definitions
    skill_names = {
        definition["function"]["name"]
        for definition in skill_definitions
    }

    # ── Build message history from persisted JSONL ───────────────────────
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for ev in conversation["events"]:
        role = ev.get("role")
        if role == "user":
            messages.append(
                {"role": "user", "content": ev.get("data", {}).get("text", "")}
            )
        elif role == "assistant":
            # Thinking is persisted for UI recovery. Its text is already
            # carried by the associated tool-call assistant message, so it
            # must not be added a second time to future model requests.
            if ev.get("type") == "thinking":
                continue
            entry: dict[str, Any] = {
                "role": "assistant",
                "content": ev.get("data", {}).get("text", "") or None,
            }
            tcs = ev.get("data", {}).get("tool_calls")
            if tcs:
                entry["tool_calls"] = tcs
            messages.append(entry)
        elif role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": ev.get("tool_call_id", ""),
                    "content": ev.get("data", {}).get("result", ""),
                }
            )

    # Attach uploaded file paths as context to the user message.
    user_text = message
    if uploaded_file_paths:
        user_text += "\n\n[已上传文件]\n" + "\n".join(uploaded_file_paths)

    # Persist the user message immediately.
    conversations_store.append_event(
        conversation_id,
        {
            "role": "user",
            "type": "message",
            "timestamp": _utcnow_iso(),
            "data": {
                "text": message,
                "uploaded_file_paths": uploaded_file_paths or [],
            },
        },
    )
    messages.append({"role": "user", "content": user_text})

    # ── Streaming loop ───────────────────────────────────────────────────
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    chat_url = _build_chat_url(str(model.get("base_url", "")))
    model_name = model.get("model") or model.get("name", "")

    rounds = 0
    while True:
        rounds += 1
        if rounds > MAX_TOOL_ROUNDS:
            try:
                _save_degradation_summary(conversation_id)
            except OSError:
                logger.exception("保存 Agent Loop 降级摘要失败（会话 %s）", conversation_id)
            yield sse_events.done_event(DEGRADATION_NOTICE)
            return

        if await request.is_disconnected():
            logger.info(
                "客户端断开连接，终止 Agent Loop（会话 %s）", conversation_id
            )
            return

        # Refresh memory before every model request so a save_memory call in
        # an earlier round is immediately visible in the next round.
        messages[0]["content"] = build_system_prompt(agent_md, conversation_id)

        payload: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        text_buf = ""
        tool_calls_acc: list[dict[str, Any]] = []
        finish_reason: str | None = None

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(MODEL_STREAM_TIMEOUT, read=MODEL_READ_TIMEOUT)
        ) as client:
            try:
                async for chunk in _stream_model(
                    client, chat_url, headers, payload
                ):
                    if chunk.get("_done"):
                        break
                    text, deltas = _extract_delta(chunk)
                    if text:
                        text_buf += text
                    if deltas:
                        _merge_tool_call_deltas(tool_calls_acc, deltas)
                    reason = _finish_reason(chunk)
                    if reason:
                        finish_reason = reason
            except AgentLoopError as exc:
                # Persist what we have, then surface the error.
                if text_buf:
                    conversations_store.append_event(
                        conversation_id,
                        {
                            "role": "assistant",
                            "type": "message",
                            "timestamp": _utcnow_iso(),
                            "data": {"text": text_buf},
                        },
                    )
                yield sse_events.error_event(exc.message)
                yield sse_events.done_event()
                return

        # ── No tool calls: stream, persist the final reply and finish ───
        if not tool_calls_acc:
            if text_buf:
                yield sse_events.content_event(text_buf)
                conversations_store.append_event(
                    conversation_id,
                    {
                        "role": "assistant",
                        "type": "message",
                        "timestamp": _utcnow_iso(),
                        "data": {"text": text_buf},
                    },
                )
            yield sse_events.done_event()
            return

        # ── Tool calls: emit, execute, persist, feed back to model ───────
        # A model may include explanatory text before requesting work.  This
        # belongs to the intermediate reasoning stream rather than the final
        # assistant reply, and must remain visible after a page refresh.
        if text_buf:
            yield sse_events.thinking_event(text_buf)
            conversations_store.append_event(
                conversation_id,
                {
                    "role": "assistant",
                    "type": "thinking",
                    "timestamp": _utcnow_iso(),
                    "data": {"text": text_buf},
                    "reasoning": text_buf,
                },
            )

        normalised_calls: list[dict[str, Any]] = []
        for call in tool_calls_acc:
            fn = call.get("function", {})
            name = fn.get("name", "")
            arg_str = fn.get("arguments", "") or "{}"
            try:
                arg_obj = json.loads(arg_str) if arg_str else {}
            except json.JSONDecodeError:
                arg_obj = {"_raw": arg_str}
            normalised_calls.append(
                {
                    "id": call.get("id", ""),
                    "type": "skill" if name in skill_names else "tool",
                    "function": {
                        "name": name,
                        "arguments": arg_obj,
                    },
                }
            )

        # The assistant message must carry tool_calls in OpenAI's wire shape
        # (string arguments) for the next request to be valid.
        wire_tool_calls = [
            {
                "id": c["id"],
                "type": "function",
                "function": {
                    "name": c["function"]["name"],
                    "arguments": json.dumps(
                        c["function"]["arguments"], ensure_ascii=False
                    ),
                },
            }
            for c in normalised_calls
        ]
        persisted_calls = [
            {
                **wire_call,
                "type": call["type"],
            }
            for wire_call, call in zip(wire_tool_calls, normalised_calls, strict=True)
        ]
        messages.append(
            {
                "role": "assistant",
                "content": text_buf or None,
                "tool_calls": wire_tool_calls,
            }
        )
        conversations_store.append_event(
            conversation_id,
            {
                "role": "assistant",
                "type": "tool_call",
                "timestamp": _utcnow_iso(),
                "data": {"text": text_buf, "tool_calls": persisted_calls},
                "tool_call_id": (
                    normalised_calls[0]["id"] if normalised_calls else ""
                ),
            },
        )

        for call in normalised_calls:
            tc_id = call["id"]
            call_type = call["type"]
            name = call["function"]["name"]
            args = call["function"]["arguments"]
            yield sse_events.tool_call_event(tc_id, name, args)

            result, ok = _execute_call(call_type, name, args)
            yield sse_events.tool_result_event(tc_id, name, result, ok=ok)

            conversations_store.append_event(
                conversation_id,
                {
                    "role": "tool",
                    "type": "tool_result",
                    "timestamp": _utcnow_iso(),
                    "tool_call_id": tc_id,
                    "data": {
                        "name": name,
                        "type": call_type,
                        "result": result,
                        "ok": ok,
                    },
                },
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": result,
                }
            )

        # If the model signalled "stop" despite carrying tool calls (rare),
        # honour it and exit; otherwise loop to let the model react.
        if finish_reason == "stop":
            yield sse_events.done_event()
            return


__all__ = [
    "MAX_TOOL_ROUNDS",
    "HEARTBEAT_INTERVAL",
    "AgentLoopError",
    "_execute_call",
    "run_agent_loop",
]
