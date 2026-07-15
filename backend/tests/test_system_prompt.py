"""Tests for dynamic Agent system-prompt assembly (US-018)."""

from __future__ import annotations

from pathlib import Path

from pytest import MonkeyPatch

from app.services import system_prompt


def test_build_system_prompt_includes_agent_memory_rules_and_output_path(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    memory_file = tmp_path / "memory.md"
    memory_file.write_text("用户偏好使用中文。", encoding="utf-8")
    monkeypatch.setattr(system_prompt, "MEMORY_FILE", memory_file)

    prompt = system_prompt.build_system_prompt("# Agent 指令", "conversation-123")

    assert "# Agent 指令" in prompt
    assert "# Long-term Memory\n用户偏好使用中文。" in prompt
    assert "save_memory" in prompt
    assert "search_memory" in prompt
    assert str(memory_file) in prompt
    assert str(system_prompt.CONVERSATIONS_DIR / "conversation-123" / "outputs") in prompt


def test_build_system_prompt_allows_missing_memory_file(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    memory_file = tmp_path / "missing-memory.md"
    monkeypatch.setattr(system_prompt, "MEMORY_FILE", memory_file)

    prompt = system_prompt.build_system_prompt("Agent", "conversation-123")

    assert "# Long-term Memory\n\n# Memory 使用规则" in prompt


def test_build_system_prompt_allows_empty_memory_file(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    memory_file = tmp_path / "memory.md"
    memory_file.touch()
    monkeypatch.setattr(system_prompt, "MEMORY_FILE", memory_file)

    prompt = system_prompt.build_system_prompt("Agent", "conversation-123")

    assert "# Long-term Memory\n\n# Memory 使用规则" in prompt
