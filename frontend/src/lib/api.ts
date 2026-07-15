// API 请求工具：统一 baseURL 配置，封装 fetch 请求
// 开发环境通过 Vite proxy 代理到后端 http://localhost:8000

const BASE_URL = '/api'

interface RequestOptions extends RequestInit {
  // 可选的自定义 baseURL，默认 /api
  baseURL?: string
}

/**
 * 统一请求函数，自动拼接 baseURL 并处理 JSON 响应。
 * 联调验证时可调用 apiGet('/docs', { baseURL: '' }) 访问后端 Swagger 文档。
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { baseURL = BASE_URL, ...init } = options
  const url = `${baseURL}${path}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`请求失败 ${response.status}: ${text}`)
  }

  // 204 No Content 或空响应体：跳过 JSON 解析，直接返回 undefined
  if (response.status === 204) {
    return undefined as unknown as T
  }

  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    // 即使 content-type 声明为 JSON，响应体可能为空（部分后端 204 仍带该 header）
    const text = await response.text()
    if (text.length === 0) {
      return undefined as unknown as T
    }
    return JSON.parse(text) as T
  }
  return undefined as unknown as T
}

export const apiGet = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'GET' })

export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })

export const apiPut = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })

/**
 * SSE 流式事件（与后端 app/services/sse_events.py 的 `_format` 对齐）。
 *
 * 后端把每个事件编码为单行 `data: {"event": <type>, "data": <payload>}\n\n`，
 * 心跳为 `: heartbeat\n\n` 注释行。这里解析成结构化对象供 UI 消费。
 */
export interface SseEvent {
  event: 'thinking' | 'content' | 'tool_call' | 'tool_result' | 'done' | 'error'
  data: Record<string, unknown>
}

/**
 * 用 fetch + ReadableStream 解析 SSE 流（兼容 POST 请求体）。
 *
 * EventSource 只支持 GET 且无法自定义 header，而 `/api/chat/send` 是 POST，
 * 因此这里手写 SSE 行解析：按 `\n\n` 切分事件块，提取 `data:` 行并 JSON 解码。
 * 心跳注释行（`: heartbeat`）被忽略。
 *
 * `onEvent` 在每个事件解析后回调；返回的 Promise 在流关闭（网络结束或 done/error
 * 事件）时 resolve，抛出的异常由调用方捕获（用于断连重连判定）。
 */
export async function streamSse(
  path: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = `请求失败 ${response.status}`
    try {
      const parsed = JSON.parse(text)
      if (parsed?.detail) message = parsed.detail
    } catch {
      if (text) message = `请求失败 ${response.status}: ${text}`
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('响应不支持流式读取')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 事件以空行（\n\n）分隔；逐块解析已完整的事件。
      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const rawBlock = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const event = parseSseBlock(rawBlock)
        if (event) onEvent(event)
        sep = buffer.indexOf('\n\n')
      }
    }
    // flush 残留缓冲（无尾随空行的事件）
    const tail = buffer.trim()
    if (tail) {
      const event = parseSseBlock(tail)
      if (event) onEvent(event)
    }
  } finally {
    reader.releaseLock()
  }
}

/** 解析单个 SSE 事件块为结构化对象；心跳/无效块返回 null。 */
function parseSseBlock(block: string): SseEvent | null {
  const dataLines: string[] = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    // 心跳注释行 / 注释行忽略
    if (line.startsWith(':')) continue
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }
  if (dataLines.length === 0) return null
  const payload = dataLines.join('\n')
  try {
    const obj = JSON.parse(payload) as SseEvent
    if (obj && typeof obj.event === 'string' && obj.data) {
      return obj
    }
  } catch {
    // 非 JSON（如裸 [DONE]）忽略
  }
  return null
}

export const apiDelete = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' })

/**
 * 文件上传（multipart/form-data）。body 为 FormData 时由浏览器自动设置
 * Content-Type 与 boundary，因此这里不覆盖 headers 中的 Content-Type。
 * 后端 POST /api/chat/upload 成功返回 201 + JSON，超限返回 413。
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  options?: RequestOptions,
): Promise<T> {
  const { baseURL = BASE_URL, ...init } = options || {}
  const url = `${baseURL}${path}`
  const response = await fetch(url, {
    ...init,
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = `请求失败 ${response.status}`
    try {
      const parsed = JSON.parse(text)
      if (parsed?.detail) message = parsed.detail
    } catch {
      if (text) message = `请求失败 ${response.status}: ${text}`
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }
  const text = await response.text()
  if (text.length === 0) {
    return undefined as unknown as T
  }
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return JSON.parse(text) as T
  }
  return undefined as unknown as T
}
