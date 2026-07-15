"""Persistence and keyword search for built-in Agent memory tools."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from filelock import FileLock

from app.core.config import MEMORY_DIR, WORKSPACE_DIR

LONG_TERM_MEMORY_FILE = WORKSPACE_DIR / "memory.md"
MEMORY_LOCK_FILE = WORKSPACE_DIR / "memory.lock"

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


__all__ = ["LONG_TERM_MEMORY_FILE", "save_memory", "search_memory"]
