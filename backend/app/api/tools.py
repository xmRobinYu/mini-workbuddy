"""Built-in tool management API (US-007).

Endpoints:
- GET  /api/tools                list the three built-in tools with enabled state
- PUT  /api/tools/{name}/toggle  enable or disable a single built-in tool

The tool set is fixed (read_file / write_file / execute_command); there is no
add or delete endpoint. Only the per-tool ``enabled`` flag is mutable.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.tool import (
    BUILTIN_TOOL_NAMES,
    BuiltinTool,
    ToolToggleRequest,
    ToolToggleResponse,
)
from app.services.tools_store import (
    TOOL_DESCRIPTIONS,
    list_tool_states,
    set_tool_enabled,
)

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[BuiltinTool])
async def list_tools_endpoint() -> list[BuiltinTool]:
    """Return the three built-in tools with their current enabled state."""
    states = list_tool_states()
    return [
        BuiltinTool(
            name=name,
            description=TOOL_DESCRIPTIONS.get(name, ""),
            enabled=states.get(name, True),
        )
        for name in BUILTIN_TOOL_NAMES
    ]


@router.put(
    "/{tool_name}/toggle",
    response_model=ToolToggleResponse,
)
async def toggle_tool_endpoint(
    tool_name: str, payload: ToolToggleRequest
) -> ToolToggleResponse:
    """Enable or disable a single built-in tool by name."""
    if tool_name not in BUILTIN_TOOL_NAMES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"工具不存在：{tool_name}（仅支持内置工具，不可新增或删除）",
        )
    ok = set_tool_enabled(tool_name, payload.enabled)
    if not ok:  # pragma: no cover - guarded by the membership check above
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"工具不存在：{tool_name}",
        )
    return ToolToggleResponse(name=tool_name, enabled=payload.enabled)


__all__ = ["router"]
