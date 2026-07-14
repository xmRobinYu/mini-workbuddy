"""Tests for the path security helper (US-006).

Covers all acceptance criteria:
- uses pathlib.resolve()
- resolved path must be inside workspace/ (prefix check)
- rejects ``..`` traversal
- rejects symlink escape (os.path.islink)
- returns True inside workspace/, False otherwise
- normal path / ``..`` traversal / symlink escape / absolute out-of-bounds
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.core.path_security import is_safe_workspace_path


@pytest.fixture
def ws(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point WORKSPACE_DIR at an isolated tmp tree so symlink tests are safe.

    The real ``workspace/`` may be a non-existent or shared directory; mutating
    it (creating symlinks) in tests would be unsafe. We monkeypatch the module
    constant instead.
    """
    ws = tmp_path / "workspace"
    (ws / "config").mkdir(parents=True)
    (ws / "memory").mkdir()
    monkeypatch.setattr("app.core.path_security.WORKSPACE_DIR", ws)
    # workspace_root is derived at call time from WORKSPACE_DIR.resolve(), so
    # patching the constant is sufficient.
    return ws


def test_normal_relative_path_inside_workspace(ws: Path) -> None:
    """A simple relative path resolving inside workspace/ is accepted."""
    target = ws / "config" / "models.json"
    assert is_safe_workspace_path(target) is True


def test_normal_subdir_path_inside_workspace(ws: Path) -> None:
    """A nested file deep inside workspace/ is accepted."""
    (ws / "memory" / "notes").mkdir()
    target = ws / "memory" / "notes" / "session.md"
    assert is_safe_workspace_path(target) is True


def test_workspace_root_itself(ws: Path) -> None:
    """The workspace root resolves to itself and is inside workspace/."""
    assert is_safe_workspace_path(ws) is True


def test_dotdot_traversal_rejected(ws: Path) -> None:
    """A path containing ``..`` is rejected even if it resolves inside."""
    target = ws / "config" / ".." / "config" / "models.json"
    assert is_safe_workspace_path(target) is False


def test_dotdot_escape_to_outside_rejected(ws: Path) -> None:
    """``..`` traversal escaping workspace/ is rejected."""
    target = ws / "config" / ".." / ".." / ".." / "etc" / "passwd"
    assert is_safe_workspace_path(target) is False


def test_absolute_path_outside_workspace_rejected(ws: Path, tmp_path: Path) -> None:
    """An absolute path outside workspace/ is rejected."""
    outside = tmp_path / "outside.txt"
    assert is_safe_workspace_path(outside) is False


def test_absolute_system_path_rejected(ws: Path) -> None:
    """A system path clearly outside workspace/ is rejected."""
    assert is_safe_workspace_path("/etc/passwd") is False


def test_nonexistent_path_inside_workspace_accepted(ws: Path) -> None:
    """A path that does not exist yet but resolves inside workspace/ is OK."""
    target = ws / "memory" / "future" / "note.md"
    assert is_safe_workspace_path(target) is True


def test_symlink_escape_rejected(ws: Path, tmp_path: Path) -> None:
    """A symlink inside workspace/ pointing outside is rejected."""
    outside = tmp_path / "secret.txt"
    outside.write_text("leaked")
    link = ws / "config" / "escape.link"
    os.symlink(outside, link)
    assert is_safe_workspace_path(link) is False


def test_symlink_target_inside_workspace_accepted(ws: Path) -> None:
    """A symlink whose target stays inside workspace/ is allowed."""
    real_file = ws / "memory" / "real.md"
    real_file.write_text("ok")
    link = ws / "config" / "safe.link"
    os.symlink(real_file, link)
    assert is_safe_workspace_path(link) is True


def test_symlink_in_parent_component_escape_rejected(ws: Path, tmp_path: Path) -> None:
    """A symlink directory component that redirects outside is rejected."""
    outside_dir = tmp_path / "outside_dir"
    outside_dir.mkdir()
    (outside_dir / "passwd").write_text("leaked")
    link_dir = ws / "config" / "linkdir"
    os.symlink(outside_dir, link_dir)
    target = link_dir / "passwd"
    assert is_safe_workspace_path(target) is False


def test_string_input_accepted(ws: Path) -> None:
    """A plain string path is accepted just like a Path."""
    target = str(ws / "config" / "models.json")
    assert is_safe_workspace_path(target) is True


def test_relative_path_resolves_against_cwd_inside_workspace(
    ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A relative path resolved against cwd that lands in workspace/ is OK."""
    monkeypatch.chdir(ws)
    assert is_safe_workspace_path("config/models.json") is True
