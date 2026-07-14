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

export const apiDelete = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' })
