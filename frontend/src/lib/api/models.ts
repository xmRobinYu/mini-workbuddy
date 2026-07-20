import { apiClient } from "./client";
import { mapModel, type ModelViewModel } from "./mappers";
import type { ModelCreate, ModelProvider, ModelRead, ModelTestResult, ModelUpdate } from "./types";

export type ModelForm = {
  name: string;
  modelId: string;
  provider: ModelProvider;
  baseUrl: string;
  context: string;
  apiKey: string;
  isDefault: boolean;
};

export function parseContextWindow(value: string): number | null {
  const match = value.trim().match(/^(\d+)([kKmM])?$/);
  if (!match) return null;
  const multiplier = match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2] ? 1_000 : 1;
  const tokens = Number(match[1]) * multiplier;
  return Number.isSafeInteger(tokens) && tokens > 0 && tokens <= 2_000_000 ? tokens : null;
}

function toPayload(form: ModelForm): Omit<ModelCreate, "api_key"> {
  const contextWindowTokens = parseContextWindow(form.context);
  if (contextWindowTokens === null) throw new Error("上下文长度格式无效");
  return {
    name: form.name.trim(),
    model: form.modelId.trim(),
    provider: form.provider,
    base_url: form.baseUrl.trim(),
    context_window_tokens: contextWindowTokens,
    is_default: form.isDefault,
  };
}

export const modelsApi = {
  async list(): Promise<ModelViewModel[]> {
    return (await apiClient.get<ModelRead[]>("/api/models")).map(mapModel);
  },
  async create(form: ModelForm): Promise<ModelViewModel> {
    const payload: ModelCreate = { ...toPayload(form), api_key: form.apiKey };
    return mapModel(await apiClient.post<ModelRead>("/api/models", payload));
  },
  async update(id: string, form: ModelForm): Promise<ModelViewModel> {
    const payload: ModelUpdate = {
      ...toPayload(form),
      ...(form.apiKey ? { api_key: form.apiKey } : {}),
    };
    return mapModel(await apiClient.put<ModelRead>(`/api/models/${id}`, payload));
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/models/${id}`);
  },
  async setDefault(id: string): Promise<ModelViewModel> {
    return mapModel(await apiClient.put<ModelRead>(`/api/models/${id}/default`));
  },
  test(id: string): Promise<ModelTestResult> {
    return apiClient.post<ModelTestResult>(`/api/models/${id}/test`);
  },
};
