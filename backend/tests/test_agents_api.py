"""Tests for the Agent management CRUD API + agent.md management (US-009).

Covers all acceptance criteria:
- GET /api/agents returns the Agent list (incl. the seeded default 主 Agent)
- POST /api/agents creates an Agent and its agent.md file
- GET /api/agents/{id} returns the full config (tools, skills)
- PUT /api/agents/{id} updates name/description/tools/skills
- DELETE /api/agents/{id} deletes; the default Agent cannot be deleted (400)
- GET /api/agents/{id}/agent-md returns the agent.md content
- PUT /api/agents/{id}/agent-md saves the agent.md content
- Agent record shape: id, name, description, is_default, model_id, tools,
  skills, agent_md_path, created_at, updated_at
- The default 主 Agent is seeded automatically on startup
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.core.config import AGENTS_CONFIG_DIR
from app.main import create_app
from app.services import agents_store
from app.services.agents_store import AGENTS_FILE


def _reset_agents() -> None:
    """Ensure each test starts from a clean agents.json + agents/ dir."""
    AGENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    agents_store.reset_for_test()


def _seed_default(client: TestClient) -> dict:
    """Trigger startup seeding by hitting any endpoint (lifespan runs on first request)."""
    # TestClient lifespan runs on context entry; call GET to force it.
    client.get("/api/agents")
    default = agents_store.get_default_agent()
    assert default is not None, "default Agent should be seeded"
    return default


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "name": "代码助手",
        "description": "一个专注于写代码的 Agent",
        "model_id": None,
        "tools": ["read_file", "write_file"],
        "skills": ["skill-1"],
    }
    base.update(overrides)
    return base


# ── list + default seeding ─────────────────────────────────────────────────


def test_list_seeds_default_agent() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.get("/api/agents")
    assert resp.status_code == 200
    agents = resp.json()
    assert len(agents) == 1
    default = agents[0]
    assert default["name"] == "主 Agent"
    assert default["is_default"] is True


def test_agent_record_shape() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        default = _seed_default(client)
    assert set(default) >= {
        "id", "name", "description", "is_default", "model_id",
        "tools", "skills", "agent_md_path", "created_at", "updated_at",
    }
    assert default["agent_md_path"] == "workspace/config/agents/main/agent.md"


# ── create ─────────────────────────────────────────────────────────────────


def test_create_agent_creates_agent_md_file() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        resp = client.post("/api/agents", json=_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "代码助手"
    assert body["is_default"] is False
    assert body["tools"] == ["read_file", "write_file"]
    assert body["skills"] == ["skill-1"]
    # agent.md file exists on disk under the Agent's directory.
    md_abs = AGENTS_CONFIG_DIR / body["id"] / "agent.md"
    assert md_abs.exists()
    content = md_abs.read_text(encoding="utf-8")
    assert "代码助手" in content
    # The stored record points at the relative agent.md path.
    assert body["agent_md_path"] == f"workspace/config/agents/{body['id']}/agent.md"


def test_create_agent_appears_in_list() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        listed = client.get("/api/agents").json()
    ids = [a["id"] for a in listed]
    assert created["id"] in ids
    assert len(listed) == 2


def test_create_with_unknown_tool_rejected() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        resp = client.post("/api/agents", json=_payload(tools=["read_file", "hack_tool"]))
    assert resp.status_code == 400


# ── get ────────────────────────────────────────────────────────────────────


def test_get_agent_returns_full_config() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        resp = client.get(f"/api/agents/{created['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == created["id"]
    assert body["tools"] == ["read_file", "write_file"]
    assert body["skills"] == ["skill-1"]
    assert body["model_id"] is None


def test_get_nonexistent_returns_404() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.get("/api/agents/does-not-exist")
    assert resp.status_code == 404


# ── update ─────────────────────────────────────────────────────────────────


def test_update_agent_fields() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        resp = client.put(
            f"/api/agents/{created['id']}",
            json=_payload(
                name="文档助手",
                description="改写为文档 Agent",
                tools=["read_file", "execute_command"],
                skills=["skill-1", "skill-2"],
                model_id="model-xyz",
            ),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "文档助手"
    assert body["description"] == "改写为文档 Agent"
    assert body["tools"] == ["read_file", "execute_command"]
    assert body["skills"] == ["skill-1", "skill-2"]
    assert body["model_id"] == "model-xyz"
    assert body["is_default"] is False
    assert body["created_at"] == created["created_at"]
    assert body["updated_at"] >= created["updated_at"]


def test_update_preserves_is_default_and_agent_md_path() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        default = _seed_default(client)
        resp = client.put(
            f"/api/agents/{default['id']}",
            json=_payload(name="主 Agent", tools=["read_file"], skills=[]),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_default"] is True
    assert body["agent_md_path"] == "workspace/config/agents/main/agent.md"


def test_update_nonexistent_returns_404() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.put("/api/agents/missing", json=_payload())
    assert resp.status_code == 404


# ── delete ─────────────────────────────────────────────────────────────────


def test_delete_agent_removes_record_and_directory() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        agent_dir = AGENTS_CONFIG_DIR / created["id"]
        assert agent_dir.exists()
        resp = client.delete(f"/api/agents/{created['id']}")
    assert resp.status_code == 204
    assert not agent_dir.exists()
    # agents.json no longer lists it.
    stored = json.loads(AGENTS_FILE.read_text(encoding="utf-8"))
    assert all(a["id"] != created["id"] for a in stored)


def test_delete_default_agent_rejected() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        default = _seed_default(client)
        resp = client.delete(f"/api/agents/{default['id']}")
    assert resp.status_code == 400
    assert "主 Agent" in resp.json()["detail"] or "is_default" in resp.json()["detail"]


def test_delete_nonexistent_returns_404() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.delete("/api/agents/missing")
    assert resp.status_code == 404


# ── agent.md content endpoints ─────────────────────────────────────────────


def test_get_agent_md_returns_content() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        resp = client.get(f"/api/agents/{created['id']}/agent-md")
    assert resp.status_code == 200
    body = resp.json()
    assert "content" in body
    assert "代码助手" in body["content"]


def test_put_agent_md_saves_content() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        _seed_default(client)
        created = client.post("/api/agents", json=_payload()).json()
        new_content = "# 自定义提示词\n你是一个测试 Agent。"
        resp = client.put(
            f"/api/agents/{created['id']}/agent-md",
            json={"content": new_content},
        )
    assert resp.status_code == 200, resp.text
    # Persisted to disk.
    md_abs = AGENTS_CONFIG_DIR / created["id"] / "agent.md"
    assert md_abs.read_text(encoding="utf-8") == new_content
    # And readable via GET.
    with TestClient(create_app()) as client:
        got = client.get(f"/api/agents/{created['id']}/agent-md").json()
    assert got["content"] == new_content


def test_get_agent_md_nonexistent_returns_404() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.get("/api/agents/missing/agent-md")
    assert resp.status_code == 404


def test_put_agent_md_nonexistent_returns_404() -> None:
    _reset_agents()
    with TestClient(create_app()) as client:
        resp = client.put("/api/agents/missing/agent-md", json={"content": "x"})
    assert resp.status_code == 404


# ── startup seeding persistence ────────────────────────────────────────────


def test_default_agent_persisted_to_agents_json() -> None:
    _reset_agents()
    with TestClient(create_app()):
        pass
    raw = AGENTS_FILE.read_text(encoding="utf-8")
    assert "主 Agent" in raw
    stored = json.loads(raw)
    assert len(stored) == 1
    assert stored[0]["is_default"] is True
    assert stored[0]["id"] == "main"
