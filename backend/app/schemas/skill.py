"""Pydantic schemas for the Skill management API (US-009).

A Skill is a reusable capability package living under
``workspace/config/skills/{slug}/`` with a ``SKILL.md`` definition file. Skills
are created, imported (ZIP) or discovered by scanning the skills directory, and
can be enabled/disabled. Only ``enabled=True`` skills are loaded into the Agent
Loop (see :mod:`app.services.agent_loop`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SkillSource = Literal["内置", "自建", "ZIP 导入", "扫描发现"]

# Hard limits enforced by the import path (mirrors the frontend's 20 MB cap
# plus a sane per-archive entry count).
MAX_SKILL_ZIP_BYTES = 20 * 1024 * 1024
MAX_SKILL_FILES = 200
SKILL_DEFINITION_FILENAME = "SKILL.md"


class SkillBase(BaseModel):
    """Shared editable fields."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100, description="Skill 显示名称")
    slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9][a-z0-9-]*$",
        description="目录名，仅允许小写字母、数字与短横线",
    )
    description: str = Field(default="", max_length=500, description="Skill 描述")
    enabled: bool = Field(default=False, description="是否启用（仅 enabled 进入 Agent Loop）")


class SkillCreate(SkillBase):
    """Payload for POST /api/skills (create a self-built skill)."""

    content: str = Field(
        default="",
        description="初始 SKILL.md 内容；为空时写入以 name 为标题的占位骨架",
    )


class SkillUpdate(BaseModel):
    """Payload for PUT /api/skills/{id} (full replacement of editable fields).

    ``slug`` is immutable after creation (it is the on-disk directory name) so
    it is not accepted here.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100, description="Skill 显示名称")
    description: str = Field(default="", max_length=500, description="Skill 描述")
    enabled: bool = Field(..., description="是否启用")


class SkillRead(SkillBase):
    """Serialised Skill as returned by GET and stored in skills.json."""

    id: str
    source: SkillSource = Field(..., description="来源：内置/自建/ZIP 导入/扫描发现")
    files: int = Field(..., ge=0, description="包含 SKILL.md 在内的资源文件数量")
    skill_md_path: str = Field(..., description="SKILL.md 文件相对路径")
    created_at: str
    updated_at: str


class SkillScanResult(BaseModel):
    """Response body for POST /api/skills/scan."""

    discovered: list[SkillRead] = Field(
        default_factory=list, description="本次扫描新发现并登记的 Skill"
    )
    total: int = Field(..., description="扫描后 skills.json 中的 Skill 总数")


class SkillImportResult(BaseModel):
    """Response body for POST /api/skills/import (ZIP import)."""

    skill: SkillRead = Field(..., description="导入成功的 Skill")
    files: int = Field(..., ge=0, description="解压写入的文件数（含 SKILL.md）")


def validate_slug(slug: str) -> str:
    """Return the slug stripped, raising ValueError if it is unsafe.

    Slugs must match ``^[a-z0-9][a-z0-9-]*$`` and may not contain path
    separators or traversal segments — this is the single chokepoint before a
    slug is joined onto ``SKILLS_CONFIG_DIR``.
    """
    cleaned = (slug or "").strip()
    if not cleaned or "/" in cleaned or "\\" in cleaned or cleaned in {".", ".."}:
        raise ValueError(f"非法 slug：{slug!r}")
    if cleaned.startswith("-") or ".." in cleaned:
        raise ValueError(f"非法 slug：{slug!r}")
    import re

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", cleaned):
        raise ValueError(
            f"非法 slug：{slug!r}（仅允许小写字母、数字与短横线，且以字母或数字开头）"
        )
    return cleaned


__all__ = [
    "SkillSource",
    "MAX_SKILL_ZIP_BYTES",
    "MAX_SKILL_FILES",
    "SKILL_DEFINITION_FILENAME",
    "SkillBase",
    "SkillCreate",
    "SkillUpdate",
    "SkillRead",
    "SkillScanResult",
    "SkillImportResult",
    "validate_slug",
]
