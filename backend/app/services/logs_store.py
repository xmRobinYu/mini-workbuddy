"""Log projection service (US-013).

Logs are **not** a first-class persisted store. They are projected on demand
from the conversation JSONL event stream (see :mod:`conversations_store`):
each backend execution event — a model reply, a tool/skill call result —
becomes one row in the unified logs view.

Projection rules
----------------
- ``role=assistant, type=message``  → ``model`` row (``chat.completion``)
- ``type=tool_result``              → ``tool`` or ``skill`` row (per ``data.type``),
  with ``input`` taken from the matching ``tool_call`` event (joined by
  ``tool_call_id``) and ``output`` from ``data.result``

Events that are not execution events (user messages, intermediate ``thinking``
streams) are deliberately not projected as log rows — they belong to the chat
transcript, not the execution log.

The projection is pure read-only: it never writes back to the conversations
store, so a damaged or partial JSONL only degrades the logs view (corrupt
lines are already skipped by :func:`conversations_store._read_events`).
"""

from __future__ import annotations

import json
from typing import Any

from app.schemas.log import LogRead, LogType
from app.services import conversations_store

# Caps applied to the projection so an unbounded history cannot exhaust
# memory in a single request. The ``limit`` query param further trims the
# final result set; this is the ceiling when no limit is supplied.
DEFAULT_LIMIT = 200
MAX_LIMIT = 1000

# A model reply longer than this is truncated in the ``detail`` summary line
# (the full text remains available in ``output``).
_DETAIL_MAX = 80


def _truncate(text: str, limit: int = _DETAIL_MAX) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _classify(event: dict[str, Any]) -> LogType | None:
    """Return the log ``type`` for an event, or ``None`` to skip it."""
    role = event.get("role")
    etype = event.get("type")
    if role == "assistant" and etype == "message":
        return "model"
    if etype == "tool_result":
        data = event.get("data") or {}
        return "skill" if data.get("type") == "skill" else "tool"
    return None


def _coerce_arguments(raw: Any) -> dict[str, Any]:
    """Normalise a tool call's ``arguments`` into a dict.

    The model returns ``arguments`` as a JSON string (per the OpenAI
    tool-call spec), and that is how ``tool_call`` events are persisted to
    the conversation JSONL. The projection works in dicts, so parse the
    string here; a malformed or non-object payload degrades to an empty
    dict rather than raising (a bad history should only blank the log
    detail, never 500 the whole endpoint).
    """
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _detail_for_call(name: str, args: dict[str, Any], result: Any) -> str:
    """Build a one-line summary for a tool/skill call."""
    if name == "read_file":
        path = args.get("path") or ""
        return f"读取 {path}" if path else "read_file"
    if name == "write_file":
        path = args.get("path") or ""
        content = args.get("content") or ""
        size = len(str(content).encode("utf-8"))
        return f"写入 {path}（{size} B）" if path else "write_file"
    if name == "execute_command":
        cmd = args.get("command") or ""
        return f"$ {cmd}" if cmd else "execute_command"
    if name in ("save_memory", "search_memory"):
        return name
    # Generic fallback: surface the most descriptive argument if any.
    for key in ("path", "command", "query", "content"):
        val = args.get(key)
        if val:
            return f"{name} · {_truncate(str(val))}"
    if isinstance(result, str) and result:
        return _truncate(result)
    return name


def _build_tool_arguments_index(
    events: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Map ``tool_call_id`` → the call's arguments, for joining results.

    Scans ``tool_call`` events (which carry the request) so a later
    ``tool_result`` event can recover its input without a second pass.
    A single tool_call event may carry several calls; each is indexed by id.
    """
    index: dict[str, dict[str, Any]] = {}
    for ev in events:
        if ev.get("type") != "tool_call":
            continue
        data = ev.get("data") or {}
        for call in data.get("tool_calls") or []:
            call_id = call.get("id") or ""
            if not call_id:
                continue
            fn = call.get("function") or {}
            index[call_id] = {
                "name": fn.get("name", ""),
                "arguments": _coerce_arguments(fn.get("arguments")),
            }
    return index


def _project_conversation(
    conversation_id: str, title: str, events: list[dict[str, Any]]
) -> list[LogRead]:
    """Project one conversation's events into log rows."""
    rows: list[LogRead] = []
    arg_index = _build_tool_arguments_index(events)

    for idx, ev in enumerate(events):
        log_type: LogType | None = _classify(ev)
        if log_type is None:
            continue
        time = ev.get("timestamp") or ""
        data = ev.get("data") or {}
        stable_id = f"{conversation_id}:{idx}"

        if log_type == "model":
            text = data.get("text") or ""
            rows.append(
                LogRead(
                    id=stable_id,
                    conversation_id=conversation_id,
                    conversation_title=title,
                    time=time,
                    type="model",
                    event="chat.completion",
                    agent="",
                    level="info",
                    status="ok",
                    latency="",
                    detail=_truncate(text) or "模型回复",
                    input=None,
                    output=text or None,
                )
            )
            continue

        # tool / skill result
        name = data.get("name") or ""
        ok = bool(data.get("ok", True))
        result = data.get("result")
        tool_call_id = ev.get("tool_call_id") or ""
        matched = arg_index.get(tool_call_id)
        args: dict[str, Any] = (
            matched["arguments"] if matched else {}
        )
        # If the result event carries the name but the call did not, prefer
        # the call's name for consistency.
        event_name = name or (matched["name"] if matched else "tool")
        rows.append(
            LogRead(
                id=stable_id,
                conversation_id=conversation_id,
                conversation_title=title,
                time=time,
                type=log_type,
                event=event_name,
                agent="",
                level="error" if not ok else "info",
                status="error" if not ok else "ok",
                latency="",
                detail=_detail_for_call(event_name, args, result),
                input=args or None,
                output=result,
            )
        )

    return rows


def _row_matches_q(row: LogRead, q: str) -> bool:
    """Substring match across the row's own content (not the conversation
    title, which is shown separately and would otherwise match every row in
    a matching conversation)."""
    haystack = " ".join(
        [
            row.event,
            row.detail,
            row.agent,
            str(row.output or ""),
            str(row.input or ""),
        ]
    ).lower()
    return q in haystack


def project_logs(
    *,
    type: str | None = None,
    q: str | None = None,
    level: str | None = None,
    status: str | None = None,
    limit: int | None = None,
) -> list[LogRead]:
    """Project logs from all conversations, newest-first, with filters.

    Parameters mirror the GET /api/logs query params. ``limit`` caps the
    returned rows (clamped to ``MAX_LIMIT``); ``None`` falls back to
    ``DEFAULT_LIMIT``. The returned list is ordered newest-first by ``time``.
    """
    rows: list[LogRead] = []
    for summary in conversations_store.list_conversations():
        cid = summary["id"]
        conversation = conversations_store.get_conversation(cid)
        if conversation is None:
            continue
        rows.extend(
            _project_conversation(
                cid,
                summary.get("title", ""),
                conversation.get("events") or [],
            )
        )

    # Newest-first by event time. Events without a timestamp sort last.
    rows.sort(key=lambda r: r.time, reverse=True)

    # ── filters ──────────────────────────────────────────────────────────
    if type and type != "all":
        rows = [r for r in rows if r.type == type]
    if level and level != "all":
        rows = [r for r in rows if r.level == level]
    if status and status != "all":
        rows = [r for r in rows if r.status == status]
    if q:
        needle = q.strip().lower()
        if needle:
            rows = [r for r in rows if _row_matches_q(r, needle)]

    effective_limit = DEFAULT_LIMIT if limit is None else limit
    if effective_limit < 0:
        effective_limit = 0
    if effective_limit > MAX_LIMIT:
        effective_limit = MAX_LIMIT
    return rows[:effective_limit]


__all__ = ["project_logs", "DEFAULT_LIMIT", "MAX_LIMIT"]
