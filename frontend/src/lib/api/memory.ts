/**
 * Memory API client (US-012).
 *
 * Mirrors the backend memory management endpoints. Backend payloads are
 * snake_case; the camelCase view models below are what the memory page holds.
 * All access is confined to ``workspace/memory`` and ``workspace/memory.md``
 * on the server side.
 */

import { apiClient } from "./client";
import type {
  LongTermMemoryRead,
  LongTermMemoryUpdate,
  MemoryStatsRead,
  ShortTermFileRead,
  ShortTermMemoryRead,
} from "./types";

// ── view models ─────────────────────────────────────────────────────────────

export interface LongTermMemoryViewModel {
  content: string;
  bytes: number;
  maxBytes: number;
  items: number;
}

export interface ShortTermFileViewModel {
  date: string;
  filename: string;
  bytes: number;
  items: number;
  content: string;
}

export interface ShortTermMemoryViewModel {
  files: ShortTermFileViewModel[];
  totalItems: number;
}

export interface MemoryStatsViewModel {
  longTermBytes: number;
  longTermMaxBytes: number;
  longTermItems: number;
  shortTermFiles: number;
  shortTermItems: number;
  archivedItems: number;
}

// ── mappers ─────────────────────────────────────────────────────────────────

function mapLongTerm(read: LongTermMemoryRead): LongTermMemoryViewModel {
  return {
    content: read.content,
    bytes: read.bytes,
    maxBytes: read.max_bytes,
    items: read.items,
  };
}

function mapShortTermFile(read: ShortTermFileRead): ShortTermFileViewModel {
  return {
    date: read.date,
    filename: read.filename,
    bytes: read.bytes,
    items: read.items,
    content: read.content,
  };
}

function mapShortTerm(read: ShortTermMemoryRead): ShortTermMemoryViewModel {
  return {
    files: read.files.map(mapShortTermFile),
    totalItems: read.total_items,
  };
}

function mapStats(read: MemoryStatsRead): MemoryStatsViewModel {
  return {
    longTermBytes: read.long_term_bytes,
    longTermMaxBytes: read.long_term_max_bytes,
    longTermItems: read.long_term_items,
    shortTermFiles: read.short_term_files,
    shortTermItems: read.short_term_items,
    archivedItems: read.archived_items,
  };
}

// ── API surface ─────────────────────────────────────────────────────────────

export const memoryApi = {
  async getLongTerm(): Promise<LongTermMemoryViewModel> {
    return mapLongTerm(await apiClient.get<LongTermMemoryRead>("/api/memory/long-term"));
  },
  async putLongTerm(content: string): Promise<LongTermMemoryViewModel> {
    const payload: LongTermMemoryUpdate = { content };
    return mapLongTerm(await apiClient.put<LongTermMemoryRead>("/api/memory/long-term", payload));
  },
  async getShortTerm(): Promise<ShortTermMemoryViewModel> {
    return mapShortTerm(await apiClient.get<ShortTermMemoryRead>("/api/memory/short-term"));
  },
  async getStats(): Promise<MemoryStatsViewModel> {
    return mapStats(await apiClient.get<MemoryStatsRead>("/api/memory/stats"));
  },
};
