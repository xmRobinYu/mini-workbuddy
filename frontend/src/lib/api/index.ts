/**
 * Public surface of the API client layer (US-001).
 *
 * Pages import from `@/lib/api` rather than reaching into individual files,
 * so the internal layout can evolve without touching call sites.
 */

export { ApiError, apiClient, request } from "./client";
export type { RequestOptions } from "./client";
export * from "./types";
export {
  mapAgent,
  mapModel,
  formatContextWindow,
  toSnakeCase,
  type AgentViewModel,
  type ModelViewModel,
} from "./mappers";
export { modelsApi, parseContextWindow, type ModelForm } from "./models";
export {
  agentsApi,
  chatApi,
  conversationsApi,
  toolsApi,
  type ChatEvent,
  type ChatEventName,
  type ChatSendPayload,
} from "./chat";
