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
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  api_key_ref: string | null;
  api_key_env: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelCreate {
  name: string;
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  api_key: string;
  api_key_env?: string | null;
}

export interface ModelUpdate {
  name: string;
  provider: ModelProvider;
  base_url: string;
  context_window_tokens: number;
  api_key?: string | null;
  api_key_env?: string | null;
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

// ── Generic envelope ────────────────────────────────────────────────────────

/** FastAPI error body for non-2xx responses. */
export interface ApiErrorBody {
  detail?: string;
}
