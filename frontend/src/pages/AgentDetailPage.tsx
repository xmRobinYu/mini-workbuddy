import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Trash2 } from 'lucide-react'
import { apiDelete, apiGet, apiPut } from '@/lib/api'

// Agent 详情数据（与后端 AgentRead 对齐）
interface AgentDetail {
  id: string
  name: string
  description: string
  is_default: boolean
  model_id: string | null
  tools: string[]
  skills: string[]
  agent_md_path: string
  created_at: string
  updated_at: string
}

// 可勾选的工具项（名称 + 描述 + 是否勾选）
interface ToolOption {
  name: string
  description: string
}

// 可勾选的技能项（名称 + 描述 + id）
interface SkillOption {
  id: string
  name: string
  description: string
}

interface AgentMarkdownResponse {
  content: string
}

// 工具管理页面展示的内置工具；记忆工具与 delegate_task 不在 Agent 工具栏目展示，
// 所有 Agent 默认可用（见 PRD 4.5.2 栏目三的 Ubiquitous 约束）。
const HIDDEN_AGENT_TOOLS = new Set(['save_memory', 'search_memory', 'delegate_task'])

// 内置工具的展示描述（与后端 TOOL_DESCRIPTIONS 对齐；记忆/协作工具不在此列出）
const BUILTIN_TOOL_DESCRIPTIONS: Record<string, string> = {
  read_file: '读取 workspace/ 内指定文件的内容',
  write_file: '向 workspace/ 内指定文件写入或创建内容（单次 ≤ 10MB）',
  execute_command: '在工作目录内执行命令行（受黑名单、超时与输出截断保护）',
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

type TabKey = 'basic' | 'prompt' | 'tools' | 'skills'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'prompt', label: '系统提示词' },
  { key: 'tools', label: '工具配置' },
  { key: 'skills', label: '技能配置' },
]

export default function AgentDetailPage() {
  const { agentId = '' } = useParams<{ agentId: string }>()
  const navigate = useNavigate()

  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  // 基本信息（仅名称与描述可编辑；model_id 与其他参数不可修改）
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [basicError, setBasicError] = useState('')
  const [isSavingBasic, setIsSavingBasic] = useState(false)

  // 系统提示词（agent.md 内容）
  const [agentMd, setAgentMd] = useState('')
  const [promptError, setPromptError] = useState('')
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const [promptDirty, setPromptDirty] = useState(false)

  // 工具/技能勾选状态（本地缓存，切换 Tab 时回填当前 Agent 配置）
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set())
  const [toolsError, setToolsError] = useState('')
  const [isSavingTools, setIsSavingTools] = useState(false)

  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [skillsError, setSkillsError] = useState('')
  const [isSavingSkills, setIsSavingSkills] = useState(false)

  const [deleting, setDeleting] = useState(false)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setPageError('')
    try {
      const data = await apiGet<AgentDetail>(`/agents/${agentId}`)
      setAgent(data)
      setName(data.name)
      setDescription(data.description)
      setSelectedTools(new Set(data.tools))
      setSelectedSkills(new Set(data.skills))
      // 同时拉取 agent.md 内容
      const md = await apiGet<AgentMarkdownResponse>(`/agents/${agentId}/agent-md`)
      setAgentMd(md.content)
      setPromptDirty(false)
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  // 保存基本信息（仅 name + description）
  const handleSaveBasic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!agent) return
    setIsSavingBasic(true)
    setBasicError('')
    try {
      const updated = await apiPut<AgentDetail>(`/agents/${agentId}`, {
        name,
        description,
        model_id: agent.model_id,
        tools: agent.tools,
        skills: agent.skills,
      })
      setAgent(updated)
      setName(updated.name)
      setDescription(updated.description)
    } catch (error) {
      setBasicError(errorMessage(error))
    } finally {
      setIsSavingBasic(false)
    }
  }

  // 保存系统提示词（agent.md）
  const handleSavePrompt = async () => {
    setIsSavingPrompt(true)
    setPromptError('')
    try {
      await apiPut<AgentMarkdownResponse>(`/agents/${agentId}/agent-md`, { content: agentMd })
      setPromptDirty(false)
    } catch (error) {
      setPromptError(errorMessage(error))
    } finally {
      setIsSavingPrompt(false)
    }
  }

  // 保存工具配置
  const handleSaveTools = async () => {
    if (!agent) return
    setIsSavingTools(true)
    setToolsError('')
    try {
      const updated = await apiPut<AgentDetail>(`/agents/${agentId}`, {
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        tools: Array.from(selectedTools),
        skills: agent.skills,
      })
      setAgent(updated)
      setSelectedTools(new Set(updated.tools))
    } catch (error) {
      setToolsError(errorMessage(error))
    } finally {
      setIsSavingTools(false)
    }
  }

  // 保存技能配置
  const handleSaveSkills = async () => {
    if (!agent) return
    setIsSavingSkills(true)
    setSkillsError('')
    try {
      const updated = await apiPut<AgentDetail>(`/agents/${agentId}`, {
        name: agent.name,
        description: agent.description,
        model_id: agent.model_id,
        tools: agent.tools,
        skills: Array.from(selectedSkills),
      })
      setAgent(updated)
      setSelectedSkills(new Set(updated.skills))
    } catch (error) {
      setSkillsError(errorMessage(error))
    } finally {
      setIsSavingSkills(false)
    }
  }

  const handleDelete = async () => {
    try {
      await apiDelete(`/agents/${agentId}`)
      navigate('/agents')
    } catch (error) {
      setPageError(errorMessage(error))
      setDeleting(false)
    }
  }

  const toggleTool = (toolName: string) => {
    setSelectedTools((current) => {
      const next = new Set(current)
      if (next.has(toolName)) next.delete(toolName)
      else next.add(toolName)
      return next
    })
  }

  const toggleSkill = (skillId: string) => {
    setSelectedSkills((current) => {
      const next = new Set(current)
      if (next.has(skillId)) next.delete(skillId)
      else next.add(skillId)
      return next
    })
  }

  // 展示的工具列表：内置工具排除记忆工具与 delegate_task
  const toolOptions: ToolOption[] = Object.keys(BUILTIN_TOOL_DESCRIPTIONS)
    .filter((name) => !HIDDEN_AGENT_TOOLS.has(name))
    .map((name) => ({ name, description: BUILTIN_TOOL_DESCRIPTIONS[name] }))

  // 展示的技能列表：当前 P0 尚无技能管理后端，无已启用技能时展示空状态。
  const skillOptions: SkillOption[] = []

  return (
    <div className="min-h-full bg-warm-bg">
      <header className="flex min-h-14 items-center justify-between border-b border-warm-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/agents')}
            aria-label="返回 Agent 列表"
            className="rounded-warm p-1.5 text-warm-text-muted hover:bg-warm-menu hover:text-warm-text"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-warm-text">
              {agent ? agent.name : 'Agent 详情'}
            </h1>
            <p className="mt-0.5 text-sm text-warm-text-muted">编辑 Agent 的基本信息、系统提示词、工具与技能</p>
          </div>
        </div>
        {/* 删除按钮在详情页右上角；主 Agent 不显示 */}
        {agent && !agent.is_default && (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="inline-flex items-center gap-1.5 rounded-warm border border-warm-border px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            <Trash2 size={15} />
            删除
          </button>
        )}
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
            正在加载 Agent 配置…
          </div>
        ) : !agent ? (
          <div className="rounded-warm border border-dashed border-warm-border bg-white px-6 py-16 text-center shadow-warm">
            <p className="font-medium text-warm-text">未找到该 Agent</p>
          </div>
        ) : (
          <div className="rounded-warm border border-warm-border bg-white shadow-warm">
            {/* Tab 栏目：基本信息 / 系统提示词 / 工具配置 / 技能配置 */}
            <div className="flex border-b border-warm-border" role="tablist" aria-label="Agent 编辑栏目">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-warm-orange text-warm-orange'
                      : 'border-transparent text-warm-text-muted hover:text-warm-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* 栏目一：基本信息（仅名称与描述可编辑） */}
              {activeTab === 'basic' && (
                <form onSubmit={(event) => void handleSaveBasic(event)} className="max-w-xl">
                  <FormField label="名称">
                    <input
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="form-input"
                      placeholder="Agent 名称"
                    />
                  </FormField>
                  <FormField label="描述">
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="form-input min-h-24 resize-y"
                      placeholder="Agent 描述"
                    />
                  </FormField>
                  <FormField label="模型">
                    <input
                      value={agent.model_id ?? ''}
                      disabled
                      className="form-input cursor-not-allowed bg-warm-menu text-warm-text-muted"
                      placeholder="未关联模型"
                    />
                    <span className="mt-1 text-xs text-warm-text-muted">模型与其他参数不可在此修改</span>
                  </FormField>
                  {basicError && (
                    <p role="alert" className="mt-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">
                      {basicError}
                    </p>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
                      disabled={isSavingBasic}
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isSavingBasic && <LoaderCircle className="animate-spin" size={15} />}
                      {isSavingBasic ? '保存中' : '保存'}
                    </button>
                  </div>
                </form>
              )}

              {/* 栏目二：系统提示词（agent.md 内容） */}
              {activeTab === 'prompt' && (
                <div>
                  <p className="mb-3 text-sm text-warm-text-muted">
                    编辑该 Agent 的 <code className="font-mono">agent.md</code> 系统提示词，保存后即生效。
                  </p>
                  <textarea
                    value={agentMd}
                    onChange={(event) => {
                      setAgentMd(event.target.value)
                      setPromptDirty(true)
                    }}
                    className="form-input min-h-96 resize-y font-mono text-sm"
                    spellCheck={false}
                  />
                  {promptError && (
                    <p role="alert" className="mt-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">
                      {promptError}
                    </p>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
                      disabled={isSavingPrompt || !promptDirty}
                      type="button"
                      onClick={() => void handleSavePrompt()}
                      className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isSavingPrompt && <LoaderCircle className="animate-spin" size={15} />}
                      {isSavingPrompt ? '保存中' : '保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* 栏目三：工具配置（全部可用工具，勾选框；记忆工具与 delegate_task 不展示） */}
              {activeTab === 'tools' && (
                <div>
                  <p className="mb-3 text-sm text-warm-text-muted">
                    勾选该 Agent 可使用的内置工具。记忆工具与 delegate_task 对所有 Agent 默认可用，不在列表中展示。
                  </p>
                  <div className="divide-y divide-warm-border rounded-warm border border-warm-border">
                    {toolOptions.map((tool) => {
                      const checked = selectedTools.has(tool.name)
                      return (
                        <label
                          key={tool.name}
                          className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-warm-menu"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTool(tool.name)}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-warm-orange"
                          />
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-medium text-warm-text">{tool.name}</p>
                            <p className="mt-0.5 text-sm text-warm-text-muted">{tool.description}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  {toolsError && (
                    <p role="alert" className="mt-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">
                      {toolsError}
                    </p>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
                      disabled={isSavingTools}
                      type="button"
                      onClick={() => void handleSaveTools()}
                      className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isSavingTools && <LoaderCircle className="animate-spin" size={15} />}
                      {isSavingTools ? '保存中' : '保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* 栏目四：技能配置（全部已启用技能，勾选框） */}
              {activeTab === 'skills' && (
                <div>
                  <p className="mb-3 text-sm text-warm-text-muted">勾选该 Agent 可使用的已启用技能。</p>
                  {skillOptions.length === 0 ? (
                    <div className="rounded-warm border border-dashed border-warm-border px-6 py-12 text-center text-sm text-warm-text-muted">
                      当前还没有已启用的技能
                    </div>
                  ) : (
                    <div className="divide-y divide-warm-border rounded-warm border border-warm-border">
                      {skillOptions.map((skill) => {
                        const checked = selectedSkills.has(skill.id)
                        return (
                          <label
                            key={skill.id}
                            className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-warm-menu"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSkill(skill.id)}
                              className="mt-0.5 h-4 w-4 cursor-pointer accent-warm-orange"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-warm-text">{skill.name}</p>
                              <p className="mt-0.5 text-sm text-warm-text-muted">{skill.description}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {skillsError && (
                    <p role="alert" className="mt-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">
                      {skillsError}
                    </p>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
                      disabled={isSavingSkills || skillOptions.length === 0}
                      type="button"
                      onClick={() => void handleSaveSkills()}
                      className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isSavingSkills && <LoaderCircle className="animate-spin" size={15} />}
                      {isSavingSkills ? '保存中' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 删除二次确认 */}
      {deleting && agent && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-agent-title"
        >
          <div className="w-full max-w-sm rounded-warm bg-white p-6 shadow-xl">
            <h2 id="delete-agent-title" className="text-lg font-semibold text-warm-text">
              删除 Agent？
            </h2>
            <p className="mt-2 text-sm text-warm-text-muted">
              将删除“{agent.name}”及其 agent.md，此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleting(false)}
                className="rounded-warm px-3 py-2 text-sm text-warm-text-muted hover:bg-warm-menu"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-warm bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 grid gap-1.5 text-sm font-medium text-warm-text">
      {label}
      {children}
    </label>
  )
}
