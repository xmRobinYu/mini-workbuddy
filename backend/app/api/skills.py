"""Skill management API (US-009).

Endpoints:
- GET    /api/skills                 list all registered Skills
- POST   /api/skills                 create a self-built Skill (+ seed SKILL.md)
- POST   /api/skills/scan            scan workspace/config/skills for unregistered dirs
- POST   /api/skills/import          import a ZIP archive as a new Skill
- GET    /api/skills/{id}            return a single Skill's metadata
- PUT    /api/skills/{id}            replace a Skill's editable fields (name/desc/enabled)
- DELETE /api/skills/{id}            remove a Skill and its on-disk directory

The skills root is confined to ``workspace/config/skills/``; all filesystem
access goes through :mod:`app.services.skills_store`, which rejects traversal
and Zip Slip. Only ``enabled=True`` skills are surfaced to the Agent Loop.
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse
from starlette.status import HTTP_413_CONTENT_TOO_LARGE

from app.schemas.skill import (
    MAX_SKILL_ZIP_BYTES,
    SkillCreate,
    SkillImportResult,
    SkillRead,
    SkillScanResult,
    SkillUpdate,
    validate_slug,
)
from app.services import skills_store

router = APIRouter(prefix="/skills", tags=["skills"])


def _serialise(skill: dict) -> SkillRead:
    """Validate a stored dict through the read schema before returning it."""
    # Drop internal-only keys (e.g. _written_files) before validation.
    public = {k: v for k, v in skill.items() if not k.startswith("_")}
    return SkillRead.model_validate(public)


@router.get("", response_model=list[SkillRead])
async def list_skills_endpoint() -> list[SkillRead]:
    """Return all registered Skills from skills.json."""
    return [_serialise(s) for s in skills_store.list_skills()]


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
async def create_skill_endpoint(payload: SkillCreate) -> SkillRead:
    """Create a new self-built Skill and seed its SKILL.md."""
    try:
        slug = validate_slug(payload.slug)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    try:
        record = skills_store.create_skill(
            name=payload.name,
            slug=slug,
            description=payload.description,
            enabled=payload.enabled,
            content=payload.content,
            source="自建",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _serialise(record)


@router.post("/scan", response_model=SkillScanResult)
async def scan_skills_endpoint() -> SkillScanResult:
    """Discover unregistered skill directories under workspace/config/skills."""
    discovered = skills_store.scan_skills()
    return SkillScanResult(
        discovered=[_serialise(s) for s in discovered],
        total=len(skills_store.list_skills()),
    )


@router.post("/import", response_model=SkillImportResult)
async def import_skill_endpoint(
    file: UploadFile = File(..., description="要导入的 .zip 技能包"),
    name: str = Form(..., description="Skill 显示名称"),
    slug: str = Form(..., description="目录名 slug"),
    description: str = Form(default="", description="Skill 描述"),
    enabled: bool = Form(default=True, description="导入后是否启用"),
) -> JSONResponse:
    """Import a ZIP archive as a new Skill (Zip-Slip protected)."""
    try:
        slug = validate_slug(slug)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    archive = await file.read()
    if not archive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传文件为空")
    if len(archive) > MAX_SKILL_ZIP_BYTES:
        raise HTTPException(
            status_code=HTTP_413_CONTENT_TOO_LARGE,
            detail=f"ZIP 超过大小上限（{MAX_SKILL_ZIP_BYTES // (1024 * 1024)}MB）",
        )
    try:
        record = skills_store.import_zip(
            archive_bytes=archive,
            name=name,
            slug=slug,
            description=description,
            enabled=enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    written = int(record.pop("_written_files", 0))
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"skill": _serialise(record).model_dump(mode="json"), "files": written},
    )


@router.get("/{skill_id}", response_model=SkillRead)
async def get_skill_endpoint(skill_id: str) -> SkillRead:
    """Return a single Skill's metadata."""
    skill = skills_store.get_skill(skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill 不存在")
    return _serialise(skill)


@router.put("/{skill_id}", response_model=SkillRead)
async def update_skill_endpoint(skill_id: str, payload: SkillUpdate) -> SkillRead:
    """Replace a Skill's editable fields (name/description/enabled)."""
    updated = skills_store.update_skill(
        skill_id,
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill 不存在")
    return _serialise(updated)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_endpoint(skill_id: str) -> None:
    """Remove a Skill record and its on-disk directory."""
    if not skills_store.delete_skill(skill_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill 不存在")


__all__ = ["router"]
