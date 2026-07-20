"""Persistence + filesystem management for Skill packages (US-009).

A Skill is a directory under ``workspace/config/skills/{slug}/`` containing a
``SKILL.md`` definition (and optional resource files). The registry
``workspace/config/skills.json`` records metadata (id, name, slug, source,
enabled, files, timestamps) so the API can list/manage skills without scanning
the filesystem on every read.

Design notes
------------
* All filesystem access is confined to ``SKILLS_CONFIG_DIR`` via
  :func:`_safe_skill_dir`, which rejects traversal and symlink escape — the
  same posture as :mod:`app.core.path_security`.
* ZIP import defends against Zip Slip (entries resolving outside the skill
  directory) and enforces size/count caps (see :mod:`app.schemas.skill`).
* Only ``enabled=True`` skills are surfaced to the Agent Loop; the loop reads
  ``SKILL.md`` directly from disk (see :func:`agent_loop._skill_file`), so the
  registry's ``enabled`` flag is the single load gate.
"""

from __future__ import annotations

import json
import logging
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from filelock import FileLock

from app.core.config import CONFIG_DIR, SKILLS_CONFIG_DIR
from app.schemas.skill import (
    MAX_SKILL_FILES,
    MAX_SKILL_ZIP_BYTES,
    SKILL_DEFINITION_FILENAME,
    SkillSource,
)

logger = logging.getLogger(__name__)

SKILLS_FILE = CONFIG_DIR / "skills.json"
LOCK_FILE = CONFIG_DIR / "skills.json.lock"

DEFAULT_SKILL_MD_TEMPLATE = """\
# {name}

{description}

## 用法
（在此描述该技能的执行步骤与输入输出约定。）
"""


# ── timestamps ───────────────────────────────────────────────────────────────


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ── path safety ──────────────────────────────────────────────────────────────


def _safe_skill_dir(slug: str) -> Path:
    """Return the absolute skill directory for ``slug``, validating it stays
    inside ``SKILLS_CONFIG_DIR``.

    Raises ``ValueError`` on any traversal or symlink-escape attempt. The
    directory itself need not exist yet.
    """
    if not slug or "/" in slug or "\\" in slug or slug in {".", ".."}:
        raise ValueError(f"非法 slug：{slug!r}")
    root = SKILLS_CONFIG_DIR.resolve(strict=False)
    candidate = (SKILLS_CONFIG_DIR / slug).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"非法 slug（越界）：{slug!r}") from exc
    # Reject if any existing component along the way is a symlink escaping root.
    current = candidate
    while current and current != current.parent:
        if current == root:
            break
        try:
            import os

            if os.path.islink(current):
                link_target = Path(os.readlink(current))
                link_resolved = (
                    link_target
                    if link_target.is_absolute()
                    else (current.parent / link_target)
                ).resolve(strict=False)
                try:
                    link_resolved.relative_to(root)
                except ValueError as exc:
                    raise ValueError(f"非法 slug（符号链接越界）：{slug!r}") from exc
        except OSError:
            pass
        current = current.parent
    return candidate


def _skill_md_path(slug: str) -> Path:
    return _safe_skill_dir(slug) / SKILL_DEFINITION_FILENAME


def skill_md_rel_path(slug: str) -> str:
    """Return the stored relative path string for a skill's SKILL.md."""
    return f"workspace/config/skills/{slug}/{SKILL_DEFINITION_FILENAME}"


# ── skills.json read/write ──────────────────────────────────────────────────


def _ensure_file() -> None:
    if not SKILLS_FILE.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SKILLS_FILE.write_text("[]", encoding="utf-8")


def _read_all() -> list[dict[str, Any]]:
    _ensure_file()
    raw = SKILLS_FILE.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _write_all(skills: list[dict[str, Any]]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SKILLS_FILE.write_text(
        json.dumps(skills, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── filesystem helpers ──────────────────────────────────────────────────────


def _count_files(skill_dir: Path) -> int:
    """Count regular files inside ``skill_dir`` (recursive)."""
    if not skill_dir.exists():
        return 0
    total = 0
    for entry in skill_dir.rglob("*"):
        if entry.is_file():
            total += 1
    return total


def _seed_skill_md(skill_dir: Path, name: str, description: str, content: str) -> None:
    """Create the skill directory and write SKILL.md (idempotent on the dir)."""
    skill_dir.mkdir(parents=True, exist_ok=True)
    md = skill_dir / SKILL_DEFINITION_FILENAME
    if content.strip():
        md.write_text(content, encoding="utf-8")
    elif not md.exists():
        md.write_text(
            DEFAULT_SKILL_MD_TEMPLATE.format(name=name, description=description or ""),
            encoding="utf-8",
        )


# ── public CRUD ─────────────────────────────────────────────────────────────


def list_skills() -> list[dict[str, Any]]:
    """Return all registered Skill records (lock-guarded read)."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        return _read_all()


def get_skill(skill_id: str) -> dict[str, Any] | None:
    for skill in list_skills():
        if skill.get("id") == skill_id:
            return skill
    return None


def get_skill_by_slug(slug: str) -> dict[str, Any] | None:
    for skill in list_skills():
        if skill.get("slug") == slug:
            return skill
    return None


def generate_id() -> str:
    return str(uuid.uuid4())


def create_skill(
    *,
    name: str,
    slug: str,
    description: str,
    enabled: bool,
    content: str,
    source: SkillSource = "自建",
) -> dict[str, Any]:
    """Create a skill directory + registry record.

    Raises ``ValueError`` if the slug is unsafe or already registered.
    """
    lock = FileLock(str(LOCK_FILE))
    with lock:
        skills = _read_all()
        if any(s.get("slug") == slug for s in skills):
            raise ValueError(f"slug 已存在：{slug}")
        skill_dir = _safe_skill_dir(slug)
        _seed_skill_md(skill_dir, name, description, content)
        record: dict[str, Any] = {
            "id": generate_id(),
            "name": name,
            "slug": slug,
            "description": description,
            "enabled": bool(enabled),
            "source": source,
            "files": _count_files(skill_dir),
            "skill_md_path": skill_md_rel_path(slug),
            "created_at": _utcnow_iso(),
            "updated_at": _utcnow_iso(),
        }
        skills.append(record)
        _write_all(skills)
        return record


def update_skill(
    skill_id: str, *, name: str, description: str, enabled: bool
) -> dict[str, Any] | None:
    """Replace editable fields on a registered skill. Returns updated or None."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        skills = _read_all()
        for skill in skills:
            if skill.get("id") == skill_id:
                slug = skill.get("slug", "")
                skill["name"] = name
                skill["description"] = description
                skill["enabled"] = bool(enabled)
                skill["files"] = _count_files(_safe_skill_dir(slug))
                skill["updated_at"] = _utcnow_iso()
                _write_all(skills)
                return skill
        return None


def delete_skill(skill_id: str) -> bool:
    """Remove a skill record and its on-disk directory. Returns True if deleted."""
    lock = FileLock(str(LOCK_FILE))
    with lock:
        skills = _read_all()
        target = next((s for s in skills if s.get("id") == skill_id), None)
        if target is None:
            return False
        remaining = [s for s in skills if s.get("id") != skill_id]
        _write_all(remaining)
    slug = target.get("slug", "")
    try:
        skill_dir = _safe_skill_dir(slug)
        if skill_dir.exists():
            shutil.rmtree(skill_dir, ignore_errors=True)
    except ValueError:
        # Stale record with an unsafe slug — nothing to remove on disk.
        pass
    return True


# ── ZIP import ──────────────────────────────────────────────────────────────


def import_zip(
    *,
    archive_bytes: bytes,
    name: str,
    slug: str,
    description: str,
    enabled: bool,
) -> dict[str, Any]:
    """Extract a ZIP archive into ``skills/{slug}/`` and register it.

    Defends against Zip Slip: every entry must resolve inside the skill
    directory. Enforces :data:`MAX_SKILL_ZIP_BYTES` on the archive size and
    :data:`MAX_SKILL_FILES` on the entry count.

    Raises ``ValueError`` on any violation.
    """
    if len(archive_bytes) > MAX_SKILL_ZIP_BYTES:
        raise ValueError(
            f"ZIP 超过大小上限（{MAX_SKILL_ZIP_BYTES // (1024 * 1024)}MB）"
        )

    lock = FileLock(str(LOCK_FILE))
    with lock:
        skills = _read_all()
        if any(s.get("slug") == slug for s in skills):
            raise ValueError(f"slug 已存在：{slug}")
        skill_dir = _safe_skill_dir(slug)
        # Start from a clean directory so re-imports are deterministic.
        if skill_dir.exists():
            shutil.rmtree(skill_dir, ignore_errors=True)
        skill_dir.mkdir(parents=True, exist_ok=True)
        root = skill_dir.resolve(strict=False)

        import io

        written = 0
        has_definition = False
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
            entries = [e for e in zf.infolist() if not e.is_dir()]
            if len(entries) > MAX_SKILL_FILES:
                raise ValueError(
                    f"ZIP 内文件数超过上限（{MAX_SKILL_FILES}）"
                )
            for entry in entries:
                # Reject absolute paths and traversal in the raw name first.
                raw = entry.filename
                if raw.startswith("/") or raw.startswith("\\") or ":" in raw[:2]:
                    raise ValueError(f"非法 ZIP 条目路径：{raw!r}")
                if ".." in Path(raw).parts:
                    raise ValueError(f"非法 ZIP 条目路径（含 ..）：{raw!r}")
                target = (skill_dir / raw).resolve(strict=False)
                try:
                    target.relative_to(root)
                except ValueError as exc:
                    raise ValueError(
                        f"非法 ZIP 条目路径（越界，Zip Slip）：{raw!r}"
                    ) from exc
                # Decompress with a per-entry size guard too.
                if entry.file_size > MAX_SKILL_ZIP_BYTES:
                    raise ValueError(f"ZIP 条目过大：{raw!r}")
                target.parent.mkdir(parents=True, exist_ok=True)
                data = zf.read(entry)
                target.write_bytes(data)
                written += 1
                if target.name == SKILL_DEFINITION_FILENAME:
                    has_definition = True

        # Guarantee a SKILL.md exists so the skill is loadable by the loop.
        if not has_definition:
            _seed_skill_md(skill_dir, name, description, "")

        record: dict[str, Any] = {
            "id": generate_id(),
            "name": name,
            "slug": slug,
            "description": description,
            "enabled": bool(enabled),
            "source": "ZIP 导入",
            "files": _count_files(skill_dir),
            "skill_md_path": skill_md_rel_path(slug),
            "created_at": _utcnow_iso(),
            "updated_at": _utcnow_iso(),
        }
        skills.append(record)
        _write_all(skills)
        # Stash written count on the record for the import endpoint to report.
        record["_written_files"] = written
        return record


# ── scan ────────────────────────────────────────────────────────────────────


def iter_skill_dirs() -> Iterator[Path]:
    """Yield immediate subdirectories of ``SKILLS_CONFIG_DIR`` that contain a
    ``SKILL.md``."""
    if not SKILLS_CONFIG_DIR.exists():
        return
    for entry in sorted(SKILLS_CONFIG_DIR.iterdir()):
        if entry.is_dir() and (entry / SKILL_DEFINITION_FILENAME).is_file():
            # Skip symlinked dirs that escape the skills root.
            try:
                entry.resolve(strict=False).relative_to(
                    SKILLS_CONFIG_DIR.resolve(strict=False)
                )
            except ValueError:
                continue
            yield entry


def scan_skills() -> list[dict[str, Any]]:
    """Discover unregistered skill directories and register them.

    Returns the list of newly registered records. Existing slugs are skipped.
    """
    lock = FileLock(str(LOCK_FILE))
    discovered: list[dict[str, Any]] = []
    with lock:
        skills = _read_all()
        known_slugs = {s.get("slug") for s in skills}
        for skill_dir in iter_skill_dirs():
            slug = skill_dir.name
            if slug in known_slugs:
                continue
            try:
                first_line = (
                    (skill_dir / SKILL_DEFINITION_FILENAME)
                    .read_text(encoding="utf-8")
                    .splitlines()[0:1]
                )
            except (OSError, UnicodeDecodeError):
                first_line = []
            name = first_line[0].lstrip("# ").strip() if first_line else slug
            record: dict[str, Any] = {
                "id": generate_id(),
                "name": name or slug,
                "slug": slug,
                "description": f"从 workspace 扫描发现的技能：{slug}",
                "enabled": False,
                "source": "扫描发现",
                "files": _count_files(skill_dir),
                "skill_md_path": skill_md_rel_path(slug),
                "created_at": _utcnow_iso(),
                "updated_at": _utcnow_iso(),
            }
            skills.append(record)
            known_slugs.add(slug)
            discovered.append(record)
        if discovered:
            _write_all(skills)
    return discovered


# ── enabled loading (consumed by the Agent Loop) ────────────────────────────


def enabled_skill_slugs() -> list[str]:
    """Return slugs of all enabled skills (the load gate for the Agent Loop)."""
    return [s["slug"] for s in list_skills() if s.get("enabled") is True and s.get("slug")]


# ── test helper ─────────────────────────────────────────────────────────────


def reset_for_test(skills_file: Path | None = None) -> None:
    """Test helper: wipe skills.json and the skills/ dir for a clean slate."""
    target = skills_file or SKILLS_FILE
    if target.exists():
        target.write_text("[]", encoding="utf-8")
    lock_path = target.with_suffix(".json.lock")
    if lock_path.exists():
        lock_path.unlink()
    if SKILLS_CONFIG_DIR.exists():
        shutil.rmtree(SKILLS_CONFIG_DIR, ignore_errors=True)
        SKILLS_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


__all__ = [
    "SKILLS_FILE",
    "list_skills",
    "get_skill",
    "get_skill_by_slug",
    "generate_id",
    "create_skill",
    "update_skill",
    "delete_skill",
    "import_zip",
    "scan_skills",
    "iter_skill_dirs",
    "enabled_skill_slugs",
    "skill_md_rel_path",
    "reset_for_test",
]
