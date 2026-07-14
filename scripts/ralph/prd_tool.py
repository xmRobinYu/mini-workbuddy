#!/usr/bin/env python3
"""
prd_tool.py
-----------
PRD 查询与状态更新工具（CLI + Python API）。
供 Ralph 主循环、Developer Agent、Validator Agent 使用。

CLI 用法：
    python prd_tool.py [--prd-file <path>] [--state-db <path>] [--runtime-prd <path>] \
        get-work-package <STORY_ID>
    python prd_tool.py [--prd-file <path>] [--state-db <path>] [--runtime-prd <path>] \
        get-story <STORY_ID>
    python prd_tool.py [--prd-file <path>] [--state-db <path>] [--runtime-prd <path>] \
        update-story <STORY_ID> --set <field>=<value> [--set <field>=<value> ...]
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import config
import state_store

SCRIPT_DIR = Path(__file__).resolve().parent

PRD_FILE: Path = config.get_prd_file()
STATE_DB_FILE: Path = config.get_state_db_file(PRD_FILE)
RUNTIME_PRD_FILE: Path = config.get_runtime_prd_file(PRD_FILE)
PROGRESS_FILE: Path = config.get_progress_file(PRD_FILE)

MUTABLE_FIELDS = {"passes", "blocked", "notes", "retryCount", "workflowMode"}
VALID_WORKFLOW_MODES = {"develop_only", "validate_only", "develop_and_validate"}

_STRING_TRUE = {"true", "1", "yes", "on"}
_STRING_FALSE = {"false", "0", "no", "off", ""}


class PrdToolError(RuntimeError):
    pass


def _resolve_paths(
    *,
    path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> tuple[Path, Path, Path]:
    prd = path or PRD_FILE
    db = db_path or config.get_state_db_file(prd)
    runtime = runtime_prd_path or config.get_runtime_prd_file(prd)
    return prd, db, runtime


def _coerce_value(field: str, raw: str) -> Any:
    if field in {"passes", "blocked"}:
        low = raw.strip().lower()
        if low in _STRING_TRUE:
            return True
        if low in _STRING_FALSE:
            return False
        raise PrdToolError(f"field '{field}' expects a boolean value, got: {raw}")
    if field == "retryCount":
        try:
            return int(raw)
        except ValueError:
            raise PrdToolError(f"field 'retryCount' expects an integer, got: {raw}")
    if field == "workflowMode":
        mode = raw.strip()
        if mode not in VALID_WORKFLOW_MODES:
            raise PrdToolError(
                f"invalid workflowMode '{mode}', must be one of: {', '.join(sorted(VALID_WORKFLOW_MODES))}"
            )
        return mode
    return raw


def _check_env_scope(story_id: str, *, enforce_env_scope: bool = True) -> None:
    if not enforce_env_scope:
        return
    env_story = os.environ.get("RALPH_STORY_ID")
    if env_story and env_story != story_id:
        raise PrdToolError(
            f"scope violation: RALPH_STORY_ID='{env_story}' but tried to update '{story_id}'"
        )


def update_story_fields(
    story_id: str,
    updates: dict[str, Any],
    *,
    path: Path | None = None,
    enforce_env_scope: bool = True,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    """
    更新指定 story 的运行态字段。
    仅允许更新 MUTABLE_FIELDS 中的字段。
    """
    if not updates:
        raise PrdToolError("no updates provided")

    illegal = sorted(set(updates) - MUTABLE_FIELDS)
    if illegal:
        raise PrdToolError(f"field(s) not mutable: {', '.join(illegal)}")

    if "workflowMode" in updates:
        mode = str(updates["workflowMode"]).strip()
        if mode not in VALID_WORKFLOW_MODES:
            raise PrdToolError(
                f"invalid workflowMode '{mode}', must be one of: {', '.join(sorted(VALID_WORKFLOW_MODES))}"
            )

    _check_env_scope(story_id, enforce_env_scope=enforce_env_scope)

    _prd, db, runtime = _resolve_paths(
        path=path, db_path=db_path, runtime_prd_path=runtime_prd_path
    )

    return state_store.update_story_fields(
        story_id,
        updates,
        prd_path=_prd,
        db_path=db,
        runtime_prd_path=runtime,
    )


def get_story(
    story_id: str,
    *,
    path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
) -> dict[str, Any]:
    """获取单个 story 的运行态信息。"""
    _prd, db, _runtime = _resolve_paths(
        path=path, db_path=db_path, runtime_prd_path=runtime_prd_path
    )
    return state_store.get_story(story_id, prd_path=_prd, db_path=db)


def _read_progress_patterns(progress_path: Path | None = None) -> list[str]:
    target = progress_path or PROGRESS_FILE
    if not target.exists():
        return []
    content = target.read_text(encoding="utf-8")
    patterns: list[str] = []
    in_patterns = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("## Codebase Patterns"):
            in_patterns = True
            continue
        if in_patterns:
            if stripped.startswith("## "):
                break
            if stripped.startswith("- "):
                patterns.append(stripped[2:].strip())
    return patterns


def get_work_package(
    story_id: str,
    *,
    path: Path | None = None,
    db_path: Path | None = None,
    runtime_prd_path: Path | None = None,
    progress_path: Path | None = None,
) -> dict[str, Any]:
    """
    获取 story 的完整工作包，包含：
    - story 详情
    - 队列上下文（当前索引、总数、剩余未完成数）
    - 进度上下文（Codebase Patterns）
    - branchName
    """
    _prd, db, _runtime = _resolve_paths(
        path=path, db_path=db_path, runtime_prd_path=runtime_prd_path
    )
    prd = state_store.load_runtime_prd(prd_path=_prd, db_path=db)
    stories = prd.get("userStories", [])

    target_story: dict[str, Any] | None = None
    current_index = -1
    for i, s in enumerate(stories):
        if s.get("id") == story_id:
            target_story = s
            current_index = i
            break

    if target_story is None:
        raise PrdToolError(f"story not found: {story_id}")

    remaining_open = sum(
        1
        for s in stories
        if not s.get("passes", False) and not s.get("blocked", False)
    )

    patterns = _read_progress_patterns(progress_path)

    return {
        "story": target_story,
        "queue": {
            "currentIndex": current_index,
            "totalCount": len(stories),
            "remainingOpenCount": remaining_open,
        },
        "progressContext": {
            "codebasePatterns": patterns,
        },
        "branchName": prd.get("branchName", ""),
        "project": prd.get("project", ""),
    }


def _print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _parse_set_args(set_args: list[str]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for item in set_args:
        if "=" not in item:
            raise PrdToolError(f"invalid --set value (expected field=value): {item}")
        field, raw = item.split("=", 1)
        field = field.strip()
        if field not in MUTABLE_FIELDS:
            raise PrdToolError(f"field not mutable: {field}")
        updates[field] = _coerce_value(field, raw)
    return updates


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    # Parse global options
    prd_file: Path | None = None
    state_db: Path | None = None
    runtime_prd: Path | None = None

    remaining: list[str] = []
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("--prd-file", "--prd"):
            i += 1
            if i >= len(argv):
                print("error: --prd-file requires a value", file=sys.stderr)
                return 1
            prd_file = Path(argv[i])
        elif arg == "--state-db":
            i += 1
            if i >= len(argv):
                print("error: --state-db requires a value", file=sys.stderr)
                return 1
            state_db = Path(argv[i])
        elif arg == "--runtime-prd":
            i += 1
            if i >= len(argv):
                print("error: --runtime-prd requires a value", file=sys.stderr)
                return 1
            runtime_prd = Path(argv[i])
        else:
            remaining.append(arg)
        i += 1

    if not remaining:
        print(
            "usage: prd_tool.py [--prd-file <path>] [--state-db <path>] [--runtime-prd <path>] "
            "<command> [args]\n"
            "commands:\n"
            "  get-work-package <STORY_ID>\n"
            "  get-story <STORY_ID>\n"
            "  update-story <STORY_ID> --set <field>=<value> [--set ...]",
            file=sys.stderr,
        )
        return 1

    command = remaining[0]
    cmd_args = remaining[1:]

    global PRD_FILE, STATE_DB_FILE, RUNTIME_PRD_FILE, PROGRESS_FILE
    if prd_file:
        PRD_FILE = prd_file.resolve()
        STATE_DB_FILE = config.get_state_db_file(PRD_FILE)
        RUNTIME_PRD_FILE = config.get_runtime_prd_file(PRD_FILE)
        PROGRESS_FILE = config.get_progress_file(PRD_FILE)

    try:
        if command == "get-story":
            if not cmd_args:
                print("error: get-story requires a STORY_ID", file=sys.stderr)
                return 1
            story_id = cmd_args[0]
            story = get_story(
                story_id,
                path=prd_file,
                db_path=state_db,
                runtime_prd_path=runtime_prd,
            )
            _print_json(story)
            return 0

        elif command == "get-work-package":
            if not cmd_args:
                print("error: get-work-package requires a STORY_ID", file=sys.stderr)
                return 1
            story_id = cmd_args[0]
            wp = get_work_package(
                story_id,
                path=prd_file,
                db_path=state_db,
                runtime_prd_path=runtime_prd,
            )
            _print_json(wp)
            return 0

        elif command == "update-story":
            if not cmd_args:
                print("error: update-story requires a STORY_ID", file=sys.stderr)
                return 1
            story_id = cmd_args[0]
            set_values: list[str] = []
            j = 0
            while j < len(cmd_args[1:]):
                sub = cmd_args[1:][j]
                if sub == "--set":
                    j += 1
                    if j >= len(cmd_args[1:]):
                        print("error: --set requires a value", file=sys.stderr)
                        return 1
                    set_values.append(cmd_args[1:][j])
                elif sub.startswith("--set="):
                    set_values.append(sub[len("--set="):])
                else:
                    j += 1
                    continue
                j += 1

            if not set_values:
                print("error: update-story requires at least one --set field=value", file=sys.stderr)
                return 1

            updates = _parse_set_args(set_values)
            updated = update_story_fields(
                story_id,
                updates,
                path=prd_file,
                db_path=state_db,
                runtime_prd_path=runtime_prd,
            )
            _print_json(updated)
            return 0

        else:
            print(f"error: unknown command '{command}'", file=sys.stderr)
            return 1

    except PrdToolError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
