/**
 * Logs API client (US-013).
 *
 * Logs are not persisted in their own store — the backend projects execution
 * events from the conversation JSONL on demand via GET /api/logs. This facade
 * maps the snake_case wire rows to the camelCase LogRow the logs page renders,
 * keeping the page free of payload conversion.
 */

import { apiClient } from "./client";
import type { LogList, LogRead, LogsQuery } from "./types";

export type { LogsQuery } from "./types";

export type LogType = LogRead["type"];
export type LogLevel = LogRead["level"];
export type LogStatus = LogRead["status"];

/** camelCase log row the UI holds (drops the snake_case wire fields). */
export interface LogRow {
  id: string;
  conversationId: string;
  conversationTitle: string;
  time: string;
  type: LogType;
  event: string;
  agent: string;
  level: LogLevel;
  status: LogStatus;
  latency: string;
  detail: string;
  input?: unknown;
  output?: unknown;
}

function mapLog(read: LogRead): LogRow {
  return {
    id: read.id,
    conversationId: read.conversation_id,
    conversationTitle: read.conversation_title,
    time: read.time,
    type: read.type,
    event: read.event,
    agent: read.agent,
    level: read.level,
    status: read.status,
    latency: read.latency,
    detail: read.detail,
    input: read.input ?? undefined,
    output: read.output ?? undefined,
  };
}

/** Build the query string for GET /api/logs, skipping empty filters. */
function buildQuery(query: LogsQuery = {}): string {
  const params = new URLSearchParams();
  if (query.type && query.type !== "all") params.set("type", query.type);
  if (query.q && query.q.trim()) params.set("q", query.q.trim());
  if (query.level && query.level !== "all") params.set("level", query.level);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.limit != null) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface LogsResult {
  items: LogRow[];
  total: number;
  limit: number;
}

export const logsApi = {
  async list(query: LogsQuery = {}): Promise<LogsResult> {
    const body = await apiClient.get<LogList>(`/api/logs${buildQuery(query)}`);
    return {
      items: body.items.map(mapLog),
      total: body.total,
      limit: body.limit,
    };
  },
};
