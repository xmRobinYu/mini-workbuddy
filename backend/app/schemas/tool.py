"""Pydantic schemas for the built-in tool management API (US-007).

The system ships exactly three built-in tools — ``read_file``,
``write_file`` and ``execute_command`` — that cannot be added or removed,
only enabled or disabled per tool. The schemas here describe the list/toggle
API surface consumed by the frontend tool-management page.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# The complete, fixed set of built-in tool names. Order is stable for display.
BUILTIN_TOOL_NAMES: tuple[str, ...] = (
    "read_file",
    "write_file",
    "execute_command",
)


class BuiltinTool(BaseModel):
    """A single built-in tool as returned by GET /api/tools."""

    name: str = Field(..., description="工具唯一标识，如 read_file")
    description: str = Field(..., description="工具功能描述")
    enabled: bool = Field(..., description="是否启用")


class ToolToggleRequest(BaseModel):
    """Request body for PUT /api/tools/{name}/toggle."""

    enabled: bool = Field(..., description="目标启用状态（true 启用 / false 禁用）")


class ToolToggleResponse(BaseModel):
    """Response body for PUT /api/tools/{name}/toggle."""

    name: str
    enabled: bool


# Sentinel returned to the caller (Agent loop) when a tool refuses to execute.
class SecurityBlockedError(Exception):
    """Raised by tool functions when a safety check rejects the operation.

    Carries a human-readable ``reason`` that is surfaced back to the Agent as
    a security-interception message instead of running the tool.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


ToolName = Literal["read_file", "write_file", "execute_command"]
