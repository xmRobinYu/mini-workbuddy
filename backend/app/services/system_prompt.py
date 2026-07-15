"""Dynamic system-prompt assembly for Agent model requests."""

from __future__ import annotations

from pathlib import Path

from app.core.config import CONVERSATIONS_DIR, WORKSPACE_DIR

MEMORY_FILE = WORKSPACE_DIR / "memory.md"


def _read_long_term_memory() -> str:
    """Read long-term memory, creating an empty file when it is missing."""
    if not MEMORY_FILE.exists():
        MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        MEMORY_FILE.touch()
        return ""
    return MEMORY_FILE.read_text(encoding="utf-8")


def build_system_prompt(agent_md: str, conversation_id: str) -> str:
    """Combine Agent instructions, memory rules, and workspace paths."""
    memory = _read_long_term_memory()
    outputs_dir = CONVERSATIONS_DIR / conversation_id / "outputs"
    memory_section = "# Long-term Memory"
    if memory:
        memory_section += f"\n{memory}"
    return f"""{agent_md}

{memory_section}

# Memory 使用规则
- 当需要长期保留跨会话、跨 Agent 的事实、偏好、约定或结论时，调用 `save_memory`，并使用 `long_term` 类型。
- 当需要查找已有记忆、确认历史约定或避免重复询问时，先调用 `search_memory`；仅在当前任务确实需要相关信息时检索。
- 写入记忆应简洁、准确、可复用，避免保存临时过程、敏感信息、重复内容或未经确认的推测。长期记忆写入 `{MEMORY_FILE}`。
- 检索时使用明确的关键词；根据结果相关度选择信息，不要把无关记忆当作当前事实。

# 文件写入路径说明
通过 `write_file` 生成的交付文件必须写入当前会话的输出目录：`{outputs_dir}`。
"""


__all__ = ["MEMORY_FILE", "build_system_prompt"]
