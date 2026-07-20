import { ApiError, apiClient } from "./client";
import { mapAgent, type AgentViewModel } from "./mappers";
import type {
  AgentCreate,
  AgentRead,
  AgentUpdate,
  BuiltinTool,
  ConversationDetail,
  ConversationSummary,
  OutputFile,
  ToolToggleResponse,
  UploadedFile,
} from "./types";

export type ChatEventName = "thinking" | "content" | "tool_call" | "tool_result" | "done" | "error";

export interface ChatEvent {
  event: ChatEventName;
  data: Record<string, unknown>;
}

export interface ChatSendPayload {
  conversationId: string;
  agentId: string;
  message: string;
  uploadedFilePaths?: string[];
}

export const agentsApi = {
  async list(): Promise<AgentViewModel[]> {
    return (await apiClient.get<AgentRead[]>("/api/agents")).map(mapAgent);
  },
  async create(payload: AgentCreate): Promise<AgentViewModel> {
    return mapAgent(await apiClient.post<AgentRead>("/api/agents", payload));
  },
  async update(id: string, payload: AgentUpdate): Promise<AgentViewModel> {
    return mapAgent(await apiClient.put<AgentRead>(`/api/agents/${id}`, payload));
  },
  remove(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/agents/${id}`);
  },
  async getMarkdown(id: string): Promise<string> {
    const response = await apiClient.get<{ content: string }>(`/api/agents/${id}/agent-md`);
    return response.content;
  },
  async saveMarkdown(id: string, content: string): Promise<void> {
    await apiClient.put(`/api/agents/${id}/agent-md`, { content });
  },
};

export const toolsApi = {
  list(): Promise<BuiltinTool[]> {
    return apiClient.get<BuiltinTool[]>("/api/tools");
  },
  toggle(name: string, enabled: boolean): Promise<ToolToggleResponse> {
    return apiClient.put<ToolToggleResponse>(`/api/tools/${name}/toggle`, { enabled });
  },
};

export const conversationsApi = {
  list(): Promise<ConversationSummary[]> {
    return apiClient.get<ConversationSummary[]>("/api/conversations");
  },
  create(title?: string): Promise<ConversationSummary> {
    return apiClient.post<ConversationSummary>("/api/conversations", title ? { title } : {});
  },
  get(id: string): Promise<ConversationDetail> {
    return apiClient.get<ConversationDetail>(`/api/conversations/${id}`);
  },
  rename(id: string, title: string): Promise<ConversationSummary> {
    return apiClient.put<ConversationSummary>(`/api/conversations/${id}`, { title });
  },
  remove(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/conversations/${id}`);
  },
  outputs(id: string): Promise<OutputFile[]> {
    return apiClient.get<OutputFile[]>(`/api/conversations/${id}/outputs`);
  },
  downloadUrl(id: string, filename: string): string {
    return `/api/conversations/${encodeURIComponent(id)}/outputs/${encodeURIComponent(filename)}`;
  },
};

function parseSseBlock(block: string): ChatEvent | null {
  const line = block.split(/\r?\n/).find((item) => item.startsWith("data:"));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.slice("data:".length).trim()) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("event" in parsed) ||
      !("data" in parsed) ||
      typeof parsed.event !== "string" ||
      parsed.data === null ||
      typeof parsed.data !== "object"
    ) {
      return null;
    }
    return parsed as ChatEvent;
  } catch {
    return null;
  }
}

async function readEventStream(
  response: Response,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  if (!response.body) throw new ApiError(0, "服务未返回可读取的消息流", "");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = parseSseBlock(buffer.slice(0, boundary));
      if (event) onEvent(event);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  const event = parseSseBlock(buffer);
  if (event) onEvent(event);
}

export const chatApi = {
  async upload(file: File, conversationId: string): Promise<UploadedFile> {
    const form = new FormData();
    form.append("file", file);
    form.append("conversation_id", conversationId);
    let response: Response;
    try {
      response = await fetch("/api/chat/upload", { method: "POST", body: form });
    } catch (error) {
      throw new ApiError(0, error instanceof Error ? error.message : "上传失败", "");
    }
    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body || `上传失败（${response.status}）`, body);
    }
    return (await response.json()) as UploadedFile;
  },
  async send(payload: ChatSendPayload, onEvent: (event: ChatEvent) => void): Promise<void> {
    let response: Response;
    try {
      response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: payload.conversationId,
          agent_id: payload.agentId,
          message: payload.message,
          uploaded_file_paths: payload.uploadedFilePaths,
        }),
      });
    } catch (error) {
      throw new ApiError(0, error instanceof Error ? error.message : "发送失败", "");
    }
    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(response.status, body || `发送失败（${response.status}）`, body);
    }
    await readEventStream(response, onEvent);
  },
};
