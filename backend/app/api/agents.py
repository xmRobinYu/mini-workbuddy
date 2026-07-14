"""Agent management CRUD API (US-009).

Endpoints:
- GET    /api/agents                list all configured Agents
- POST   /api/agents                create a new Agent (+ seed agent.md)
- GET    /api/agents/{id}           return a single Agent's full config
- PUT    /api/agents/{id}           replace an Agent's editable fields
- DELETE /api/agents/{id}           remove an Agent (default Agent cannot be deleted)
- GET    /api/agents/{id}/agent-md  return the agent.md file content
- PUT    /api/agents/{id}/agent-md  save the agent.md file content

The default 主 Agent is created automatically on startup and is immutable to
deletion; only one Agent ever carries ``is_default=True``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.schemas.agent import (
    AgentCreate,
    AgentMarkdownContent,
    AgentRead,
    AgentUpdate,
    validate_tool_names,
)
from app.services.agents_store import (
    add_agent,
    delete_agent,
    generate_id,
    get_agent,
    list_agents,
    read_agent_md,
    update_agent,
    write_agent_md,
)

router = APIRouter(prefix="/agents", tags=["agents"])


def _serialise(agent: dict[str, Any]) -> AgentRead:
    """Validate a stored dict through the read schema before returning it."""
    return AgentRead.model_validate(agent)


@router.get("", response_model=list[AgentRead])
async def list_agents_endpoint() -> list[AgentRead]:
    """Return all configured Agents from agents.json."""
    return [_serialise(a) for a in list_agents()]


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent_endpoint(payload: AgentCreate) -> AgentRead:
    """Create a new Agent and seed its agent.md file."""
    try:
        tools = validate_tool_names(payload.tools)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )

    from app.services.agents_store import now_iso

    agent_id = generate_id()
    timestamp = now_iso()
    stored = {
        "id": agent_id,
        "name": payload.name,
        "description": payload.description,
        "is_default": False,
        "model_id": payload.model_id,
        "tools": tools,
        "skills": list(payload.skills),
        "agent_md_path": "",  # filled in by add_agent
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    created = add_agent(stored)
    return _serialise(created)


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent_endpoint(agent_id: str) -> AgentRead:
    """Return a single Agent's full config (incl. tools & skills)."""
    agent = get_agent(agent_id)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    return _serialise(agent)


@router.put("/{agent_id}", response_model=AgentRead)
async def update_agent_endpoint(agent_id: str, payload: AgentUpdate) -> AgentRead:
    """Replace an Agent's editable fields (name/description/tools/skills/model_id)."""
    existing = get_agent(agent_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    try:
        tools = validate_tool_names(payload.tools)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )

    updates = {
        "name": payload.name,
        "description": payload.description,
        "model_id": payload.model_id,
        "tools": tools,
        "skills": list(payload.skills),
    }
    updated = update_agent(agent_id, updates)
    if updated is None:  # pragma: no cover - race with DELETE
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    return _serialise(updated)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_endpoint(agent_id: str) -> None:
    """Delete an Agent. The default Agent (is_default=true) cannot be deleted."""
    existing = get_agent(agent_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    if existing.get("is_default") is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="主 Agent（is_default=true）不可删除",
        )
    delete_agent(agent_id)


@router.get("/{agent_id}/agent-md", response_model=AgentMarkdownContent)
async def get_agent_md_endpoint(agent_id: str) -> AgentMarkdownContent:
    """Return the raw agent.md file content for an Agent."""
    if get_agent(agent_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    content = read_agent_md(agent_id)
    if content is None:
        content = ""
    return AgentMarkdownContent(content=content)


@router.put("/{agent_id}/agent-md", response_model=AgentMarkdownContent)
async def put_agent_md_endpoint(
    agent_id: str, payload: AgentMarkdownContent
) -> AgentMarkdownContent:
    """Save the raw agent.md file content for an Agent."""
    if get_agent(agent_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Agent 不存在"
        )
    write_agent_md(agent_id, payload.content)
    return AgentMarkdownContent(content=payload.content)


__all__ = ["router"]
