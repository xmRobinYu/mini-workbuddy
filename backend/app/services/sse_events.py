"""SSE event helpers for the chat send endpoint (US-016).

These pure functions build the SSE wire format for each event type the Agent
loop emits, so the streaming service and its tests share one source of truth.

SSE event types (acceptance criterion):
- ``thinking``  — intermediate model text (the "Agent 思考中..." stream)
- ``content``   — streamed final-reply text deltas
- ``tool_call`` — the Agent invoked a tool (name + arguments)
- ``tool_result`` — the tool returned a result
- ``done``      — the loop completed (optionally carrying a note, e.g. the
                  50-round degradation message produced by US-021)
- ``error``     — an unrecoverable error occurred

Heartbeats are emitted as a bare SSE comment line ``: heartbeat`` every 15 s
(see :func:`heartbeat_line`).
"""

from __future__ import annotations

import json
from typing import Any

# SSE comment line sent every HEARTBEAT_SECONDS to keep the connection alive.
HEARTBEAT_SECONDS = 15
HEARTBEAT_LINE = ": heartbeat\n\n"


def heartbeat_line() -> str:
    """Return the SSE heartbeat comment line (15 s keep-alive)."""
    return HEARTBEAT_LINE


def _format(event: str, data: Any) -> str:
    """Serialise a single SSE event with a JSON ``data`` payload.

    The payload is JSON-encoded; multi-line JSON is sent on a single SSE
    ``data:`` line so EventSource / fetch-streaming parsers see one event.
    A trailing blank line terminates the event per the SSE spec.
    """
    payload = json.dumps({"event": event, "data": data}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def thinking_event(text: str) -> str:
    """A ``thinking`` event — intermediate reasoning text delta."""
    return _format("thinking", {"text": text})


def content_event(text: str) -> str:
    """A ``content`` event — streamed final-reply text delta."""
    return _format("content", {"text": text})


def tool_call_event(
    tool_call_id: str, name: str, arguments: dict[str, Any]
) -> str:
    """A ``tool_call`` event — the Agent requested a tool invocation."""
    return _format(
        "tool_call",
        {"id": tool_call_id, "name": name, "arguments": arguments},
    )


def tool_result_event(
    tool_call_id: str, name: str, result: str, ok: bool = True
) -> str:
    """A ``tool_result`` event — the outcome of a tool invocation."""
    return _format(
        "tool_result",
        {"id": tool_call_id, "name": name, "result": result, "ok": ok},
    )


def done_event(note: str | None = None) -> str:
    """A ``done`` event — the loop finished. ``note`` carries optional notice."""
    payload: dict[str, Any] = {}
    if note:
        payload["note"] = note
    return _format("done", payload)


def error_event(message: str) -> str:
    """An ``error`` event — an unrecoverable failure."""
    return _format("error", {"message": message})


__all__ = [
    "HEARTBEAT_SECONDS",
    "heartbeat_line",
    "thinking_event",
    "content_event",
    "tool_call_event",
    "tool_result_event",
    "done_event",
    "error_event",
]
