"""Tests for the built-in long- and short-term memory persistence."""

from __future__ import annotations

from pathlib import Path

from pytest import MonkeyPatch, raises

from app.services import memory_store


def _patch_memory_paths(monkeypatch: MonkeyPatch, tmp_path: Path) -> tuple[Path, Path]:
    memory_dir = tmp_path / "memory"
    long_term_file = tmp_path / "memory.md"
    monkeypatch.setattr(memory_store, "MEMORY_DIR", memory_dir)
    monkeypatch.setattr(memory_store, "LONG_TERM_MEMORY_FILE", long_term_file)
    monkeypatch.setattr(memory_store, "MEMORY_LOCK_FILE", tmp_path / "memory.lock")
    return long_term_file, memory_dir


def test_save_memory_appends_long_and_short_term_entries(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)

    memory_store.save_memory("long_term", "偏好使用中文")
    memory_store.save_memory("long_term", "项目名称是 WorkBuddy")
    memory_store.save_memory("short_term", "今天完成记忆工具")

    assert long_term_file.read_text(encoding="utf-8") == "偏好使用中文\n项目名称是 WorkBuddy\n"
    short_term_files = list(memory_dir.glob("*.md"))
    assert len(short_term_files) == 1
    assert short_term_files[0].read_text(encoding="utf-8") == "今天完成记忆工具\n"


def test_search_memory_ranks_matches_and_limits_to_ten(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)
    long_term_file.write_text(
        "alpha beta\nalpha\n" + "\n".join("alpha" for _ in range(11)),
        encoding="utf-8",
    )
    memory_dir.mkdir()
    (memory_dir / "2026-07-16.md").write_text("beta only", encoding="utf-8")

    result = memory_store.search_memory("alpha beta")

    assert result.split("\n\n")[0].startswith("[long_term，相关度 2]")
    assert result.count("[long_term，相关度") == 10


def test_search_memory_filters_types_and_validates_input(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    long_term_file, memory_dir = _patch_memory_paths(monkeypatch, tmp_path)
    long_term_file.write_text("长期项目约定", encoding="utf-8")
    memory_dir.mkdir()
    (memory_dir / "2026-07-16.md").write_text("短期项目记录", encoding="utf-8")

    assert "长期项目约定" in memory_store.search_memory("项目", "long_term")
    assert "短期项目记录" in memory_store.search_memory("项目", "short_term")
    with raises(ValueError, match="检索关键词不能为空"):
        memory_store.search_memory(" ")
    with raises(ValueError, match="记忆类型"):
        memory_store.save_memory("other", "内容")
