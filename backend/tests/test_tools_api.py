"""Tests for the built-in tool management API (US-007).

Covers all acceptance criteria:
- GET /api/tools returns read_file, write_file, execute_command with
  name/description/enabled
- PUT /api/tools/{name}/toggle flips enabled state
- no add/delete endpoints (404 for unknown tool, PUT only on built-ins)
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.core.config import TOOLS_FILE
from app.main import create_app
from app.services import tools_store


def _reset_tools_file() -> None:
    """Ensure each test starts from the seeded default (all enabled)."""
    TOOLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tools_store.reset_for_test()


def test_list_returns_three_builtin_tools() -> None:
    _reset_tools_file()
    client = TestClient(create_app())
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    tools = resp.json()
    names = [t["name"] for t in tools]
    assert names == ["read_file", "write_file", "execute_command"]
    for tool in tools:
        assert set(tool.keys()) == {"name", "description", "enabled"}
        assert tool["description"]
        assert tool["enabled"] is True


def test_toggle_disables_then_re_enables() -> None:
    _reset_tools_file()
    client = TestClient(create_app())

    resp = client.put("/api/tools/execute_command/toggle", json={"enabled": False})
    assert resp.status_code == 200
    assert resp.json() == {"name": "execute_command", "enabled": False}

    listed = client.get("/api/tools").json()
    cmd = next(t for t in listed if t["name"] == "execute_command")
    assert cmd["enabled"] is False
    # other tools untouched
    rf = next(t for t in listed if t["name"] == "read_file")
    assert rf["enabled"] is True

    resp = client.put("/api/tools/execute_command/toggle", json={"enabled": True})
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True


def test_toggle_unknown_tool_returns_404() -> None:
    _reset_tools_file()
    client = TestClient(create_app())
    resp = client.put("/api/tools/save_memory/toggle", json={"enabled": False})
    assert resp.status_code == 404


def test_toggle_missing_body_returns_422() -> None:
    _reset_tools_file()
    client = TestClient(create_app())
    resp = client.put("/api/tools/read_file/toggle", json={})
    assert resp.status_code == 422


def test_no_create_or_delete_endpoints() -> None:
    """The tool set is fixed: POST is not supported and DELETE is not a route."""
    _reset_tools_file()
    client = TestClient(create_app())
    assert client.post("/api/tools", json={"name": "x"}).status_code == 405
    # No DELETE route exists; FastAPI returns 404 for the unmatched path.
    assert client.delete("/api/tools/read_file").status_code == 404


def test_toggle_persists_to_tools_json() -> None:
    _reset_tools_file()
    client = TestClient(create_app())
    client.put("/api/tools/write_file/toggle", json={"enabled": False})
    data = json.loads(TOOLS_FILE.read_text(encoding="utf-8"))
    assert data["write_file"] is False
    assert data["read_file"] is True
