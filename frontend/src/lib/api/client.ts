/**
 * Frontend API client skeleton (US-001).
 *
 * All backend communication goes through this module. The single `request`
 * helper normalises error handling: any non-2xx response is thrown as an
 * {@link ApiError} carrying the HTTP status code and a human-readable detail,
 * so callers can `try/catch` uniformly.
 *
 * Conventions:
 * - Base path is the relative `/api` prefix; the Vite dev server proxies it
 *   to the FastAPI backend (see `vite.config.ts`). No hard-coded host.
 * - Backend payloads are snake_case; camelCase conversion lives in
 *   `mappers.ts`, not here.
 * - API keys are never persisted to localStorage — this layer only forwards
 *   requests the page explicitly makes.
 */

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  /** HTTP status code returned by the backend (0 for network failures). */
  readonly status: number;
  /** Raw response body (text), kept for debugging. */
  readonly body: string;

  constructor(status: number, message: string, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Extract a human-readable detail from a FastAPI error response. */
function readDetail(body: string): string {
  // FastAPI HTTPException responses look like {"detail": "..."}.
  try {
    const parsed = JSON.parse(body) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "detail" in parsed &&
      typeof (parsed as { detail: unknown }).detail === "string"
    ) {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    // Body was not JSON — fall through to raw text.
  }
  return body.trim();
}

/** Shared request options understood by the helper. */
export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Request body, serialised to JSON. */
  body?: unknown;
  /** Optional AbortSignal to cancel the in-flight request. */
  signal?: AbortSignal;
}

/**
 * Perform an API request and return the parsed JSON body (or `null` for 204).
 *
 * @throws {ApiError} when the response status is not in the 2xx range or the
 *   request fails at the network level.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network-level failure (backend down, DNS, CORS preflight rejected, …).
    throw new ApiError(0, err instanceof Error ? err.message : "网络请求失败", "");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(response.status, readDetail(text) || `请求失败（${response.status}）`, text);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  // Non-JSON success body — return as text for the caller to interpret.
  return (await response.text()) as unknown as T;
}

/** Convenience verb helpers. */
export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
