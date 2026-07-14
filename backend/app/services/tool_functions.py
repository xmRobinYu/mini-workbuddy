"""Built-in tool function implementations (US-007).

Three tools an Agent can invoke:

- :func:`tool_read_file`   — read a file inside ``workspace/``
- :func:`tool_write_file`  — write a file inside ``workspace/`` (≤ 10 MB)
- :func:`tool_execute_command` — run a shell command with blocklist, timeout,
  working-directory confinement, output truncation and env isolation

Every path-bearing tool funnels user input through
:func:`is_safe_workspace_path` first; violations raise
:class:`SecurityBlockedError` so the Agent loop surfaces a security message
instead of executing the operation.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from app.core.config import WORKSPACE_DIR
from app.core.path_security import is_safe_workspace_path
from app.schemas.tool import SecurityBlockedError
from app.services.tools_store import load_command_blocklist

# ── Limits ──────────────────────────────────────────────────────────────────
WRITE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB per write_file call
COMMAND_TIMEOUT_SECONDS = 60  # kill subprocess after this many seconds
OUTPUT_MAX_BYTES = 100 * 1024  # 100 KB truncated stdout+stderr

# Environment variables stripped from the subprocess so API keys and other
# secrets never leak into spawned commands. Keys are matched case-insensitively
# against the stripped names plus a generic prefix list.
SENSITIVE_ENV_KEYS = (
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
    "ANTHROPIC_API_KEY",
    "API_KEY",
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "CREDENTIAL",
)
SENSITIVE_ENV_PREFIXES = (
    "MINI_WORKBUDDY_",
    "_API_KEY",
    "_TOKEN",
    "_SECRET",
)


def _strip_sensitive_env(env: dict[str, str]) -> dict[str, str]:
    """Return a copy of ``env`` with secret-bearing keys removed."""
    cleaned: dict[str, str] = {}
    for key, value in env.items():
        upper = key.upper()
        if upper in SENSITIVE_ENV_KEYS:
            continue
        if any(upper.startswith(prefix) or upper.endswith(prefix) for prefix in SENSITIVE_ENV_PREFIXES):
            continue
        cleaned[key] = value
    return cleaned


def _resolve_workspace_path(path: str) -> Path:
    """Resolve ``path`` against ``workspace/`` and assert it stays inside.

    Relative paths are anchored at ``workspace/``. Raises
    :class:`SecurityBlockedError` on any traversal or symlink escape.
    """
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = WORKSPACE_DIR / candidate
    if not is_safe_workspace_path(candidate):
        raise SecurityBlockedError(
            f"路径校验失败：拒绝越界路径 {path}（必须在 workspace/ 内且无符号链接逃逸）"
        )
    return candidate.resolve(strict=False)


# ── read_file ───────────────────────────────────────────────────────────────
def tool_read_file(path: str) -> str:
    """Read and return the UTF-8 text content of a workspace file."""
    target = _resolve_workspace_path(path)
    if not target.exists():
        raise SecurityBlockedError(f"路径校验失败：文件不存在 {path}")
    if target.is_dir():
        raise SecurityBlockedError(f"路径校验失败：目标是一个目录 {path}")
    return target.read_text(encoding="utf-8")


# ── write_file ──────────────────────────────────────────────────────────────
def tool_write_file(path: str, content: str) -> str:
    """Write ``content`` to a workspace file, enforcing the 10 MB ceiling."""
    if len(content.encode("utf-8")) > WRITE_MAX_BYTES:
        raise SecurityBlockedError(
            f"写入大小超过限制：单次写入最大 {WRITE_MAX_BYTES} 字节"
        )
    target = _resolve_workspace_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"已写入 {len(content)} 字符到 {path}"


# ── execute_command ─────────────────────────────────────────────────────────
def _matches_blocklist(command: str, blocklist: list[str]) -> str | None:
    """Return the matched blocklist entry, or ``None`` if the command is clean."""
    lowered = command.lower()
    for entry in blocklist:
        if not entry:
            continue
        if entry.lower() in lowered:
            return entry
    return None


def tool_execute_command(command: str, working_dir: str | None = None) -> str:
    """Execute ``command`` under workspace confinement with safety guards.

    Safety guards enforced:
    - command blocklist (substring match, case-insensitive)
    - 60 s timeout → SIGKILL the subprocess
    - ``working_dir`` confined to ``workspace/``
    - stdout+stderr truncated to 100 KB
    - sensitive env vars stripped from the child process
    """
    blocklist = load_command_blocklist()
    matched = _matches_blocklist(command, blocklist)
    if matched is not None:
        raise SecurityBlockedError(
            f"命令被安全黑名单拦截：匹配规则 “{matched}”，已拒绝执行"
        )

    cwd: Path
    if working_dir:
        cwd = _resolve_workspace_path(working_dir)
        if not cwd.exists():
            raise SecurityBlockedError(f"路径校验失败：工作目录不存在 {working_dir}")
        if not cwd.is_dir():
            raise SecurityBlockedError(f"路径校验失败：工作目录不是目录 {working_dir}")
    else:
        cwd = WORKSPACE_DIR
        if not cwd.exists():
            cwd.mkdir(parents=True, exist_ok=True)

    # Start from a clean copy of the parent env, then strip secrets.
    clean_env = _strip_sensitive_env(dict(os.environ))

    try:
        completed = subprocess.run(
            command,
            shell=True,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=clean_env,
        )
    except subprocess.TimeoutExpired as exc:
        raise SecurityBlockedError(
            f"命令执行超时：超过 {COMMAND_TIMEOUT_SECONDS} 秒已被强制终止"
        ) from exc

    combined = completed.stdout
    if completed.stderr:
        combined = (combined or "") + ("\n[stderr]\n" + completed.stderr)
    combined = combined or ""

    encoded = combined.encode("utf-8")
    if len(encoded) > OUTPUT_MAX_BYTES:
        combined = encoded[:OUTPUT_MAX_BYTES].decode("utf-8", errors="ignore")
        combined += f"\n...[输出已截断，仅保留前 {OUTPUT_MAX_BYTES} 字节]"

    prefix = f"[exit {completed.returncode}] "
    return prefix + combined
