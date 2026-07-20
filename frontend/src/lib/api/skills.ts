/**
 * Skills API client (US-010).
 *
 * Mirrors the backend Skill management endpoints (US-009). Backend payloads are
 * snake_case; the {@link SkillViewModel} camelCase view model is what the UI
 * holds. Only enabled skills are offered in the Agent editor (the Agent Loop
 * likewise only loads enabled skills).
 */

import { apiClient, ApiError } from "./client";
import type {
  SkillCreate,
  SkillImportResult,
  SkillRead,
  SkillScanResult,
  SkillUpdate,
} from "./types";

// ── view models ─────────────────────────────────────────────────────────────

export type SkillSource = "内置" | "自建" | "ZIP 导入" | "扫描发现";

export interface SkillViewModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  source: SkillSource;
  files: number;
  skillMdPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillForm {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  content: string;
}

// ── mappers ─────────────────────────────────────────────────────────────────

function mapSkill(read: SkillRead): SkillViewModel {
  return {
    id: read.id,
    name: read.name,
    slug: read.slug,
    description: read.description,
    enabled: read.enabled,
    source: read.source,
    files: read.files,
    skillMdPath: read.skill_md_path,
    createdAt: read.created_at,
    updatedAt: read.updated_at,
  };
}

// ── API surface ─────────────────────────────────────────────────────────────

export const skillsApi = {
  async list(): Promise<SkillViewModel[]> {
    return (await apiClient.get<SkillRead[]>("/api/skills")).map(mapSkill);
  },
  async create(form: SkillForm): Promise<SkillViewModel> {
    const payload: SkillCreate = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      enabled: form.enabled,
      content: form.content,
    };
    return mapSkill(await apiClient.post<SkillRead>("/api/skills", payload));
  },
  async update(id: string, form: SkillForm): Promise<SkillViewModel> {
    const payload: SkillUpdate = {
      name: form.name,
      description: form.description,
      enabled: form.enabled,
    };
    return mapSkill(await apiClient.put<SkillRead>(`/api/skills/${id}`, payload));
  },
  remove(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/skills/${id}`);
  },
  async scan(): Promise<SkillScanResult> {
    return apiClient.post<SkillScanResult>("/api/skills/scan");
  },
  async importZip(file: File, form: Omit<SkillForm, "content">): Promise<SkillImportResult> {
    const formdata = new FormData();
    formdata.append("file", file);
    formdata.append("name", form.name);
    formdata.append("slug", form.slug);
    formdata.append("description", form.description);
    formdata.append("enabled", String(form.enabled));
    let response: Response;
    try {
      response = await fetch("/api/skills/import", { method: "POST", body: formdata });
    } catch (error) {
      throw new ApiError(0, error instanceof Error ? error.message : "导入失败", "");
    }
    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body || `导入失败（${response.status}）`, body);
    }
    return (await response.json()) as SkillImportResult;
  },
};
