"""JSON file persistence + agent.md management for Agent configs (US-009).

Agents are stored in ``workspace/config/agents.json`` under an exclusive file
lock (mirroring :mod:`models_store`). Each Agent owns a directory
``workspace/config/agents/{agent_id}/`` containing its ``agent.md`` system
prompt; the directory and a seed ``agent.md`` are created atomically with the
Agent record. The system ships exactly one default Agent ("主 Agent",
``is_default=True``) which is seeded on startup and cannot be deleted.
"""

from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from filelock import FileLock

from app.core.config import AGENTS_CONFIG_DIR, CONFIG_DIR
from app.schemas.tool import BUILTIN_TOOL_NAMES

logger = logging.getLogger(__name__)

AGENTS_FILE = CONFIG_DIR / "agents.json"
LOCK_FILE = CONFIG_DIR / "agents.json.lock"

DEFAULT_AGENT_ID = "main"
DEFAULT_AGENT_NAME = "主 Agent"
DEFAULT_AGENT_DESCRIPTION = "系统默认主 Agent，自动初始化。"

# Seed system prompt written to every new Agent's agent.md.
DEFAULT_AGENT_MD_TEMPLATE = """\
# {name}

你是 {name}。

{description}

## 工具
{tools}

## 技能
{skills}
"""


def _agent_dir(agent_id: str) -> Path:
    """Return the on-disk directory owned by ``agent_id``."""
    return AGENTS_CONFIG_DIR / agent_id


def agent_md_path(agent_id: str) -> str:
    """Return the relative agent.md path string stored on the Agent record."""
    return f"workspace/config/agents/{agent_id}/agent.md"


def _agent_md_abs(agent_id: str) -> Path:
    """Return the absolute path to an Agent's agent.md file."""
    return _agent_dir(agent_id) / "agent.md"


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def now_iso() -> str:
    """Public helper returning a fresh ISO-8601 UTC timestamp."""
    return _utcnow_iso()


# ── agents.json read/write ──────────────────────────────────────────────────


def _ensure_file() -> None:
    """Make sure agents.json exists before we try to read or lock it."""
    if not AGENTS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        AGENTS_FILE.write_text("[]", encoding="utf-8")


def _read_all() -> list[dict[str, Any]]:
    _ensure_file()
    raw = AGENTS_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _write_all(agents: list[dict[str, Any]]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    AGENTS_FILE.write_text(
        json.dumps(agents, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── agent.md file management ────────────────────────────────────────────────


def _render_default_md(name: str, description: str, tools: list[str], skills: list[str]) -> str:
    tools_line = ", ".join(tools) if tools else "（暂无）"
    skills_line = ", ".join(skills) if skills else "（暂无）"
    return DEFAULT_AGENT_MD_TEMPLATE.format(
        name=name,
        description=description or "",
        tools=tools_line,
        skills=skills_line,
    )


def _create_agent_md(agent_id: str, name: str, description: str, tools: list[str], skills: list[str]) -> str:
    """Create the Agent directory + seed agent.md. Returns the relative path."""
    directory = _agent_dir(agent_id)
    directory.mkdir(parents=True, exist_ok=True)
    md_file = _agent_md_abs(agent_id)
    if not md_file.exists():
        md_file.write_text(
            _render_default_md(name, description, tools, skills), encoding="utf-8"
        )
    return agent_md_path(agent_id)


def read_agent_md(agent_id: str) -> str | None:
    """Return the agent.md content, or ``None`` if the file is missing."""
    md_file = _agent_md_abs(agent_id)
    if not md_file.exists():
        return None
    return md_file.read_text(encoding="utf-8")


def write_agent_md(agent_id: str, content: str) -> None:
    """Overwrite the agent.md content (directory must already exist)."""
    directory = _agent_dir(agent_id)
    directory.mkdir(parents=True, exist_ok=True)
    _agent_md_abs(agent_id).write_text(content, encoding="utf-8")


# ── public CRUD ─────────────────────────────────────────────────────────────


def list_agents() -> list[dict[str, Any]]:
    """Return all stored Agent configs (lock-guarded read)."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        return _read_all()


def get_agent(agent_id: str) -> dict[str, Any] | None:
    """Return a single Agent dict by id, or ``None`` if not found."""
    for agent in list_agents():
        if agent.get("id") == agent_id:
            return agent
    return None


def get_default_agent() -> dict[str, Any] | None:
    """Return the default Agent dict, or ``None`` if none is flagged default."""
    for agent in list_agents():
        if agent.get("is_default") is True:
            return agent
    return None


def generate_id() -> str:
    """Generate a stable unique id for a new Agent config."""
    return str(uuid.uuid4())


def add_agent(agent: dict[str, Any]) -> dict[str, Any]:
    """Append a new Agent dict (caller supplies all fields incl. id/timestamps).

    Also materialises the Agent directory and seed agent.md.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        agents = _read_all()
        agent_id = agent["id"]
        agent_md = _create_agent_md(
            agent_id,
            agent.get("name", ""),
            agent.get("description", ""),
            agent.get("tools", []),
            agent.get("skills", []),
        )
        agent["agent_md_path"] = agent_md
        agents.append(agent)
        _write_all(agents)
        return agent


def update_agent(agent_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    """Replace editable fields on an existing Agent. Returns updated dict or None.

    ``is_default`` and ``agent_md_path`` are preserved and never overwritten
    here. The agent.md directory already exists from creation.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        agents = _read_all()
        for agent in agents:
            if agent.get("id") == agent_id:
                agent.update(updates)
                # Re-assert immutable fields.
                agent["agent_md_path"] = agent_md_path(agent_id)
                agent["updated_at"] = _utcnow_iso()
                _write_all(agents)
                return agent
        return None


def delete_agent(agent_id: str) -> bool:
    """Remove an Agent record and its on-disk directory.

    Returns True if a record was deleted. Does NOT delete the default Agent —
    the caller must guard ``is_default`` before calling.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        agents = _read_all()
        remaining = [a for a in agents if a.get("id") != agent_id]
        if len(remaining) == len(agents):
            return False
        _write_all(remaining)
    # Best-effort removal of the Agent's directory + agent.md.
    directory = _agent_dir(agent_id)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)
    return True


# ── startup seeding ─────────────────────────────────────────────────────────


def ensure_default_agent() -> None:
    """Seed the default 主 Agent on startup if no default exists."""
    if get_default_agent() is not None:
        return
    timestamp = _utcnow_iso()
    seed = {
        "id": DEFAULT_AGENT_ID,
        "name": DEFAULT_AGENT_NAME,
        "description": DEFAULT_AGENT_DESCRIPTION,
        "is_default": True,
        "model_id": None,
        "tools": list(BUILTIN_TOOL_NAMES),
        "skills": [],
        "agent_md_path": agent_md_path(DEFAULT_AGENT_ID),
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    lock = FileLock(str(LOCK_FILE))
    with lock:
        # Re-check under lock to avoid a duplicate seed race.
        agents = _read_all()
        if any(a.get("is_default") is True for a in agents):
            return
        _create_agent_md(
            DEFAULT_AGENT_ID,
            DEFAULT_AGENT_NAME,
            DEFAULT_AGENT_DESCRIPTION,
            list(BUILTIN_TOOL_NAMES),
            [],
        )
        agents.append(seed)
        _write_all(agents)


def reset_for_test(agents_file: Path | None = None) -> None:
    """Test helper: wipe agents.json (and the agents/ dir) for a clean slate."""
    target = agents_file or AGENTS_FILE
    if target.exists():
        target.write_text("[]", encoding="utf-8")
    lock_path = target.with_suffix(".json.lock")
    if lock_path.exists():
        lock_path.unlink()
    # Wipe per-Agent directories so tests start clean.
    if AGENTS_CONFIG_DIR.exists():
        shutil.rmtree(AGENTS_CONFIG_DIR, ignore_errors=True)
        AGENTS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


__all__ = [
    "AGENTS_FILE",
    "DEFAULT_AGENT_ID",
    "DEFAULT_AGENT_NAME",
    "DEFAULT_AGENT_DESCRIPTION",
    "list_agents",
    "get_agent",
    "get_default_agent",
    "generate_id",
    "add_agent",
    "update_agent",
    "delete_agent",
    "agent_md_path",
    "read_agent_md",
    "write_agent_md",
    "ensure_default_agent",
    "reset_for_test",
]
