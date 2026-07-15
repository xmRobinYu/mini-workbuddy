import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Wrench } from 'lucide-react'
import { apiGet, apiPut } from '@/lib/api'

// 内置工具集为固定三元组（不可增删），与后端 BUILTIN_TOOL_NAMES 对应
interface BuiltinTool {
  name: string
  description: string
  enabled: boolean
}

interface ToolToggleResponse {
  name: string
  enabled: boolean
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export default function ToolsPage() {
  const [tools, setTools] = useState<BuiltinTool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  // 正在切换中的工具名，用于禁用对应开关防止重复点击
  const [togglingName, setTogglingName] = useState<string | null>(null)

  const loadTools = useCallback(async () => {
    setIsLoading(true)
    setPageError('')
    try {
      setTools(await apiGet<BuiltinTool[]>('/tools'))
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  // 切换启用/禁用：立即调用 PUT /api/tools/{name}/toggle 并就地更新 UI
  const toggleTool = async (tool: BuiltinTool, nextEnabled: boolean) => {
    setTogglingName(tool.name)
    // 乐观更新：先翻转 UI，失败再回滚
    setTools((current) =>
      current.map((t) => (t.name === tool.name ? { ...t, enabled: nextEnabled } : t)),
    )
    try {
      await apiPut<ToolToggleResponse>(`/tools/${tool.name}/toggle`, {
        enabled: nextEnabled,
      })
    } catch (error) {
      // 回滚到原状态并提示
      setTools((current) =>
        current.map((t) => (t.name === tool.name ? { ...t, enabled: !nextEnabled } : t)),
      )
      setPageError(errorMessage(error))
    } finally {
      setTogglingName(null)
    }
  }

  return (
    <div className="min-h-full bg-warm-bg">
      <header className="flex min-h-14 items-center border-b border-warm-border px-6 py-3">
        <div>
          <h1 className="text-base font-semibold text-warm-text">工具管理</h1>
          <p className="mt-0.5 text-sm text-warm-text-muted">
            查看并管理内置工具的启用状态（工具集固定，不可新增或删除）
          </p>
        </div>
      </header>

      <div className="p-6">
        {pageError && (
          <p role="alert" className="mb-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">
            {pageError}
          </p>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-warm-text-muted">
            <LoaderCircle className="mr-2 animate-spin" size={18} />
            正在加载工具配置…
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => {
              const isToggling = togglingName === tool.name
              return (
                <article
                  key={tool.name}
                  className="rounded-warm border border-warm-border bg-white p-4 shadow-warm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-warm bg-warm-orange-light text-warm-orange">
                        <Wrench size={18} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-mono text-sm font-medium text-warm-text">
                          {tool.name}
                        </h2>
                        <p className="mt-1 text-sm text-warm-text-muted">{tool.description}</p>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={tool.enabled}
                      disabled={isToggling}
                      onChange={(next) => void toggleTool(tool, next)}
                      label={`${tool.name} 启用状态`}
                    />
                  </div>
                  <p
                    className={`mt-3 border-t border-warm-border pt-3 text-xs ${
                      tool.enabled ? 'text-green-700' : 'text-warm-text-muted'
                    }`}
                  >
                    {tool.enabled ? '已启用' : '已禁用'}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// 无障碍开关组件：role=switch，支持键盘与 aria-checked
interface ToggleSwitchProps {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}

function ToggleSwitch({ checked, disabled, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warm-orange/40 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-warm-orange' : 'bg-stone-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
