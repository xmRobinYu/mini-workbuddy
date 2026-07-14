"""Persistence for built-in tool enabled/disabled state (US-007).

The set of tools itself is fixed (see :data:`BUILTIN_TOOL_NAMES`); only the
per-tool ``enabled`` flag is mutable and persisted to
``workspace/config/tools.json`` under an exclusive file lock. Defaults are
seeded so all three built-in tools start enabled.
"""

from __future__ import annotations

import json
from pathlib import Path

from filelock import FileLock

from app.core.config import CONFIG_DIR, COMMAND_BLOCKLIST_FILE
from app.schemas.tool import BUILTIN_TOOL_NAMES

TOOLS_FILE = CONFIG_DIR / "tools.json"
LOCK_FILE = CONFIG_DIR / "tools.json.lock"

# Human-readable descriptions shown in the tool-management page.
TOOL_DESCRIPTIONS: dict[str, str] = {
    "read_file": "读取 workspace/ 内指定文件的内容",
    "write_file": "向 workspace/ 内指定文件写入或创建内容（单次 ≤ 10MB）",
    "execute_command": "在工作目录内执行命令行（受黑名单、超时与输出截断保护）",
}


def _ensure_file() -> None:
    """Seed tools.json with all built-in tools enabled if it is missing."""
    if not TOOLS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        _write_all({name: True for name in BUILTIN_TOOL_NAMES})


def _read_all() -> dict[str, bool]:
    _ensure_file()
    raw = TOOLS_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        return {}
    return {str(k): bool(v) for k, v in data.items() if isinstance(v, bool)}


def _write_all(states: dict[str, bool]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    TOOLS_FILE.write_text(
        json.dumps(states, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def list_tool_states() -> dict[str, bool]:
    """Return the persisted enabled-state for every built-in tool.

    Missing tools default to ``True`` (enabled) so new built-ins added later
    surface as enabled until an operator disables them.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        states = _read_all()
        return {name: states.get(name, True) for name in BUILTIN_TOOL_NAMES}


def is_tool_enabled(name: str) -> bool:
    """Return ``True`` when ``name`` is a built-in tool that is enabled."""
    if name not in BUILTIN_TOOL_NAMES:
        return False
    return list_tool_states().get(name, True)


def set_tool_enabled(name: str, enabled: bool) -> bool:
    """Persist the enabled flag for ``name``. Returns False if unknown tool."""
    if name not in BUILTIN_TOOL_NAMES:
        return False
    lock = FileLock(str(LOCK_FILE))
    with lock:
        states = _read_all()
        states[name] = bool(enabled)
        # Always normalise to the full built-in set so the file stays tidy.
        normalised = {n: states.get(n, True) for n in BUILTIN_TOOL_NAMES}
        _write_all(normalised)
        return True


def load_command_blocklist() -> list[str]:
    """Read the command blocklist from command_blocklist.json (seeded if absent)."""
    if not COMMAND_BLOCKLIST_FILE.exists():
        return []
    raw = COMMAND_BLOCKLIST_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if isinstance(item, str)]


def reset_for_test(tools_file: Path | None = None) -> None:
    """Test helper: wipe tools.json so each test starts from the seeded default."""
    target = tools_file or TOOLS_FILE
    if target.exists():
        target.write_text(
            json.dumps({n: True for n in BUILTIN_TOOL_NAMES}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    lock_path = target.with_suffix(".json.lock")
    if lock_path.exists():
        lock_path.unlink()
