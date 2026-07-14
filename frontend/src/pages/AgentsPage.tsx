import { LoaderCircle, Bot } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '@/lib/api'

// Agent 列表项：列表页仅展示名称与描述（与 AgentRead 对齐的子集）
interface AgentSummary {
  id: string
  name: string
  description: string
  is_default: boolean
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const loadAgents = useCallback(async () => {
    setIsLoading(true)
    setPageError('')
    try {
      const data = await apiGet<AgentSummary[]>('/agents')
      // 主 Agent 置顶，其余按创建顺序保留
      setAgents(
        [...data].sort((a, b) => {
          if (a.is_default) return -1
          if (b.is_default) return 1
          return 0
        }),
      )
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  return (
    <div className="min-h-full bg-warm-bg">
      <header className="flex min-h-14 items-center border-b border-warm-border px-6 py-3">
        <div>
          <h1 className="text-base font-semibold text-warm-text">Agent 管理</h1>
          <p className="mt-0.5 text-sm text-warm-text-muted">
            点击 Agent 名称进入详情编辑，配置系统提示词、工具与技能
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
            正在加载 Agent 列表…
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-warm border border-dashed border-warm-border bg-white px-6 py-16 text-center shadow-warm">
            <Bot className="mx-auto mb-3 text-warm-text-muted" size={32} />
            <p className="font-medium text-warm-text">还没有 Agent 配置</p>
            <p className="mt-1 text-sm text-warm-text-muted">系统应在启动时自动初始化主 Agent。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <article
                key={agent.id}
                className="rounded-warm border border-warm-border bg-white p-4 shadow-warm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-warm bg-warm-orange-light text-warm-orange">
                    <Bot size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-medium text-warm-text">
                      {/* 点击名称进入详情编辑页；列表页不提供编辑按钮 */}
                      <Link
                        to={`/agents/${agent.id}`}
                        className="text-warm-text hover:text-warm-orange hover:underline"
                      >
                        {agent.name}
                      </Link>
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-warm-text-muted">
                      {agent.description || '暂无描述'}
                    </p>
                  </div>
                </div>
                {agent.is_default && (
                  <p className="mt-3 border-t border-warm-border pt-3 text-xs text-warm-orange">
                    主 Agent（不可删除）
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
