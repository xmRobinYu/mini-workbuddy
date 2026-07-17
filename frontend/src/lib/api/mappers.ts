/**
 * Snake_case ↔ camelCase mappers (US-001).
 *
 * The backend (FastAPI / Pydantic) serialises in snake_case, while the UI
 * prefers camelCase. Rather than scattering conversion logic across pages,
 * every domain object flows through a dedicated `mapX` function here. New
 * endpoints should add a mapper here instead of inlining the conversion.
 *
 * Mappers are intentionally explicit (field-by-field) so renames surface as
 * type errors rather than silently dropping data.
 */

import type { AgentRead, ModelRead } from "./types";

// ── camelCase view models consumed by the UI ────────────────────────────────

export interface ModelViewModel {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  baseUrl: string;
  contextWindowTokens: number;
  context: string;
  isDefault: boolean;
  apiKeyRef: string | null;
  apiKeyEnv: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentViewModel {
  id: string;
  name: string;
  description: string;
  modelId: string | null;
  tools: string[];
  skills: string[];
  isDefault: boolean;
  agentMdPath: string;
  createdAt: string;
  updatedAt: string;
}

// ── mappers ─────────────────────────────────────────────────────────────────

export function mapModel(read: ModelRead): ModelViewModel {
  return {
    id: read.id,
    name: read.name,
    modelId: read.model,
    provider: read.provider,
    baseUrl: read.base_url,
    contextWindowTokens: read.context_window_tokens,
    context: formatContextWindow(read.context_window_tokens),
    isDefault: read.is_default,
    apiKeyRef: read.api_key_ref,
    apiKeyEnv: read.api_key_env,
    createdAt: read.created_at,
    updatedAt: read.updated_at,
  };
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000 && tokens % 1_000 === 0) return `${tokens / 1_000}k`;
  return String(tokens);
}

export function mapAgent(read: AgentRead): AgentViewModel {
  return {
    id: read.id,
    name: read.name,
    description: read.description,
    modelId: read.model_id,
    tools: read.tools,
    skills: read.skills,
    isDefault: read.is_default,
    agentMdPath: read.agent_md_path,
    createdAt: read.created_at,
    updatedAt: read.updated_at,
  };
}

// ── request payload helpers (camelCase UI → snake_case backend) ─────────────

/**
 * Convert an arbitrary camelCase object to a snake_case payload.
 *
 * Used for create/update bodies where the UI holds a camelCase form. Only
 * primitive values, arrays and plain objects are walked; other types pass
 * through untouched.
 */
export function toSnakeCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(toSnakeCase) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        toSnakeCase(v),
      ]),
    ) as unknown as T;
  }
  return value;
}
