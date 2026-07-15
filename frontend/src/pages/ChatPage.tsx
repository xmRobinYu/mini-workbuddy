import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Info,
  LoaderCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  streamSse,
  type SseEvent,
} from '@/lib/api'

// 会话摘要（与后端 ConversationSummary 对齐）
interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

// 单条交互记录（后端 events 数组中的原始 JSON 对象）
interface ConversationEvent {
  role?: string
  type?: string
  data?: { text?: string } & Record<string, unknown>
  tool_call_id?: string
  timestamp?: string
  [key: string]: unknown
}

// Agent 摘要（GET /api/agents 列表项子集，与 AgentRead 对齐）
interface AgentSummary {
  id: string
  name: string
  is_default: boolean
}

// OpenAI wire-shape 工具调用（与后端 agent_loop 的 wire_tool_calls 对齐）
interface WireToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

type StreamingItem =
  | { kind: 'thinking'; text: string }
  | { kind: 'content'; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      args: unknown
      result?: string
      ok?: boolean
    }

// 会话详情（GET /api/conversations/{id}）
interface ConversationDetail extends ConversationSummary {
  events: ConversationEvent[]
}

// 输出文件（GET /api/conversations/{id}/outputs，与后端 OutputFile 对齐）
interface OutputFile {
  filename: string
  size: number
  modified_at: string
}

// 上传文件响应（POST /api/chat/upload，与后端 UploadedFile 对齐）
interface UploadedFile {
  filename: string
  stored_filename: string
  size: number
  path: string
  content_type: string
}

// 单文件上传上限：5MB（与后端 MAX_UPLOAD_BYTES 对齐）
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** 判断文件名扩展名是否属于可在面板内直接预览的文本类文件。 */
const TEXT_PREVIEW_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'csv', 'tsv', 'log',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h',
  'cpp', 'hpp', 'css', 'scss', 'html', 'htm', 'xml', 'sh', 'bash', 'sql',
  'ini', 'toml', 'conf', 'env', 'gitignore', 'dockerfile',
])

function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile')) return true
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return TEXT_PREVIEW_EXTENSIONS.has(lower.slice(dot + 1))
}

/** 人类可读的文件大小展示。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

/**
 * 在会话事件中查找某次 tool_call 对应的 tool_result 持久事件。
 * 用于把历史 tool_call 卡片与其返回结果配对渲染（按 tool_call_id）。
 */
function findToolResult(
  detail: ConversationDetail | null,
  toolCallId: string,
): ConversationEvent | undefined {
  if (!detail || !toolCallId) return undefined
  return detail.events.find(
    (e) =>
      e.role === 'tool' &&
      e.type === 'tool_result' &&
      e.tool_call_id === toolCallId,
  )
}

/** 将 ISO-8601 UTC 时间格式化为简短的本地展示串。 */
function formatTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // 统一显示 月/日 时:分
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

/**
 * Agent 思考时的「正在思考...」跳动点动画。
 * 三个点依次延迟跳动，循环播放。
 */
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-warm bg-warm-menu px-3 py-2.5 text-sm text-warm-text-muted">
      <span>正在思考</span>
      <span className="flex items-end gap-0.5">
        <span className="thinking-dot" />
        <span className="thinking-dot" style={{ animationDelay: '0.15s' }} />
        <span className="thinking-dot" style={{ animationDelay: '0.3s' }} />
      </span>
    </div>
  )
}

/**
 * 可折叠容器：用于 thinking 推理区与工具结果区。
 * 标题行点击切换展开/收起；内容区默认收起。
 */
function CollapsibleBlock({
  title,
  collapsedNote,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode
  collapsedNote?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-warm border border-warm-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-warm-text-muted hover:bg-warm-border/30"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {!open && collapsedNote && (
          <span className="ml-2 truncate text-warm-text-muted/70">
            {collapsedNote}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-warm-border px-3 py-2">{children}</div>
      )}
    </div>
  )
}

/**
 * 工具调用卡片：展示工具/技能名称 + 传入参数，下方可挂载工具结果。
 * tool_call 事件实时显示；tool_result 事件在对应工具下方展示返回结果，
 * 较长的结果支持折叠/展开（默认收起，仅展示前几行预览）。
 */
const TOOL_RESULT_PREVIEW_LINES = 4
const TOOL_RESULT_COLLAPSE_THRESHOLD = 6

function ToolCallCard({
  name,
  argumentsObj,
  result,
  ok,
}: {
  name: string
  argumentsObj: unknown
  result?: string
  ok?: boolean
}) {
  const argStr = formatToolArguments(argumentsObj)
  const [expanded, setExpanded] = useState(false)
  const lines = result ? result.split('\n') : []
  const isLong = lines.length > TOOL_RESULT_COLLAPSE_THRESHOLD
  const visibleResult = isLong && !expanded
    ? lines.slice(0, TOOL_RESULT_PREVIEW_LINES).join('\n')
    : result ?? ''

  return (
    <div className="rounded-warm border border-warm-border bg-warm-menu/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-warm-text">
        <Wrench size={13} className="shrink-0 text-warm-amber" />
        <span className="truncate">{name}</span>
      </div>
      {argStr && (
        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-warm-text-muted">
          {argStr}
        </pre>
      )}
      {result !== undefined && (
        <div
          className={`mt-2 border-t border-warm-border pt-2 ${
            ok === false ? 'text-red-700' : 'text-warm-text-muted'
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-warm-text-muted">
              {ok === false ? '执行失败' : '返回结果'}
            </span>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-[11px] text-warm-orange hover:underline"
              >
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {expanded ? '收起' : '展开全部'}
              </button>
            )}
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
            {visibleResult}
            {!expanded && isLong ? '\n…' : ''}
          </pre>
        </div>
      )}
    </div>
  )
}

/** 把工具参数对象格式化为可读字符串。 */
function formatToolArguments(args: unknown): string {
  if (args == null) return ''
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

/**
 * 输出文件文本预览：fetch 文件内容并以纯文本展示。
 * 大文件只展示前 200KB 内容，避免浏览器卡顿。
 */
const PREVIEW_MAX_BYTES = 200 * 1024

function TextFilePreview({
  url,
  onError,
}: {
  url: string
  onError: (message: string) => void
}) {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`请求失败 ${res.status}`)
        const text = await res.text()
        return text
      })
      .then((text) => {
        if (cancelled) return
        if (text.length > PREVIEW_MAX_BYTES) {
          setContent(
            text.slice(0, PREVIEW_MAX_BYTES) +
              `\n\n…（文件较大，仅显示前 ${PREVIEW_MAX_BYTES} 字符）`,
          )
        } else {
          setContent(text)
        }
        setIsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        onError(
          error instanceof Error ? error.message : '预览加载失败，请稍后重试',
        )
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, onError])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-warm-text-muted">
        <LoaderCircle className="mr-2 animate-spin" size={16} />
        正在加载预览…
      </div>
    )
  }
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-warm-text">
      {content}
    </pre>
  )
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [pageError, setPageError] = useState('')
  // done 事件 note（如 50 轮降级提示）以暖色横幅展示，区别于红色错误条。
  const [infoNotice, setInfoNotice] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  const [searchKeyword, setSearchKeyword] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // 操作菜单（重命名/删除）状态：展开的会话 id
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  // 正在重命名的会话 id 与输入值
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 待删除确认的会话
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 输入框与发送状态
  const [inputText, setInputText] = useState('')
  // Agent 是否正在思考/回复中（发送按钮据此禁用）
  const [isThinking, setIsThinking] = useState(false)

  // 可选 Agent 列表 + 当前选中的 Agent id（/api/chat/send 需要 agent_id）
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const [streamingItems, setStreamingItems] = useState<StreamingItem[]>([])

  // SSE 中止控制器（切换会话/卸载时取消进行中的流）
  const abortRef = useRef<AbortController | null>(null)

  // 文件上传：待上传的文件（聊天输入框附件）、上传状态与错误提示
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 右侧输出文件面板：当前会话 outputs 文件列表、预览状态
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([])
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false)
  const [previewFile, setPreviewFile] = useState<{
    name: string
    url: string
  } | null>(null)

  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // ── 加载会话列表 ────────────────────────────────────────────────────────
  const loadConversations = async () => {
    setIsLoadingList(true)
    setPageError('')
    try {
      const data = await apiGet<ConversationSummary[]>('/conversations')
      setConversations(data)
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    void loadConversations()
  }, [])

  // 加载 Agent 列表，默认选中主 Agent（is_default）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await apiGet<AgentSummary[]>('/agents')
        if (cancelled) return
        // 主 Agent 置顶
        const sorted = [...data].sort((a, b) => {
          if (a.is_default) return -1
          if (b.is_default) return 1
          return 0
        })
        setAgents(sorted)
        if (!selectedAgentId) {
          const def = sorted.find((a) => a.is_default) ?? sorted[0]
          setSelectedAgentId(def ? def.id : null)
        }
      } catch {
        // Agent 列表加载失败不阻塞聊天；用户仍可发送（无 agent 时给出提示）
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 搜索：关键词非空时调用搜索接口，否则回退到本地列表
  const filteredConversations = useMemo(() => {
    const term = searchKeyword.trim()
    if (!term) return conversations
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(term.toLowerCase()),
    )
  }, [conversations, searchKeyword])

  // 搜索框输入变化时，若关键词非空则调用后端搜索接口
  useEffect(() => {
    const term = searchKeyword.trim()
    if (!term) {
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const handle = setTimeout(async () => {
      try {
        const data = await apiGet<ConversationSummary[]>(
          `/conversations/search?keyword=${encodeURIComponent(term)}`,
        )
        setConversations(data)
      } catch (error) {
        setPageError(errorMessage(error))
      } finally {
        setIsSearching(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [searchKeyword])

  // 关键词清空时重新拉取完整列表
  useEffect(() => {
    if (searchKeyword.trim() === '') {
      void loadConversations()
    }
  }, [searchKeyword])

  // ── 加载会话详情 ────────────────────────────────────────────────────────
  const loadDetail = async (id: string) => {
    setIsLoadingDetail(true)
    try {
      const data = await apiGet<ConversationDetail>(`/conversations/${id}`)
      setDetail(data)
    } catch (error) {
      setDetail(null)
      setPageError(errorMessage(error))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId)
    } else {
      setDetail(null)
    }
  }, [selectedId])

  // 切换/清空会话时：取消进行中的 SSE 流并清空临时缓冲，避免上一会话的
  // 流式片段残留到新会话（断连后通过 loadDetail 从 JSONL 恢复权威状态）。
  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingItems([])
  }, [selectedId])

  // ── 输出文件面板 ──────────────────────────────────────────────────────────
  const loadOutputs = async (id: string) => {
    setIsLoadingOutputs(true)
    try {
      const data = await apiGet<OutputFile[]>(`/conversations/${id}/outputs`)
      setOutputFiles(data)
    } catch (error) {
      // 列表加载失败不清空已有数据，仅静默（错误已在页面顶部 alert 展示）
      setOutputFiles([])
      setPageError(errorMessage(error))
    } finally {
      setIsLoadingOutputs(false)
    }
  }

  // 选中会话时加载输出文件列表；切换/清空会话时重置预览与列表
  useEffect(() => {
    setPreviewFile(null)
    if (selectedId) {
      void loadOutputs(selectedId)
    } else {
      setOutputFiles([])
    }
    // 仅依赖 selectedId：loadOutputs 在切换会话时重新拉取
  }, [selectedId])

  // Agent 新增文件到 outputs 时自动刷新：每 5s 轮询当前会话的输出列表。
  // 轮询是 P0 阶段 SSE 事件驱动尚未落地前的稳妥兜底（Agent Loop 写入 outputs 后刷新）。
  useEffect(() => {
    if (!selectedId) return
    const handle = window.setInterval(() => {
      void loadOutputs(selectedId)
    }, 5000)
    return () => window.clearInterval(handle)
  }, [selectedId])

  // 点击页面其他位置时关闭操作菜单
  useEffect(() => {
    if (!menuOpenId) return
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpenId])

  // 进入重命名模式时聚焦输入框
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // 新消息或思考态变化时，滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [
    detail?.events.length,
    isThinking,
    streamingItems,
  ])

  // ── 新建会话 ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setPageError('')
    try {
      const created = await apiPost<ConversationSummary>('/conversations', {})
      // 列表顶部显示并自动选中
      await loadConversations()
      setSelectedId(created.id)
    } catch (error) {
      setPageError(errorMessage(error))
    }
  }

  // ── 切换会话 ────────────────────────────────────────────────────────────
  const handleSelect = (id: string) => {
    if (renamingId === id) return
    setMenuOpenId(null)
    setSelectedId(id)
  }

  // ── 重命名 ──────────────────────────────────────────────────────────────
  const startRename = (conv: ConversationSummary) => {
    setMenuOpenId(null)
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renamingId) return
    const title = renameValue.trim()
    if (!title) return
    try {
      await apiPut<ConversationSummary>(
        `/conversations/${renamingId}`,
        { title },
      )
      setRenamingId(null)
      await loadConversations()
      if (selectedId === renamingId && detail) {
        setDetail({ ...detail, title })
      }
    } catch (error) {
      setPageError(errorMessage(error))
    }
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  // ── 删除 ────────────────────────────────────────────────────────────────
  const requestDelete = (conv: ConversationSummary) => {
    setMenuOpenId(null)
    setDeletingId(conv.id)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    try {
      await apiDelete(`/conversations/${deletingId}`)
      const removedId = deletingId
      setDeletingId(null)
      await loadConversations()
      if (selectedId === removedId) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (error) {
      setPageError(errorMessage(error))
      setDeletingId(null)
    }
  }

  const cancelDelete = () => setDeletingId(null)

  // ── 文件上传 ──────────────────────────────────────────────────────────────
  // 选择文件时先做前端预校验：超过 5MB 直接给出错误提示，不发请求。
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('')
    const file = event.target.files?.[0]
    // 重置 input 的 value，便于重复选择同一文件
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `文件过大：${formatSize(file.size)}，单文件上限 5 MB`,
      )
      return
    }
    setPendingFile(file)
  }

  const clearPendingFile = () => {
    setPendingFile(null)
    setUploadError('')
  }

  // 真正上传文件到后端 POST /api/chat/upload（携带当前会话 id）
  const handleUpload = async () => {
    if (!pendingFile || !selectedId || isUploading) return
    setIsUploading(true)
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      form.append('conversation_id', selectedId)
      await apiUpload<UploadedFile>('/chat/upload', form)
      setPendingFile(null)
      // 上传成功后刷新输出文件列表（uploads 与 outputs 同目录树，便于即时反馈）
      await loadOutputs(selectedId)
    } catch (error) {
      setUploadError(errorMessage(error))
    } finally {
      setIsUploading(false)
    }
  }

  // 打开文本类输出文件的内联预览（直接 GET /api/conversations/{id}/outputs/{filename}）
  const openPreview = (file: OutputFile) => {
    if (!selectedId) return
    const url = `/api/conversations/${selectedId}/outputs/${encodeURIComponent(file.filename)}`
    setPreviewFile({ name: file.filename, url })
  }

  // 下载任意输出文件（由浏览器原生 download 行为触发）
  const downloadOutput = (file: OutputFile) => {
    if (!selectedId) return
    const url = `/api/conversations/${selectedId}/outputs/${encodeURIComponent(file.filename)}`
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ── 发送消息 ──────────────────────────────────────────────────────────────
  // US-017：通过 fetch streaming 接收 /api/chat/send 的 SSE 事件。
  // content 事件逐字流式追加到 Agent 气泡；thinking 事件作为可折叠推理区；
  // tool_call/tool_result 事件实时显示工具卡片（名称+参数+结果）；
  // 断连时由 loadDetail 从 JSONL 恢复权威会话状态。
  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = inputText.trim()
    // 未选中会话、空输入、或正在思考时不可发送
    if (!selectedId || !detail || !text || isThinking) return
    if (!selectedAgentId) {
      setPageError('请先选择一个 Agent 再发送消息')
      return
    }

    const userEvent: ConversationEvent = {
      role: 'user',
      type: 'message',
      data: { text },
    }
    setDetail({ ...detail, events: [...detail.events, userEvent] })
    setInputText('')

    // 重置流式缓冲，进入思考态
    setStreamingItems([])
    setIsThinking(true)
    setPageError('')
    setInfoNotice('')

    const conversationId = selectedId
    const agentId = selectedAgentId
    const controller = new AbortController()
    abortRef.current = controller

    void (async () => {
      try {
        await streamSse(
          '/chat/send',
          {
            conversation_id: conversationId,
            message: text,
            agent_id: agentId,
            uploaded_file_paths: undefined,
          },
          (evt: SseEvent) => handleSseEvent(evt),
          controller.signal,
        )
        // 流正常结束：从 JSONL 恢复权威状态（含已落盘的 user/assistant/tool 事件）
        await loadDetail(conversationId)
      } catch (error) {
        // 中止（切换会话）不算错误
        if (controller.signal.aborted) return
        // 网络断连等：从 JSONL 恢复已写记录，并提示可重连
        setPageError(
          `${errorMessage(error)}（已从历史记录恢复会话，可重新发送）`,
        )
        await loadDetail(conversationId)
      } finally {
        // 仅当这次请求仍是当前活跃流时才清理思考态
        if (abortRef.current === controller) {
          abortRef.current = null
          setIsThinking(false)
          setStreamingItems([])
        }
      }
    })()
  }

  /** 处理单个 SSE 事件，更新流式缓冲区。 */
  const handleSseEvent = (evt: SseEvent) => {
    const data = evt.data
    switch (evt.event) {
      case 'thinking': {
        const t = (data.text as string) || ''
        setStreamingItems((items) => {
          const last = items.at(-1)
          if (last?.kind === 'thinking') {
            return [...items.slice(0, -1), { kind: 'thinking', text: last.text + t }]
          }
          return [...items, { kind: 'thinking', text: t }]
        })
        break
      }
      case 'content': {
        const t = (data.text as string) || ''
        setStreamingItems((items) => {
          const last = items.at(-1)
          if (last?.kind === 'content') {
            return [...items.slice(0, -1), { kind: 'content', text: last.text + t }]
          }
          return [...items, { kind: 'content', text: t }]
        })
        break
      }
      case 'tool_call': {
        const id = (data.id as string) || ''
        const name = (data.name as string) || '工具'
        const args = data.arguments
        setStreamingItems((items) => {
          const index = items.findIndex(
            (item) => item.kind === 'tool' && item.id === id,
          )
          if (index === -1) return [...items, { kind: 'tool', id, name, args }]
          const current = items[index]
          if (current.kind !== 'tool') return items
          const next = [...items]
          next[index] = { ...current, name, args }
          return next
        })
        break
      }
      case 'tool_result': {
        const id = (data.id as string) || ''
        const name = (data.name as string) || '工具'
        const result = (data.result as string) ?? ''
        const ok = data.ok !== false
        setStreamingItems((items) => {
          const index = items.findIndex(
            (item) => item.kind === 'tool' && item.id === id,
          )
          if (index === -1) {
            return [...items, { kind: 'tool', id, name, args: undefined, result, ok }]
          }
          const current = items[index]
          if (current.kind !== 'tool') return items
          const next = [...items]
          next[index] = { ...current, name, result, ok }
          return next
        })
        break
      }
      case 'error': {
        const msg = (data.message as string) || 'Agent 执行出错'
        setPageError(msg)
        break
      }
      case 'done': {
        // done 事件：流由 streamSse 自然结束，权威状态在 finally 里 loadDetail 恢复。
        // note（如 50 轮降级提示）以暖色横幅展示给用户。
        const note = (data.note as string) || ''
        if (note) setInfoNotice(note)
        break
      }
      default:
        break
    }
  }

  const hasConversation = Boolean(selectedId && detail)

  return (
    <div className="flex h-full">
      {/* 左侧：历史会话列表面板 */}
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-warm-border bg-warm-menu">
        {/* 顶部：新建会话按钮 */}
        <div className="flex items-center gap-2 border-b border-warm-border px-4 py-3">
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex flex-1 items-center justify-center gap-2 rounded-warm bg-warm-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-warm-orange/90"
          >
            <Plus size={16} />
            新建会话
          </button>
        </div>

        {/* 搜索框 */}
        <div className="border-b border-warm-border px-4 py-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-text-muted"
            />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索会话…"
              className="w-full rounded-warm border border-warm-border bg-white py-1.5 pl-8 pr-3 text-sm text-warm-text placeholder:text-warm-text-muted focus:border-warm-orange focus:outline-none"
            />
            {isSearching && (
              <LoaderCircle
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-warm-text-muted"
              />
            )}
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {pageError && (
            <p
              role="alert"
              className="mx-1 mb-2 rounded-warm bg-red-50 px-2 py-1.5 text-xs text-red-700"
            >
              {pageError}
            </p>
          )}
          {isLoadingList ? (
            <div className="flex items-center justify-center py-10 text-sm text-warm-text-muted">
              <LoaderCircle className="mr-2 animate-spin" size={16} />
              正在加载会话列表…
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-warm-text-muted">
              {searchKeyword.trim()
                ? '没有匹配的会话'
                : '暂无会话，点击上方按钮新建'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredConversations.map((conv) => {
                const isActive = conv.id === selectedId
                const isRenaming = conv.id === renamingId
                return (
                  <li
                    key={conv.id}
                    className="group relative"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenuOpenId(conv.id)
                    }}
                  >
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => void submitRename(e)}
                        className="flex items-center gap-1 rounded-warm bg-white px-2 py-1.5 ring-1 ring-warm-orange"
                      >
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={cancelRename}
                          maxLength={200}
                          className="min-w-0 flex-1 rounded-warm border border-warm-border px-2 py-1 text-sm text-warm-text focus:border-warm-orange focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-warm bg-warm-orange px-2 py-1 text-xs text-white hover:bg-warm-orange/90"
                        >
                          确定
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelect(conv.id)}
                        className={`flex w-full items-start gap-2 rounded-warm px-2.5 py-2 text-left transition-colors ${
                          isActive
                            ? 'bg-warm-orange-light text-warm-text'
                            : 'text-warm-text hover:bg-warm-border/50'
                        }`}
                      >
                        <MessageSquare
                          size={15}
                          className="mt-0.5 shrink-0 text-warm-text-muted"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {conv.title || '未命名会话'}
                          </span>
                          <span className="mt-0.5 block text-xs text-warm-text-muted">
                            {formatTime(conv.updated_at)}
                          </span>
                        </span>
                      </button>
                    )}

                    {/* 操作按钮（非重命名时显示） */}
                    {!isRenaming && (
                      <div
                        ref={menuOpenId === conv.id ? menuRef : undefined}
                        className="absolute right-1.5 top-1.5"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(
                              menuOpenId === conv.id ? null : conv.id,
                            )
                          }}
                          className="rounded p-1 text-warm-text-muted opacity-0 transition-opacity hover:bg-warm-border/60 hover:text-warm-text group-hover:opacity-100"
                          aria-label="会话操作"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {menuOpenId === conv.id && (
                          <div className="absolute right-0 top-7 z-10 w-28 overflow-hidden rounded-warm border border-warm-border bg-white py-1 shadow-warm">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                startRename(conv)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-warm-text hover:bg-warm-border/40"
                            >
                              <Pencil size={14} />
                              重命名
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                requestDelete(conv)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 右侧：对话消息区 + 输入框 */}
      <section className="flex flex-1 flex-col bg-warm-bg">
        {isLoadingDetail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-warm-text-muted">
            <LoaderCircle className="mr-2 animate-spin" size={18} />
            正在加载对话内容…
          </div>
        ) : !hasConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <MessageSquare size={40} className="mb-3 text-warm-text-muted" />
            <p className="text-sm text-warm-text-muted">
              选择左侧会话查看对话，或点击「新建会话」开始
            </p>
          </div>
        ) : (
          <>
            <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-warm-border px-6">
              <h1 className="truncate text-base font-semibold text-warm-text">
                {detail?.title || '未命名会话'}
              </h1>
              {/* Agent 选择器：/api/chat/send 需要 agent_id；默认主 Agent */}
              <div className="flex items-center gap-1.5">
                <Bot size={15} className="shrink-0 text-warm-text-muted" />
                <select
                  value={selectedAgentId ?? ''}
                  onChange={(e) => setSelectedAgentId(e.target.value || null)}
                  disabled={isThinking || agents.length === 0}
                  className="max-w-[12rem] rounded-warm border border-warm-border bg-white px-2 py-1 text-xs text-warm-text focus:border-warm-orange focus:outline-none disabled:bg-warm-menu disabled:text-warm-text-muted"
                  title="选择执行此消息的 Agent"
                >
                  {agents.length === 0 && <option value="">无可用 Agent</option>}
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.is_default ? '（主）' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </header>

            {/* 消息列表区 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* done.note 提示横幅（暖色，区别于红色错误条）。可手动关闭。 */}
              {infoNotice && (
                <div className="mb-3 flex items-start gap-2 rounded-warm border border-warm-amber/50 bg-warm-amber/10 px-3 py-2 text-xs text-warm-text">
                  <Info size={14} className="mt-0.5 shrink-0 text-warm-amber" />
                  <span className="flex-1 whitespace-pre-wrap break-words">
                    {infoNotice}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInfoNotice('')}
                    className="shrink-0 text-warm-text-muted hover:text-warm-text"
                    aria-label="关闭提示"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {detail && detail.events.length === 0 && !isThinking ? (
                <div className="flex h-full items-center justify-center text-sm text-warm-text-muted">
                  暂无对话记录
                </div>
              ) : (
                <ul className="space-y-3">
                  {detail?.events.map((event, index) => {
                    const isUser = event.role === 'user'
                    const text = event.data?.text ?? ''
                    // tool_call 持久事件：渲染为工具卡片（携带历史参数）
                    if (event.role === 'assistant' && event.type === 'tool_call') {
                      const calls = (event.data?.tool_calls as
                        | WireToolCall[]
                        | undefined) ?? []
                      return (
                        <li key={index} className="flex justify-start">
                          <div className="w-full max-w-[80%] space-y-1.5">
                            {text && (
                              <div className="chat-bubble rounded-warm bg-warm-menu px-3 py-2 text-sm text-warm-text">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {text}
                                </ReactMarkdown>
                              </div>
                            )}
                            {calls.map((tc) => {
                              const tcId = tc.id
                              const resultEvent = findToolResult(detail, tcId)
                              let argsParsed: unknown = tc.function?.arguments
                              try {
                                argsParsed = tc.function?.arguments
                                  ? JSON.parse(tc.function.arguments)
                                  : undefined
                              } catch {
                                argsParsed = tc.function?.arguments
                              }
                              return (
                                <ToolCallCard
                                  key={tcId || index}
                                  name={tc.function?.name || '工具'}
                                  argumentsObj={argsParsed}
                                  result={resultEvent?.data?.result as string | undefined}
                                  ok={resultEvent?.data?.ok as boolean | undefined}
                                />
                              )
                            })}
                          </div>
                        </li>
                      )
                    }
                    // tool_result 持久事件已并入对应 tool_call 卡片渲染，跳过独立行
                    if (event.role === 'tool' && event.type === 'tool_result') {
                      return null
                    }
                    // persisted thinking 事件：渲染为可折叠「Agent 思考中…」区域（与最终回复视觉区分）
                    if (
                      event.role === 'assistant' &&
                      event.type === 'thinking'
                    ) {
                      const thinkText = (event.data?.text as string) || ''
                      if (!thinkText) return null
                      return (
                        <li key={index} className="flex justify-start">
                          <div className="w-full max-w-[80%]">
                            <CollapsibleBlock
                              title="Agent 思考中…"
                              collapsedNote={`${thinkText.length} 字推理`}
                            >
                              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-warm-text-muted">
                                {thinkText}
                              </pre>
                            </CollapsibleBlock>
                          </div>
                        </li>
                      )
                    }
                    return (
                      <li
                        key={index}
                        className={`flex ${
                          isUser ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`chat-bubble max-w-[80%] rounded-warm px-3 py-2 text-sm ${
                            isUser
                              ? 'bg-warm-orange text-white'
                              : 'bg-warm-menu text-warm-text'
                          }`}
                        >
                          {/* 用户消息纯文本展示；Agent 消息用 Markdown 渲染 */}
                          {isUser ? (
                            <span className="whitespace-pre-wrap">
                              {text || `（${event.type || event.role || '事件'}）`}
                            </span>
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ className, children, ...props }) {
                                  // 提取语言标识，内联代码不使用高亮器
                                  const match = /language-(\w+)/.exec(
                                    className || '',
                                  )
                                  const codeText = String(children).replace(
                                    /\n$/,
                                    '',
                                  )
                                  if (match) {
                                    return (
                                      <SyntaxHighlighter
                                        language={match[1]}
                                        style={oneLight}
                                        PreTag="div"
                                        customStyle={{
                                          margin: 0,
                                          background: '#f5f5f4',
                                          fontSize: '0.8rem',
                                        }}
                                      >
                                        {codeText}
                                      </SyntaxHighlighter>
                                    )
                                  }
                                  return (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  )
                                },
                              }}
                            >
                              {text || `（${event.type || event.role || '事件'}）`}
                            </ReactMarkdown>
                          )}
                        </div>
                      </li>
                    )
                  })}

                  {/* 流式期间：实时渲染 thinking / content / tool 卡片 */}
                  {isThinking && (
                    <>
                      {streamingItems.map((item, index) => {
                        if (item.kind === 'thinking') {
                          return (
                            <li key={`stream-thinking-${index}`} className="flex justify-start">
                              <div className="w-full max-w-[80%]">
                                <CollapsibleBlock
                                  title="Agent 思考中…"
                                  collapsedNote={`${item.text.length} 字推理`}
                                >
                                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-warm-text-muted">
                                    {item.text}
                                  </pre>
                                </CollapsibleBlock>
                              </div>
                            </li>
                          )
                        }
                        if (item.kind === 'tool') {
                          return (
                            <li key={`stream-tool-${item.id}-${index}`} className="flex justify-start">
                              <div className="w-full max-w-[80%]">
                                <ToolCallCard
                                  name={item.name}
                                  argumentsObj={item.args}
                                  result={item.result}
                                  ok={item.ok}
                                />
                              </div>
                            </li>
                          )
                        }
                        return (
                          <li key={`stream-content-${index}`} className="flex justify-start">
                            <div className="chat-bubble max-w-[80%] rounded-warm bg-warm-menu px-3 py-2 text-sm text-warm-text">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {item.text}
                              </ReactMarkdown>
                            </div>
                          </li>
                        )
                      })}

                      {streamingItems.length === 0 && (
                        <li className="flex justify-start">
                          <ThinkingIndicator />
                        </li>
                      )}
                    </>
                  )}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入框区：在下方，有发送按钮，不支持回车发送 */}
            <footer className="flex-shrink-0 border-t border-warm-border px-6 py-3">
              <form
                onSubmit={(e) => void handleSend(e)}
                className="flex items-end gap-2"
              >
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    // 明确不支持回车发送：回车换行，提交只能点发送按钮
                    if (e.key === 'Enter' && !e.shiftKey) {
                      // 允许默认换行行为，不触发发送
                    }
                  }}
                  rows={2}
                  placeholder={
                    !hasConversation
                      ? '请先选择或新建会话'
                      : !selectedAgentId
                        ? '请先在顶部选择一个 Agent'
                        : '输入消息，点击发送按钮发送（回车换行）…'
                  }
                  disabled={!hasConversation}
                  className="min-h-[2.5rem] flex-1 resize-none rounded-warm border border-warm-border bg-white px-3 py-2 text-sm text-warm-text placeholder:text-warm-text-muted focus:border-warm-orange focus:outline-none disabled:bg-warm-menu disabled:text-warm-text-muted"
                />
                {/* 文件上传按钮：选择文本/代码文件作为上下文 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e)}
                  disabled={!hasConversation || isUploading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!hasConversation || isUploading}
                  aria-label="上传文件"
                  title="上传文件（单文件上限 5 MB）"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-warm border border-warm-border bg-white text-warm-text transition-colors hover:bg-warm-border/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <Upload size={18} />
                  )}
                </button>
                <button
                  type="submit"
                  disabled={
                    !hasConversation || isThinking || !inputText.trim() || !selectedAgentId
                  }
                  aria-label="发送消息"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-warm bg-warm-orange text-white transition-colors hover:bg-warm-orange/90 disabled:cursor-not-allowed disabled:bg-warm-border disabled:text-warm-text-muted"
                >
                  {isThinking ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <SendHorizontal size={18} />
                  )}
                </button>
              </form>

              {/* 待上传文件预览条 / 上传错误提示 */}
              {(pendingFile || uploadError) && (
                <div className="mt-2">
                  {pendingFile && (
                    <div className="flex items-center gap-2 rounded-warm border border-warm-border bg-warm-menu px-3 py-1.5 text-xs text-warm-text">
                      <FileText size={14} className="shrink-0 text-warm-orange" />
                      <span className="min-w-0 flex-1 truncate">
                        {pendingFile.name}
                        <span className="ml-1 text-warm-text-muted">
                          （{formatSize(pendingFile.size)}）
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleUpload()}
                        disabled={isUploading}
                        className="rounded-warm bg-warm-orange px-2 py-0.5 text-white hover:bg-warm-orange/90 disabled:opacity-50"
                      >
                        上传
                      </button>
                      <button
                        type="button"
                        onClick={clearPendingFile}
                        aria-label="移除文件"
                        className="rounded p-0.5 text-warm-text-muted hover:bg-warm-border/60 hover:text-warm-text"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {uploadError && (
                    <p
                      role="alert"
                      className="rounded-warm bg-red-50 px-3 py-1.5 text-xs text-red-700"
                    >
                      {uploadError}
                    </p>
                  )}
                </div>
              )}
            </footer>
          </>
        )}
      </section>

      {/* 右侧：输出文件面板 */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-l border-warm-border bg-warm-menu">
        <header className="flex h-14 flex-shrink-0 items-center border-b border-warm-border px-4">
          <h2 className="text-sm font-semibold text-warm-text">输出文件</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!hasConversation ? (
            <p className="px-1 py-10 text-center text-xs text-warm-text-muted">
              选择会话后查看输出文件
            </p>
          ) : isLoadingOutputs && outputFiles.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-xs text-warm-text-muted">
              <LoaderCircle className="mr-2 animate-spin" size={14} />
              正在加载…
            </div>
          ) : outputFiles.length === 0 ? (
            <p className="px-1 py-10 text-center text-xs text-warm-text-muted">
              暂无输出文件
            </p>
          ) : (
            <ul className="space-y-1.5">
              {outputFiles.map((file) => {
                const previewable = isTextFile(file.filename)
                return (
                  <li
                    key={file.filename}
                    className="group rounded-warm border border-warm-border bg-white px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <FileText
                        size={15}
                        className="mt-0.5 shrink-0 text-warm-text-muted"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-warm-text"
                          title={file.filename}
                        >
                          {file.filename}
                        </p>
                        <p className="mt-0.5 text-[11px] text-warm-text-muted">
                          {formatSize(file.size)} · {formatTime(file.modified_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(file)}
                        disabled={!previewable}
                        className="flex items-center gap-1 rounded-warm px-1.5 py-0.5 text-[11px] text-warm-text hover:bg-warm-border/40 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          previewable ? '预览' : '该文件类型不支持预览'
                        }
                      >
                        <Eye size={12} />
                        预览
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadOutput(file)}
                        className="flex items-center gap-1 rounded-warm px-1.5 py-0.5 text-[11px] text-warm-text hover:bg-warm-border/40"
                        title="下载"
                      >
                        <Download size={12} />
                        下载
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 输出文件文本预览弹窗 */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-warm bg-white shadow-warm"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-warm-border px-4">
              <h2
                className="truncate text-sm font-semibold text-warm-text"
                title={previewFile.name}
              >
                {previewFile.name}
              </h2>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                aria-label="关闭预览"
                className="rounded p-1 text-warm-text-muted hover:bg-warm-border/40 hover:text-warm-text"
              >
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <TextFilePreview
                url={previewFile.url}
                onError={(msg) => setPageError(msg)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 删除二次确认弹窗 */}
      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={cancelDelete}
        >
          <div
            className="w-80 rounded-warm bg-white p-5 shadow-warm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-warm-text">
              删除会话
            </h2>
            <p className="mt-2 text-sm text-warm-text-muted">
              确认删除该会话？将同时删除其 JSONL 文件及 outputs 目录，此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-warm border border-warm-border px-3 py-1.5 text-sm text-warm-text hover:bg-warm-border/40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded-warm bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
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
