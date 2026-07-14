#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PRD_FILE = SCRIPT_DIR / "prd.json"
DEFAULT_WORKDIR = SCRIPT_DIR.parent.parent


def _resolve_path(raw: str | None, *, base: Path | None = None) -> Path | None:
    if not raw:
        return None
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (base or Path.cwd()) / path
    return path.resolve()


def get_prd_file() -> Path:
    return _resolve_path(os.environ.get("RALPH_PRD_FILE"), base=Path.cwd()) or DEFAULT_PRD_FILE


def get_workdir() -> Path:
    return _resolve_path(os.environ.get("RALPH_WORKDIR"), base=Path.cwd()) or DEFAULT_WORKDIR


def get_state_dir(prd_file: Path | None = None) -> Path:
    return (prd_file or get_prd_file()).resolve().parent


def get_runtime_prd_file(prd_file: Path | None = None) -> Path:
    override = _resolve_path(os.environ.get("RALPH_RUNTIME_PRD_FILE"), base=Path.cwd())
    if override is not None:
        return override
    return get_state_dir(prd_file) / "prd.runtime.json"


def get_state_db_file(prd_file: Path | None = None) -> Path:
    override = _resolve_path(os.environ.get("RALPH_STATE_DB_FILE"), base=Path.cwd())
    if override is not None:
        return override
    return get_state_dir(prd_file) / "ralph_state.db"


def get_progress_file(prd_file: Path | None = None) -> Path:
    override = _resolve_path(os.environ.get("RALPH_PROGRESS_FILE"), base=Path.cwd())
    if override is not None:
        return override
    return get_state_dir(prd_file) / "progress.txt"


def apply_job_file(job_file: str | Path) -> dict:
    job_path = _resolve_path(str(job_file), base=Path.cwd())
    if job_path is None:
        raise ValueError("job_file is required")
    data = json.loads(job_path.read_text(encoding="utf-8"))
    base = job_path.parent

    prd_file = _resolve_path(data.get("prdFile"), base=base)
    workdir = _resolve_path(data.get("workdir"), base=base)
    runtime_prd = _resolve_path(data.get("runtimePrd"), base=base)
    state_db = _resolve_path(data.get("stateDb"), base=base)
    progress_file = _resolve_path(data.get("progressFile"), base=base)

    if prd_file is not None:
        os.environ["RALPH_PRD_FILE"] = str(prd_file)
    if workdir is not None:
        os.environ["RALPH_WORKDIR"] = str(workdir)
    if runtime_prd is not None:
        os.environ["RALPH_RUNTIME_PRD_FILE"] = str(runtime_prd)
    if state_db is not None:
        os.environ["RALPH_STATE_DB_FILE"] = str(state_db)
    if progress_file is not None:
        os.environ["RALPH_PROGRESS_FILE"] = str(progress_file)
    if data.get("agent"):
        os.environ["RALPH_AGENT_NAME"] = str(data["agent"])
    if data.get("model"):
        os.environ["RALPH_MODEL_NAME"] = str(data["model"])

    return {
        "jobFile": str(job_path),
        "prdFile": str(prd_file) if prd_file else None,
        "workdir": str(workdir) if workdir else None,
        "runtimePrd": str(runtime_prd) if runtime_prd else None,
        "stateDb": str(state_db) if state_db else None,
        "progressFile": str(progress_file) if progress_file else None,
        "agent": data.get("agent"),
        "model": data.get("model"),
    }
