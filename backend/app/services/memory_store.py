"""Persistence and keyword search for built-in Agent memory tools."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from filelock import FileLock

from app.core.config import MEMORY_ARCHIVE_DIR, MEMORY_DIR, WORKSPACE_DIR

LONG_TERM_MEMORY_FILE = WORKSPACE_DIR / "memory.md"
MEMORY_LOCK_FILE = WORKSPACE_DIR / "memory.lock"

# Long-term memory is capped at 50 KB per the PRD; oversized content is
# summarised/compressed by a later pass, but the API still rejects writes that
# would push the file past this hard ceiling.
LONG_TERM_MEMORY_MAX_BYTES = 50 * 1024

MemoryType = str


def _memory_file(memory_type: MemoryType) -> Path:
    if memory_type == "long_term":
        return LONG_TERM_MEMORY_FILE
    if memory_type == "short_term":
        return MEMORY_DIR / f"{date.today().isoformat()}.md"
    raise ValueError("记忆类型必须是 long_term 或 short_term")


def save_memory(memory_type: MemoryType, content: str) -> str:
    """Append a memory entry, creating its parent directory and file."""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("记忆内容不能为空")
    target = _memory_file(memory_type)
    with FileLock(str(MEMORY_LOCK_FILE)):
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as memory_file:
            if target.stat().st_size and not target.read_text(encoding="utf-8").endswith("\n"):
                memory_file.write("\n")
            memory_file.write(content.rstrip() + "\n")
    return f"记忆已保存到 {target}"


# ── read paths used by the memory management API (US-012) ──────────────────
#
# All access is confined to ``workspace/memory`` (short-term daily files) and
# ``workspace/memory.md`` (long-term). Files outside that tree are never
# touched.


def read_long_term_memory() -> str:
    """Return the full long-term memory file content (empty string if absent)."""
    with FileLock(str(MEMORY_LOCK_FILE)):
        if not LONG_TERM_MEMORY_FILE.is_file():
            return ""
        return LONG_TERM_MEMORY_FILE.read_text(encoding="utf-8")


def write_long_term_memory(content: str) -> str:
    """Replace the long-term memory file body in full.

    Raises ``ValueError`` if the new content exceeds the 50 KB hard ceiling
    (after normalising a single trailing newline).
    """
    if not isinstance(content, str):
        raise ValueError("记忆内容必须是字符串")
    normalised = content.replace("\r\n", "\n").replace("\r", "\n")
    if normalised and not normalised.endswith("\n"):
        normalised += "\n"
    encoded = normalised.encode("utf-8")
    if len(encoded) > LONG_TERM_MEMORY_MAX_BYTES:
        raise ValueError(
            f"长期记忆超过 {LONG_TERM_MEMORY_MAX_BYTES} 字节上限"
            f"（当前 {len(encoded)} 字节），请先压缩或删除部分内容"
        )
    with FileLock(str(MEMORY_LOCK_FILE)):
        LONG_TERM_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        LONG_TERM_MEMORY_FILE.write_text(normalised, encoding="utf-8")
    return f"长期记忆已更新（{len(encoded)} 字节）"


def list_short_term_files() -> list[Path]:
    """Return the short-term daily memory files, newest-first."""
    with FileLock(str(MEMORY_LOCK_FILE)):
        if not MEMORY_DIR.is_dir():
            return []
        return sorted(
            (p for p in MEMORY_DIR.glob("*.md") if p.is_file()),
            reverse=True,
        )


def read_short_term_file(path: Path) -> str:
    """Return the text of a short-term daily file (empty string if absent)."""
    with FileLock(str(MEMORY_LOCK_FILE)):
        if not path.is_file():
            return ""
        return path.read_text(encoding="utf-8")


def memory_stats() -> dict[str, int]:
    """Return aggregate stats for the memory dashboard.

    Long-term size is measured in bytes against the 50 KB ceiling; short-term
    reports the number of daily files plus the live (non-archive) entry total.
    """
    with FileLock(str(MEMORY_LOCK_FILE)):
        long_term_bytes = (
            LONG_TERM_MEMORY_FILE.stat().st_size
            if LONG_TERM_MEMORY_FILE.is_file()
            else 0
        )
        long_term_lines = (
            sum(
                1
                for line in LONG_TERM_MEMORY_FILE.read_text(encoding="utf-8").splitlines()
                if line.strip()
            )
            if LONG_TERM_MEMORY_FILE.is_file()
            else 0
        )
        short_term_files = list(MEMORY_DIR.glob("*.md")) if MEMORY_DIR.is_dir() else []
        short_term_items = 0
        for path in short_term_files:
            if not path.is_file():
                continue
            short_term_items += sum(
                1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip()
            )
        archive_files = (
            sum(1 for _ in MEMORY_ARCHIVE_DIR.rglob("*") if _.is_file())
            if MEMORY_ARCHIVE_DIR.is_dir()
            else 0
        )
    return {
        "long_term_bytes": long_term_bytes,
        "long_term_max_bytes": LONG_TERM_MEMORY_MAX_BYTES,
        "long_term_items": long_term_lines,
        "short_term_files": len(short_term_files),
        "short_term_items": short_term_items,
        "archived_items": archive_files,
    }


def _keywords(query: str) -> list[str]:
    return [word.casefold() for word in re.findall(r"\S+", query) if word.strip()]


def _matching_files(memory_type: MemoryType) -> list[tuple[str, Path]]:
    if memory_type == "long_term":
        return [("long_term", LONG_TERM_MEMORY_FILE)]
    if memory_type == "short_term":
        return [("short_term", path) for path in sorted(MEMORY_DIR.glob("*.md"))]
    if memory_type == "all":
        return _matching_files("long_term") + _matching_files("short_term")
    raise ValueError("记忆类型必须是 long_term、short_term 或 all")


def search_memory(query: str, memory_type: MemoryType = "all") -> str:
    """Return up to ten keyword-ranked memory lines with nearby context."""
    keywords = _keywords(query)
    if not keywords:
        raise ValueError("检索关键词不能为空")

    matches: list[tuple[int, str, int, str]] = []
    with FileLock(str(MEMORY_LOCK_FILE)):
        for label, path in _matching_files(memory_type):
            if not path.is_file():
                continue
            lines = path.read_text(encoding="utf-8").splitlines()
            for index, line in enumerate(lines):
                folded = line.casefold()
                score = sum(folded.count(keyword) for keyword in keywords)
                if not score:
                    continue
                context = lines[max(0, index - 1) : min(len(lines), index + 2)]
                snippet = "\n".join(context)
                matches.append((score, label, index + 1, f"{path}:{index + 1}\n{snippet}"))

    matches.sort(key=lambda item: (-item[0], item[1], item[2]))
    if not matches:
        return "未找到相关记忆。"
    return "\n\n".join(
        f"[{label}，相关度 {score}]\n{snippet}"
        for score, label, _line_number, snippet in matches[:10]
    )


__all__ = [
    "LONG_TERM_MEMORY_FILE",
    "LONG_TERM_MEMORY_MAX_BYTES",
    "save_memory",
    "search_memory",
    "read_long_term_memory",
    "write_long_term_memory",
    "list_short_term_files",
    "read_short_term_file",
    "memory_stats",
]
