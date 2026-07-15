import { FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Pencil, Plus, Trash2, Wifi } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api'

type ModelProvider = 'deepseek' | 'alibaba' | 'custom'

interface Model {
  id: string
  name: string
  provider: ModelProvider
  base_url: string
  context_window_tokens: number
}

interface ModelTestResult {
  success: boolean
  latency_ms: number | null
  error: string | null
}

interface ModelFormValues {
  name: string
  provider: ModelProvider
  base_url: string
  api_key: string
  api_key_env: string
  context_window_tokens: string
}

const emptyForm: ModelFormValues = {
  name: '',
  provider: 'deepseek',
  base_url: '',
  api_key: '',
  api_key_env: '',
  context_window_tokens: '32768',
}

const providerLabels: Record<ModelProvider, string> = {
  deepseek: 'DeepSeek',
  alibaba: '阿里云百炼',
  custom: '自定义',
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [form, setForm] = useState<ModelFormValues>(emptyForm)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [deletingModel, setDeletingModel] = useState<Model | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ModelTestResult>>({})

  const loadModels = useCallback(async () => {
    setIsLoading(true)
    setPageError('')
    try {
      setModels(await apiGet<Model[]>('/models'))
    } catch (error) {
      setPageError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const openCreateModal = () => {
    setEditingModel(null)
    setForm(emptyForm)
    setFormError('')
    setIsModalOpen(true)
  }

  const openEditModal = (model: Model) => {
    setEditingModel(model)
    setForm({
      name: model.name,
      provider: model.provider,
      base_url: model.base_url,
      api_key: '',
      api_key_env: '',
      context_window_tokens: String(model.context_window_tokens),
    })
    setFormError('')
    setIsModalOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setFormError('')
    const payload = {
      ...form,
      api_key_env: form.api_key_env || undefined,
      context_window_tokens: Number(form.context_window_tokens),
    }

    try {
      if (editingModel) {
        const { api_key, ...updatePayload } = payload
        await apiPut<Model>(`/models/${editingModel.id}`, api_key ? payload : updatePayload)
      } else {
        await apiPost<Model>('/models', payload)
      }
      setIsModalOpen(false)
      await loadModels()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const testConnection = async (model: Model) => {
    setTestingId(model.id)
    try {
      const result = await apiPost<ModelTestResult>(`/models/${model.id}/test`)
      setTestResults((current) => ({ ...current, [model.id]: result }))
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [model.id]: { success: false, latency_ms: null, error: errorMessage(error) },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const deleteModel = async () => {
    if (!deletingModel) return
    try {
      await apiDelete(`/models/${deletingModel.id}`)
      setDeletingModel(null)
      await loadModels()
    } catch (error) {
      setPageError(errorMessage(error))
      setDeletingModel(null)
    }
  }

  return (
    <div className="min-h-full bg-warm-bg">
      <header className="flex min-h-14 items-center justify-between border-b border-warm-border px-6 py-3">
        <div>
          <h1 className="text-base font-semibold text-warm-text">模型管理</h1>
          <p className="mt-0.5 text-sm text-warm-text-muted">配置并测试可供 Agent 使用的大模型</p>
        </div>
        <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-3 py-2 text-sm font-medium text-white shadow-warm hover:bg-orange-700">
          <Plus size={16} />
          新增模型
        </button>
      </header>

      <div className="p-6">
        {pageError && <p role="alert" className="mb-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p>}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-warm-text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />正在加载模型配置…</div>
        ) : models.length === 0 ? (
          <div className="rounded-warm border border-dashed border-warm-border bg-white px-6 py-16 text-center shadow-warm">
            <Wifi className="mx-auto mb-3 text-warm-text-muted" size={32} />
            <p className="font-medium text-warm-text">还没有模型配置</p>
            <p className="mt-1 text-sm text-warm-text-muted">添加一个模型后，即可在 Agent 中选择使用。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((model) => {
              const result = testResults[model.id]
              const isTesting = testingId === model.id
              return (
                <article key={model.id} className="rounded-warm border border-warm-border bg-white p-4 shadow-warm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium text-warm-text">{model.name}</h2>
                      <span className="mt-2 inline-block rounded bg-warm-orange-light px-2 py-0.5 text-xs text-warm-orange">{providerLabels[model.provider]}</span>
                    </div>
                    <span className="shrink-0 text-xs text-warm-text-muted">{model.context_window_tokens.toLocaleString()} tokens</span>
                  </div>
                  <p className="mt-4 truncate text-sm text-warm-text-muted" title={model.base_url}>{model.base_url}</p>
                  {result && <p role="status" className={`mt-3 rounded-warm px-2.5 py-2 text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{result.success ? `连接成功，延迟 ${result.latency_ms ?? 0} ms` : `连接失败：${result.error ?? '未知错误'}`}</p>}
                  <div className="mt-4 flex gap-2 border-t border-warm-border pt-3">
                    <button type="button" onClick={() => void testConnection(model)} disabled={isTesting} className="inline-flex items-center gap-1.5 rounded-warm border border-warm-border px-2.5 py-1.5 text-sm text-warm-text hover:bg-warm-menu disabled:cursor-not-allowed disabled:opacity-60">
                      {isTesting ? <LoaderCircle className="animate-spin" size={15} /> : <Wifi size={15} />}{isTesting ? '测试中' : '测试连接'}
                    </button>
                    <button type="button" onClick={() => openEditModal(model)} aria-label={`编辑 ${model.name}`} className="rounded-warm p-1.5 text-warm-text-muted hover:bg-warm-menu hover:text-warm-text"><Pencil size={16} /></button>
                    <button type="button" onClick={() => setDeletingModel(model)} aria-label={`删除 ${model.name}`} className="rounded-warm p-1.5 text-warm-text-muted hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/30 p-4" role="dialog" aria-modal="true" aria-labelledby="model-form-title">
          <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-lg rounded-warm bg-white p-6 shadow-xl">
            <h2 id="model-form-title" className="text-lg font-semibold text-warm-text">{editingModel ? '编辑模型' : '新增模型'}</h2>
            <div className="mt-5 grid gap-4">
              <FormField label="名称"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="form-input" placeholder="例如：DeepSeek Chat" /></FormField>
              <FormField label="供应商"><select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as ModelProvider })} className="form-input"><option value="deepseek">DeepSeek</option><option value="alibaba">阿里云百炼</option><option value="custom">自定义</option></select></FormField>
              <FormField label="Base URL"><input required type="url" value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} className="form-input" placeholder="https://api.example.com/v1" /></FormField>
              <FormField label={editingModel ? 'API Key（留空则保持不变）' : 'API Key'}><input required={!editingModel} type="password" autoComplete="off" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} className="form-input" placeholder="仅安全存入系统密钥链" /></FormField>
              <FormField label="API Key 环境变量（可选）"><input value={form.api_key_env} onChange={(event) => setForm({ ...form, api_key_env: event.target.value })} className="form-input" placeholder="密钥链不可用时使用" /></FormField>
              <FormField label="上下文窗口（tokens）"><input required min="1" type="number" value={form.context_window_tokens} onChange={(event) => setForm({ ...form, context_window_tokens: event.target.value })} className="form-input" /></FormField>
            </div>
            {formError && <p role="alert" className="mt-4 rounded-warm bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-warm px-3 py-2 text-sm text-warm-text-muted hover:bg-warm-menu">取消</button><button disabled={isSaving} type="submit" className="inline-flex items-center gap-2 rounded-warm bg-warm-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{isSaving ? '保存中' : '保存'}</button></div>
          </form>
        </div>
      )}

      {deletingModel && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/30 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
          <div className="w-full max-w-sm rounded-warm bg-white p-6 shadow-xl"><h2 id="delete-model-title" className="text-lg font-semibold text-warm-text">删除模型配置？</h2><p className="mt-2 text-sm text-warm-text-muted">将删除“{deletingModel.name}”及其保存的密钥，此操作无法撤销。</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDeletingModel(null)} className="rounded-warm px-3 py-2 text-sm text-warm-text-muted hover:bg-warm-menu">取消</button><button type="button" onClick={() => void deleteModel()} className="rounded-warm bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">确认删除</button></div></div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-warm-text">{label}{children}</label>
}
