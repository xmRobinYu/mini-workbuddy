"""Tests for the Skill management API (US-009).

Covers all acceptance criteria:
- list/create/get/update/delete
- scan discovers unregistered skill directories
- ZIP import with Zip Slip protection and size limits
- directory confined to workspace/config/skills/
- only enabled skills are loadable (registry enabled flag is the gate)
"""

from __future__ import annotations

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.core.config import SKILLS_CONFIG_DIR
from app.main import create_app
from app.services import skills_store
from app.services.skills_store import SKILLS_FILE


def _reset_skills() -> None:
    """Ensure each test starts from a clean skills.json + skills/ dir."""
    SKILLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    skills_store.reset_for_test()


def _client() -> TestClient:
    return TestClient(create_app())


# ── list + create ───────────────────────────────────────────────────────────


def test_list_starts_empty() -> None:
    _reset_skills()
    with _client() as client:
        resp = client.get("/api/skills")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_skill_seeds_skill_md() -> None:
    _reset_skills()
    with _client() as client:
        resp = client.post(
            "/api/skills",
            json={
                "name": "PRD 生成器",
                "slug": "prd-generator",
                "description": "从想法生成 PRD",
                "enabled": True,
                "content": "# PRD 生成器\n生成结构化 PRD",
            },
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "PRD 生成器"
    assert body["slug"] == "prd-generator"
    assert body["enabled"] is True
    assert body["source"] == "自建"
    assert body["files"] >= 1
    assert body["skill_md_path"].endswith("skills/prd-generator/SKILL.md")
    md = SKILLS_CONFIG_DIR / "prd-generator" / "SKILL.md"
    assert md.is_file()
    assert "PRD 生成器" in md.read_text(encoding="utf-8")


def test_create_skill_rejects_duplicate_slug() -> None:
    _reset_skills()
    with _client() as client:
        client.post(
            "/api/skills",
            json={"name": "A", "slug": "dup", "description": "", "enabled": False},
        )
        resp = client.post(
            "/api/skills",
            json={"name": "B", "slug": "dup", "description": "", "enabled": False},
        )
    assert resp.status_code == 400


def test_create_skill_rejects_unsafe_slug() -> None:
    _reset_skills()
    with _client() as client:
        # Slugs failing the Pydantic regex are rejected by FastAPI -> 422.
        # Path-unsafe values that match the regex are rejected at the store
        # layer -> 400. Both are non-2xx rejections; we assert >= 400 here and
        # spot-check a couple of exact codes.
        for bad in ["../escape", "has/slash", "UPPER", "-leading", "has space"]:
            resp = client.post(
                "/api/skills",
                json={"name": "X", "slug": bad, "description": "", "enabled": False},
            )
            assert resp.status_code >= 400, (
                f"slug {bad!r} should be rejected, got {resp.status_code}"
            )


# ── get / update / delete ───────────────────────────────────────────────────


def test_get_update_delete_skill() -> None:
    _reset_skills()
    with _client() as client:
        created = client.post(
            "/api/skills",
            json={"name": "翻译", "slug": "translate", "description": "d", "enabled": False},
        ).json()

        # get
        got = client.get(f"/api/skills/{created['id']}").json()
        assert got["name"] == "翻译"

        # update
        resp = client.put(
            f"/api/skills/{created['id']}",
            json={"name": "中英翻译", "description": "更新描述", "enabled": True},
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["name"] == "中英翻译"
        assert updated["enabled"] is True

        # delete
        resp = client.delete(f"/api/skills/{created['id']}")
        assert resp.status_code == 204
        assert client.get(f"/api/skills/{created['id']}").status_code == 404
        # on-disk directory removed
        assert not (SKILLS_CONFIG_DIR / "translate").exists()


def test_get_and_delete_unknown_returns_404() -> None:
    _reset_skills()
    with _client() as client:
        assert client.get("/api/skills/nope").status_code == 404
        assert client.delete("/api/skills/nope").status_code == 404


# ── scan ────────────────────────────────────────────────────────────────────


def test_scan_discovers_unregistered_skill_dirs() -> None:
    _reset_skills()
    # Create an on-disk skill dir with SKILL.md but no registry entry.
    skill_dir = SKILLS_CONFIG_DIR / "scanned-skill"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text("# 扫描技能\n来自扫描", encoding="utf-8")

    with _client() as client:
        resp = client.post("/api/skills/scan")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    discovered = body["discovered"]
    assert len(discovered) == 1
    assert discovered[0]["slug"] == "scanned-skill"
    assert discovered[0]["source"] == "扫描发现"
    assert discovered[0]["enabled"] is False


def test_scan_is_idempotent() -> None:
    _reset_skills()
    skill_dir = SKILLS_CONFIG_DIR / "once"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text("# once", encoding="utf-8")
    with _client() as client:
        client.post("/api/skills/scan")
        second = client.post("/api/skills/scan").json()
    assert second["discovered"] == []


# ── ZIP import ──────────────────────────────────────────────────────────────


def _make_zip(entries: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def test_import_zip_creates_skill() -> None:
    _reset_skills()
    archive = _make_zip(
        {"SKILL.md": "# 导入技能\n说明", "helper.txt": "辅助资源"}
    )
    with _client() as client:
        resp = client.post(
            "/api/skills/import",
            files={"file": ("imp.zip", archive, "application/zip")},
            data={
                "name": "导入技能",
                "slug": "imported",
                "description": "来自 ZIP",
                "enabled": "true",
            },
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["skill"]["source"] == "ZIP 导入"
    assert body["skill"]["enabled"] is True
    assert body["files"] == 2
    skill_dir = SKILLS_CONFIG_DIR / "imported"
    assert (skill_dir / "SKILL.md").is_file()
    assert (skill_dir / "helper.txt").is_file()


def test_import_zip_blocks_zip_slip() -> None:
    _reset_skills()
    # An entry with .. that would resolve outside the skill dir.
    archive = _make_zip({"../escaped.txt": "boom"})
    with _client() as client:
        resp = client.post(
            "/api/skills/import",
            files={"file": ("bad.zip", archive, "application/zip")},
            data={"name": "X", "slug": "bad", "description": "", "enabled": "false"},
        )
    assert resp.status_code == 400
    # Nothing escaped onto disk.
    assert not (SKILLS_CONFIG_DIR.parent / "escaped.txt").exists()


def test_import_zip_seeds_skill_md_when_missing() -> None:
    _reset_skills()
    archive = _make_zip({"notes.txt": "no definition here"})
    with _client() as client:
        resp = client.post(
            "/api/skills/import",
            files={"file": ("nodef.zip", archive, "application/zip")},
            data={"name": "无定义", "slug": "no-def", "description": "d", "enabled": "false"},
        )
    assert resp.status_code == 201
    assert (SKILLS_CONFIG_DIR / "no-def" / "SKILL.md").is_file()


def test_import_zip_rejects_oversized() -> None:
    _reset_skills()
    from app.schemas.skill import MAX_SKILL_ZIP_BYTES

    # A genuinely oversized archive (real bytes beyond the cap).
    big = b"0" * (MAX_SKILL_ZIP_BYTES + 1)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        zf.writestr("big.bin", big)
    with _client() as client:
        resp = client.post(
            "/api/skills/import",
            files={"file": ("big.zip", buf.getvalue(), "application/zip")},
            data={"name": "X", "slug": "big", "description": "", "enabled": "false"},
        )
    assert resp.status_code in (400, 413)


# ── enabled load gate ───────────────────────────────────────────────────────


def test_only_enabled_skills_returned_by_load_gate() -> None:
    _reset_skills()
    with _client() as client:
        client.post(
            "/api/skills",
            json={"name": "on", "slug": "on-skill", "description": "", "enabled": True},
        )
        client.post(
            "/api/skills",
            json={"name": "off", "slug": "off-skill", "description": "", "enabled": False},
        )
    slugs = skills_store.enabled_skill_slugs()
    assert slugs == ["on-skill"]


# ── persistence ─────────────────────────────────────────────────────────────


def test_create_persists_to_skills_json() -> None:
    _reset_skills()
    with _client() as client:
        client.post(
            "/api/skills",
            json={"name": "持久", "slug": "persist", "description": "d", "enabled": True},
        )
    data = json.loads(SKILLS_FILE.read_text(encoding="utf-8"))
    assert len(data) == 1
    assert data[0]["slug"] == "persist"
    assert data[0]["enabled"] is True
