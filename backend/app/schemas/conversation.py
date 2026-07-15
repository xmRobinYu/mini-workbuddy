"""Pydantic schemas for the conversation management API (US-011).

A conversation is persisted as a JSONL file at
``workspace/conversations/{id}/{id}.jsonl`` — one JSON object per interaction
event. The list/search endpoints return a lightweight summary (title +
timestamps); the detail endpoint returns the full ordered list of events.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    """Payload for POST /api/conversations.

    ``title`` is optional — when omitted it defaults to the creation timestamp
    (handled by the service layer so the schema stays validation-only).
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    title: Optional[str] = Field(
        default=None, max_length=200, description="会话标题（可省略，默认用创建时间）"
    )


class ConversationRename(BaseModel):
    """Payload for PUT /api/conversations/{id} (rename)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(..., min_length=1, max_length=200, description="新的会话标题")


class ConversationSummary(BaseModel):
    """Lightweight conversation record returned by list/search endpoints."""

    id: str = Field(..., description="会话 id（UUID）")
    title: str = Field(..., description="会话标题")
    created_at: str = Field(..., description="创建时间（ISO-8601 UTC）")
    updated_at: str = Field(..., description="最后更新时间（ISO-8601 UTC）")


class ConversationEvent(BaseModel):
    """A single interaction event stored on a JSONL line.

    The event payload is intentionally permissive (``dict[str, Any]``) so the
    store can round-trip the rich event objects produced by the Agent loop
    (role/type/timestamp/data/reasoning/tool_call_id, …) without the schema
    having to know every field up front.
    """

    model_config = ConfigDict(extra="allow")

    data: dict[str, Any] = Field(
        default_factory=dict, description="该交互事件的原始 JSON 对象"
    )


class ConversationDetail(BaseModel):
    """Full conversation record returned by GET /api/conversations/{id}."""

    id: str = Field(..., description="会话 id（UUID）")
    title: str = Field(..., description="会话标题")
    created_at: str = Field(..., description="创建时间（ISO-8601 UTC）")
    updated_at: str = Field(..., description="最后更新时间（ISO-8601 UTC）")
    events: list[dict[str, Any]] = Field(
        default_factory=list, description="按时间顺序排列的全部交互记录"
    )


__all__ = [
    "ConversationCreate",
    "ConversationRename",
    "ConversationSummary",
    "ConversationEvent",
    "ConversationDetail",
]
