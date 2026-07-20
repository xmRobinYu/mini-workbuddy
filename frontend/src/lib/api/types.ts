/**
 * Shared API type definitions (US-001).
 *
 * These mirror the Pydantic schemas returned by the FastAPI backend. Field
 * names are kept in snake_case to match the wire format exactly; the
 * `mappers.ts` module converts them to the camelCase shapes the UI prefers.
 *
 * Keep this file aligned with `backend/app/schemas/*.py` — it is the single
 * source of truth for the contract the frontend expects.
 */

// ── System ──────────────────────────────────────────────────────────────────

/** GET /api/ping response. */
export interface PingResponse {
  pong: string;
}

// ── Models (backend/app/schemas/model.py) ───────────────────────────────────

export type ModelProvider = "deepseek" | "alibaba" | "custom";

/** Shared model fields as returned/stored by the backend. */
export interface ModelRead {
  id: string;
  name: string;
  model: string;
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  is_default: boolean;
  api_key_ref: string | null;
  api_key_env: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelCreate {
  name: string;
  model: string;
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  is_default?: boolean;
  api_key: string;
  api_key_env?: string | null;
}

export interface ModelUpdate {
  name: string;
  model: string;
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  is_default?: boolean;
  api_key?: string | null;
  api_key_env?: string | null;
}

export interface ModelTestResult {
  success: boolean;
  latency_ms: number | null;
  error: string | null;
}

// ── Tools (backend/app/schemas/tool.py) ─────────────────────────────────────

export interface BuiltinTool {
  name: string;
  description: string;
  enabled: boolean;
}

export interface ToolToggleResponse {
  name: string;
  enabled: boolean;
}

// ── Agents (backend/app/schemas/agent.py) ───────────────────────────────────

export interface AgentRead {
  id: string;
  name: string;
  description: string;
  model_id: string | null;
  tools: string[];
  skills: string[];
  is_default: boolean;
  agent_md_path: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  name: string;
  description?: string;
  model_id?: string | null;
  tools?: string[];
  skills?: string[];
}

export type AgentUpdate = AgentCreate;

// ── Conversations (backend/app/schemas/conversation.py) ─────────────────────

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  events: Array<Record<string, unknown>>;
}

export interface UploadedFile {
  filename: string;
  stored_filename: string;
  size: number;
  path: string;
  content_type: string;
}

export interface OutputFile {
  filename: string;
  size: number;
  modified_at: string;
}

// ── Skills (backend/app/schemas/skill.py) ───────────────────────────────────

export type SkillSource = "内置" | "自建" | "ZIP 导入" | "扫描发现";

export interface SkillRead {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  source: SkillSource;
  files: number;
  skill_md_path: string;
  created_at: string;
  updated_at: string;
}

export interface SkillCreate {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  content: string;
}

export interface SkillUpdate {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillScanResult {
  discovered: SkillRead[];
  total: number;
}

export interface SkillImportResult {
  skill: SkillRead;
  files: number;
}

// ── Generic envelope ────────────────────────────────────────────────────────

/** FastAPI error body for non-2xx responses. */
export interface ApiErrorBody {
  detail?: string;
}
