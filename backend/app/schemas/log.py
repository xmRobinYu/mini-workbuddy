"""Pydantic schemas for the log projection API (US-013).

Logs are **not** persisted in their own store. They are projected on demand
from the conversation JSONL event stream by :mod:`app.services.logs_store`.
A log row is a single backend-projected execution event (a model call, a
tool/skill call, its result, an agent message, …) suitable for the unified
logs page.

The schema stays permissive about the ``input`` / ``output`` payloads (typed
as ``Any``) because the underlying conversation events carry rich, free-form
``data`` blobs produced by the Agent loop.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Log "type" mirrors the logs page's tab taxonomy. It is derived from the
# conversation event's role/type pair (see logs_store._classify).
LogType = Literal["model", "tool", "agent", "skill"]
LogLevel = Literal["info", "warn", "error"]
LogStatus = Literal["ok", "error"]


class LogRead(BaseModel):
    """A single projected log row returned by GET /api/logs."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="日志行 id（稳定派生：会话+事件序号）")
    conversation_id: str = Field(..., description="来源会话 id（UUID）")
    conversation_title: str = Field(
        default="", description="来源会话标题（便于展示）"
    )
    time: str = Field(..., description="事件时间（ISO-8601，来自 JSONL）")
    type: LogType = Field(..., description="日志类别：model/tool/agent/skill")
    event: str = Field(..., description="事件名（如 chat.completion / read_file）")
    agent: str = Field(default="", description="来源 Agent 名（可能为空）")
    level: LogLevel = Field(..., description="日志级别：info/warn/error")
    status: LogStatus = Field(..., description="执行状态：ok/error")
    latency: str = Field(default="", description="可读耗时（可能为空）")
    detail: str = Field(default="", description="一行摘要")
    input: Any = Field(default=None, description="事件输入（原始 data 子集）")
    output: Any = Field(default=None, description="事件输出（原始 data 子集）")


class LogList(BaseModel):
    """Body of GET /api/logs (rows + the applied filter context)."""

    model_config = ConfigDict(extra="forbid")

    items: list[LogRead] = Field(default_factory=list)
    total: int = Field(..., ge=0, description="投影过滤后的日志总数")
    limit: int = Field(..., ge=0, description="本次应用的 limit")


__all__ = ["LogRead", "LogList", "LogType", "LogLevel", "LogStatus"]
