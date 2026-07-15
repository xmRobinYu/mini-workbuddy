"""Tests for the built-in tool function implementations (US-007).

Covers all safety acceptance criteria:
- read_file / write_file path validation rejects traversal & out-of-bounds
- write_file 10 MB limit
- execute_command blocklist interception
- execute_command 60 s timeout termination
- execute_command working_dir confined to workspace/
- execute_command output truncation at 100 KB
- execute_command strips sensitive env vars from the child process
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.core.config import COMMAND_BLOCKLIST_FILE, WORKSPACE_DIR
from app.schemas.tool import SecurityBlockedError
from app.services import tool_functions


@pytest.fixture
def ws(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point WORKSPACE_DIR at an isolated tmp tree for filesystem tests."""
    ws = tmp_path / "workspace"
    (ws / "config").mkdir(parents=True)
    (ws / "memory").mkdir()
    monkeypatch.setattr("app.core.config.WORKSPACE_DIR", ws)
    monkeypatch.setattr("app.core.path_security.WORKSPACE_DIR", ws)
    monkeypatch.setattr("app.services.tool_functions.WORKSPACE_DIR", ws)
    return ws


# ── read_file ───────────────────────────────────────────────────────────────
def test_read_file_reads_workspace_content(ws: Path) -> None:
    (ws / "memory" / "note.md").write_text("hello world", encoding="utf-8")
    assert tool_functions.tool_read_file("memory/note.md") == "hello world"


def test_read_file_rejects_traversal(ws: Path) -> None:
    (ws.parent / "secret.txt").write_text("leaked", encoding="utf-8")
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_read_file("../secret.txt")


def test_read_file_rejects_absolute_outside(ws: Path, tmp_path: Path) -> None:
    outside = tmp_path / "etc_passwd"
    outside.write_text("leaked", encoding="utf-8")
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_read_file(str(outside))


def test_read_file_rejects_symlink_escape(ws: Path, tmp_path: Path) -> None:
    outside = tmp_path / "escape.txt"
    outside.write_text("leaked", encoding="utf-8")
    link = ws / "memory" / "link.md"
    os.symlink(outside, link)
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_read_file("memory/link.md")


def test_read_file_missing_file_blocked(ws: Path) -> None:
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_read_file("memory/does_not_exist.md")


# ── write_file ──────────────────────────────────────────────────────────────
def test_write_file_creates_nested_path(ws: Path) -> None:
    result = tool_functions.tool_write_file("memory/sub/deep.md", "content")
    assert (ws / "memory" / "sub" / "deep.md").read_text(encoding="utf-8") == "content"
    assert "已写入" in result


def test_write_file_rejects_traversal(ws: Path) -> None:
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_write_file("../../evil.txt", "x")


def test_write_file_enforces_10mb_limit(ws: Path) -> None:
    big = "a" * (tool_functions.WRITE_MAX_BYTES + 1)
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_write_file("memory/big.txt", big)


def test_write_file_allows_exactly_10mb(ws: Path) -> None:
    content = "a" * tool_functions.WRITE_MAX_BYTES
    tool_functions.tool_write_file("memory/max.txt", content)
    assert (ws / "memory" / "max.txt").stat().st_size == tool_functions.WRITE_MAX_BYTES


# ── execute_command: blocklist ──────────────────────────────────────────────
def test_execute_command_blocklist_intercepts(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        tool_functions,
        "load_command_blocklist",
        lambda: ["rm -rf", "curl"],
    )
    with pytest.raises(SecurityBlockedError) as exc:
        tool_functions.tool_execute_command("rm -rf /tmp/x")
    assert "黑名单" in exc.value.reason


def test_execute_command_blocklist_case_insensitive(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: ["curl"])
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_execute_command("CURL http://example.com")


def test_execute_command_safe_command_runs(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    out = tool_functions.tool_execute_command("echo hello-from-cmd")
    assert "hello-from-cmd" in out


# ── execute_command: timeout ────────────────────────────────────────────────
def test_execute_command_timeout_terminates(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    monkeypatch.setattr(tool_functions, "COMMAND_TIMEOUT_SECONDS", 1)
    with pytest.raises(SecurityBlockedError) as exc:
        tool_functions.tool_execute_command("sleep 10")
    assert "超时" in exc.value.reason


# ── execute_command: working_dir confinement ────────────────────────────────
def test_execute_command_working_dir_inside_workspace(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    (ws / "subdir").mkdir()
    out = tool_functions.tool_execute_command("pwd", working_dir="subdir")
    assert "subdir" in out


def test_execute_command_working_dir_traversal_rejected(
    ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_execute_command("echo x", working_dir="../")


# ── execute_command: output truncation ──────────────────────────────────────
def test_execute_command_output_truncated(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    # Generate ~1 MB of output; must be truncated to 100 KB.
    out = tool_functions.tool_execute_command("yes 'x' | head -c 1048576")
    encoded = out.encode("utf-8")
    # The prefix + truncated body + truncation notice must stay bounded.
    assert len(encoded) <= tool_functions.OUTPUT_MAX_BYTES + 200
    assert "截断" in out


# ── execute_command: env isolation ──────────────────────────────────────────
def test_execute_command_strips_sensitive_env(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_functions, "load_command_blocklist", lambda: [])
    monkeypatch.setenv("OPENAI_API_KEY", "sk-super-secret")
    monkeypatch.setenv("MINI_WORKBUDDY_API_KEY", "sk-secret-2")
    monkeypatch.setenv("MY_TOKEN", "tok-secret")
    monkeypatch.setenv("SAFE_VAR", "keep-me")

    out = tool_functions.tool_execute_command("env")
    assert "sk-super-secret" not in out
    assert "sk-secret-2" not in out
    assert "tok-secret" not in out
    assert "keep-me" in out


def test_execute_command_uses_real_blocklist_file(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """When no monkeypatch, load_command_blocklist reads the seeded file."""
    monkeypatch.setattr(
        COMMAND_BLOCKLIST_FILE.__class__, "exists", lambda self: True, raising=False
    )
    COMMAND_BLOCKLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    COMMAND_BLOCKLIST_FILE.write_text('["rm -rf"]', encoding="utf-8")
    with pytest.raises(SecurityBlockedError):
        tool_functions.tool_execute_command("rm -rf something")
