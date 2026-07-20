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

// ── Memory (backend/app/schemas/memory.py) ───────────────────────────────────

/** GET /api/memory/long-term response. */
export interface LongTermMemoryRead {
  content: string;
  bytes: number;
  max_bytes: number;
  items: number;
}

/** PUT /api/memory/long-term payload. */
export interface LongTermMemoryUpdate {
  content: string;
}

/** A single short-term daily memory file. */
export interface ShortTermFileRead {
  date: string;
  filename: string;
  bytes: number;
  items: number;
  content: string;
}

/** GET /api/memory/short-term response. */
export interface ShortTermMemoryRead {
  files: ShortTermFileRead[];
  total_items: number;
}

/** GET /api/memory/stats response. */
export interface MemoryStatsRead {
  long_term_bytes: number;
  long_term_max_bytes: number;
  long_term_items: number;
  short_term_files: number;
  short_term_items: number;
  archived_items: number;
}

// ── Logs (backend/app/schemas/log.py) ───────────────────────────────────────

/** GET /api/logs query params. */
export interface LogsQuery {
  type?: "model" | "tool" | "agent" | "skill" | "all";
  q?: string;
  level?: "info" | "warn" | "error" | "all";
  status?: "ok" | "error" | "all";
  limit?: number;
}

/** A single log row projected from conversation JSONL. */
export interface LogRead {
  id: string;
  conversation_id: string;
  conversation_title: string;
  time: string;
  type: "model" | "tool" | "agent" | "skill";
  event: string;
  agent: string;
  level: "info" | "warn" | "error";
  status: "ok" | "error";
  latency: string;
  detail: string;
  input: unknown;
  output: unknown;
}

/** GET /api/logs response body. */
export interface LogList {
  items: LogRead[];
  total: number;
  limit: number;
}

// ── Generic envelope ────────────────────────────────────────────────────────

/** FastAPI error body for non-2xx responses. */
export interface ApiErrorBody {
  detail?: string;
}
