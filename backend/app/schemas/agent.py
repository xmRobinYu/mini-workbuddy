"""Pydantic schemas for the Agent management API (US-009).

An Agent is a named configuration bundling a model, the subset of built-in
tools it may use, the skills it has access to, and the path to its
``agent.md`` system-prompt file. Exactly one Agent carries ``is_default=True``
(the "主 Agent"); it is created automatically on startup and cannot be deleted.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.tool import BUILTIN_TOOL_NAMES


class AgentBase(BaseModel):
    """Shared editable fields for create/update/read payloads."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100, description="Agent 显示名称")
    description: str = Field(default="", max_length=500, description="Agent 描述")
    model_id: Optional[str] = Field(
        default=None, description="关联的模型 id（可为空，待用户配置）"
    )
    tools: list[str] = Field(
        default_factory=list,
        description="启用的内置工具名称列表（必须是内置工具名）",
    )
    skills: list[str] = Field(
        default_factory=list, description="启用的技能 id 列表"
    )


class AgentCreate(AgentBase):
    """Payload for POST /api/agents.

    ``is_default`` is accepted but rejected at the API layer for non-seed
    creation — only the startup seed may register the default Agent.
    """


class AgentUpdate(AgentBase):
    """Payload for PUT /api/agents/{id} (full replacement of editable fields).

    ``is_default`` and ``agent_md_path`` are never mutated via this payload.
    """


class AgentRead(AgentBase):
    """Serialised Agent as returned by GET and stored in agents.json."""

    id: str
    is_default: bool = Field(..., description="是否为主 Agent（不可删除）")
    agent_md_path: str = Field(..., description="agent.md 文件相对路径")
    created_at: str
    updated_at: str


class AgentMarkdownContent(BaseModel):
    """Request/response body for the agent.md content endpoints."""

    content: str = Field(..., description="agent.md 文件原始内容")


def validate_tool_names(tools: list[str]) -> list[str]:
    """Return the de-duplicated tool list, raising ValueError on unknown tools."""
    allowed = set(BUILTIN_TOOL_NAMES)
    cleaned: list[str] = []
    for name in tools:
        if name not in allowed:
            raise ValueError(f"未知工具：{name}（仅支持内置工具）")
        if name not in cleaned:
            cleaned.append(name)
    return cleaned


__all__ = [
    "AgentBase",
    "AgentCreate",
    "AgentUpdate",
    "AgentRead",
    "AgentMarkdownContent",
    "validate_tool_names",
]
