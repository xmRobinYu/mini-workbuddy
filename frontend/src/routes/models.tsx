import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Loader2,
  Pencil,
  Plus,
  Star,
  TestTube,
  Trash2,
  Zap,
} from "lucide-react";
import {
  ApiError,
  modelsApi,
  parseContextWindow,
  type ModelForm,
  type ModelProvider,
  type ModelViewModel,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, FieldHint } from "@/components/empty-state";

type ModelsSearch = { q?: string; filter?: string; sort?: string; order?: "asc" | "desc" };
type TestState = { success: boolean; latency: number | null; error: string | null };

const MODEL_FILTERS = ["全部", "正常", "异常", "未测试", "默认"] as const;
const MODEL_SORTS = [
  { value: "name", label: "名称" },
  { value: "provider", label: "供应商" },
  { value: "status", label: "状态" },
];
const EMPTY_FORM: ModelForm = {
  name: "",
  modelId: "",
  provider: "custom",
  baseUrl: "",
  context: "128k",
  apiKey: "",
  isDefault: false,
};
const PROVIDERS: Array<{ value: ModelProvider; label: string }> = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "alibaba", label: "阿里云百炼" },
  { value: "custom", label: "自定义" },
];

export const Route = createFileRoute("/models")({
  validateSearch: (search: Record<string, unknown>): ModelsSearch => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    order: search.order === "desc" ? "desc" : search.order === "asc" ? "asc" : undefined,
  }),
  component: ModelsPage,
});

function ModelsPage() {
  const [models, setModels] = useState<ModelViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModelViewModel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ModelViewModel | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const sort = search.sort ?? "name";
  const order = search.order ?? "asc";

  const loadModels = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setModels(await modelsApi.list());
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, []);

  const patch = (values: Partial<ModelsSearch>) =>
    navigate({
      search: (previous: ModelsSearch) => {
        const next = { ...previous, ...values };
        (Object.keys(next) as Array<keyof ModelsSearch>).forEach((key) => {
          if (next[key] === "" || next[key] == null) delete next[key];
        });
        return next;
      },
    });

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const statusOf = (model: ModelViewModel) =>
      testResults[model.id]?.success === true ? "ok" : testResults[model.id] ? "error" : "warn";
    return [...models]
      .filter((model) => {
        if (
          keyword &&
          !`${model.name} ${model.provider} ${model.modelId} ${model.baseUrl}`
            .toLowerCase()
            .includes(keyword)
        )
          return false;
        if (filter === "正常") return statusOf(model) === "ok";
        if (filter === "异常") return statusOf(model) === "error";
        if (filter === "未测试") return statusOf(model) === "warn";
        return filter !== "默认" || model.isDefault;
      })
      .sort((left, right) => {
        const rank = { ok: 0, warn: 1, error: 2 };
        const comparison =
          sort === "provider"
            ? left.provider.localeCompare(right.provider, "zh")
            : sort === "status"
              ? rank[statusOf(left)] - rank[statusOf(right)]
              : left.name.localeCompare(right.name, "zh");
        return order === "asc" ? comparison : -comparison;
      });
  }, [filter, models, order, q, sort, testResults]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (model: ModelViewModel) => {
    setEditing(model);
    setDialogOpen(true);
  };

  async function save(form: ModelForm) {
    setSaving(true);
    try {
      if (editing) {
        const updated = await modelsApi.update(editing.id, form);
        setModels((current) => current.map((model) => (model.id === updated.id ? updated : model)));
        toast.success("模型已更新");
      } else {
        const created = await modelsApi.create(form);
        setModels((current) => [
          ...current.map((model) => (form.isDefault ? { ...model, isDefault: false } : model)),
          created,
        ]);
        toast.success("模型已新增");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error("保存失败", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(model: ModelViewModel) {
    try {
      const updated = await modelsApi.setDefault(model.id);
      setModels((current) =>
        current.map((item) => (item.id === updated.id ? updated : { ...item, isDefault: false })),
      );
      toast.success(`${model.name} 已设为默认`);
    } catch (error) {
      toast.error("设置默认模型失败", { description: errorMessage(error) });
    }
  }

  async function testConnection(model: ModelViewModel) {
    setTesting((current) => ({ ...current, [model.id]: true }));
    try {
      const result = await modelsApi.test(model.id);
      const state = { success: result.success, latency: result.latency_ms, error: result.error };
      setTestResults((current) => ({ ...current, [model.id]: state }));
      if (result.success)
        toast.success(`${model.name} 连接成功`, {
          description: result.latency_ms === null ? undefined : `${result.latency_ms}ms`,
        });
      else toast.error(`${model.name} 连接失败`, { description: result.error ?? "未知错误" });
    } catch (error) {
      const message = errorMessage(error);
      setTestResults((current) => ({
        ...current,
        [model.id]: { success: false, latency: null, error: message },
      }));
      toast.error(`${model.name} 测试失败`, { description: message });
    } finally {
      setTesting((current) => ({ ...current, [model.id]: false }));
    }
  }

  async function testAll() {
    await Promise.all(filtered.map(testConnection));
  }

  async function remove(model: ModelViewModel) {
    try {
      await modelsApi.remove(model.id);
      setModels((current) => current.filter((item) => item.id !== model.id));
      setToDelete(null);
      toast.success("已删除");
    } catch (error) {
      toast.error("删除失败", { description: errorMessage(error) });
    }
  }

  const statusOf = (model: ModelViewModel) =>
    testResults[model.id]?.success === true ? "ok" : testResults[model.id] ? "error" : "warn";
  const okCount = models.filter((model) => statusOf(model) === "ok").length;
  const errorCount = models.filter((model) => statusOf(model) === "error").length;
  const hasQuery = Boolean(search.q || search.filter || search.sort || search.order);

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="模型"
        subtitle="接入任意兼容 OpenAI 协议的服务，配置 Base URL 与 API Key，支持多供应商切换。"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void testAll()}
              disabled={loading || filtered.length === 0}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              一键测试{filtered.length ? ` (${filtered.length})` : ""}
            </Button>
            <Button
              onClick={openNew}
              className="gap-2 bg-brand text-brand-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              新增模型
            </Button>
          </div>
        }
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="模型总数"
          value={String(models.length)}
          hint={`其中 ${models.filter((model) => model.isDefault).length} 个默认`}
        />
        <StatCard label="健康" value={String(okCount)} hint="本次连接测试通过" tone="success" />
        <StatCard label="异常" value={String(errorCount)} hint="本次测试失败" tone="destructive" />
      </div>
      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(value) => patch({ q: value || undefined })}
          filters={MODEL_FILTERS}
          activeFilter={filter}
          onFilterChange={(value) => patch({ filter: value === "全部" ? undefined : value })}
          sortOptions={MODEL_SORTS}
          sort={sort}
          order={order}
          onSortChange={(value) => patch({ sort: value === "name" ? undefined : value })}
          onOrderChange={(value) => patch({ order: value === "asc" ? undefined : value })}
          placeholder="搜索模型 / 供应商 / Model ID..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as ModelsSearch })}
        />
        <div className="mt-2 text-[11px] text-muted-foreground">
          {filtered.length} / {models.length}
        </div>
      </div>
      <div className="card-warm mt-3 overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.8fr_0.8fr_auto] items-center gap-4 border-b border-border bg-surface/60 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div>模型名称</div>
          <div>供应商</div>
          <div>Base URL</div>
          <div>API Key</div>
          <div>上下文</div>
          <div>状态</div>
          <div className="w-24 text-right">操作</div>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载真实模型配置…
          </div>
        )}
        {!loading && loadError && (
          <EmptyState
            icon={AlertCircle}
            title="无法加载模型"
            description={loadError}
            action={
              <Button size="sm" onClick={() => void loadModels()}>
                重试
              </Button>
            }
          />
        )}
        {!loading && !loadError && filtered.length === 0 && (
          <div className="p-4">
            <EmptyState
              icon={Cpu}
              title={models.length === 0 ? "尚未配置模型" : "没有符合条件的模型"}
              description={
                models.length === 0
                  ? "添加 OpenAI 兼容服务端点即可使用。"
                  : "调整搜索关键词或筛选条件后重试。"
              }
              action={
                models.length === 0 ? (
                  <Button
                    size="sm"
                    onClick={openNew}
                    className="gap-1.5 bg-brand text-brand-foreground hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增模型
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
        {!loading &&
          !loadError &&
          filtered.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              status={statusOf(model)}
              test={testResults[model.id]}
              testing={Boolean(testing[model.id])}
              onTest={() => void testConnection(model)}
              onDefault={() => void setDefault(model)}
              onEdit={() => openEdit(model)}
              onDelete={() => setToDelete(model)}
            />
          ))}
      </div>
      <ModelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        model={editing}
        saving={saving}
        onSave={save}
      />
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 <b>{toDelete?.name}</b> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && void remove(toDelete)}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ModelRow({
  model,
  status,
  test,
  testing,
  onTest,
  onDefault,
  onEdit,
  onDelete,
}: {
  model: ModelViewModel;
  status: "ok" | "warn" | "error";
  test?: TestState;
  testing: boolean;
  onTest: () => void;
  onDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.8fr_0.8fr_auto] items-center gap-4 border-b border-border/60 px-4 py-3 text-sm last:border-b-0 hover:bg-accent/30">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Cpu className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-foreground">{model.name}</span>
            {model.isDefault && (
              <Badge className="h-4 rounded-sm bg-brand px-1 text-[9px] font-normal text-brand-foreground hover:bg-brand">
                默认
              </Badge>
            )}
          </div>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {model.modelId}
          </span>
        </div>
      </div>
      <div className="truncate text-[13px] text-muted-foreground">{model.provider}</div>
      <div className="truncate font-mono text-[12px] text-muted-foreground">{model.baseUrl}</div>
      <div className="text-[11px] text-muted-foreground">
        {model.apiKeyRef || model.apiKeyEnv ? "密钥已配置" : "密钥未配置"}
      </div>
      <div className="text-[13px] text-muted-foreground">{model.context}</div>
      <div>
        {status === "ok" ? (
          <span className="flex items-center gap-1 text-[12px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            正常
          </span>
        ) : status === "error" ? (
          <span className="text-[12px] text-destructive" title={test?.error ?? ""}>
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            异常
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[12px] text-warning">
            <AlertCircle className="h-3.5 w-3.5" />
            未测试
          </span>
        )}
        {test?.latency !== null && test?.latency !== undefined && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{test.latency}ms</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="测试连接"
          disabled={testing}
          onClick={onTest}
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <TestTube className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="设为默认"
          disabled={model.isDefault}
          onClick={onDefault}
        >
          <Star className={`h-3.5 w-3.5 ${model.isDefault ? "fill-brand text-brand" : ""}`} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="删除"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ModelDialog({
  open,
  onOpenChange,
  model,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModelViewModel | null;
  saving: boolean;
  onSave: (form: ModelForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ModelForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setForm(
        model
          ? {
              name: model.name,
              modelId: model.modelId,
              provider: model.provider as ModelProvider,
              baseUrl: model.baseUrl,
              context: model.context,
              apiKey: "",
              isDefault: model.isDefault,
            }
          : EMPTY_FORM,
      );
      setErrors({});
    }
  }, [model, open]);
  const isEdit = model !== null;
  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "名称不能为空";
    if (!form.modelId.trim()) nextErrors.modelId = "Model ID 不能为空";
    if (!/^https?:\/\/.+/i.test(form.baseUrl.trim())) nextErrors.baseUrl = "必须以 http(s):// 开头";
    if (parseContextWindow(form.context) === null) nextErrors.context = "格式示例：128k / 32k / 1M";
    if (!isEdit && !form.apiKey.trim()) nextErrors.apiKey = "新增模型必须填写 API Key";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await onSave(form);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑模型" : "新增模型"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="显示名称" hint="用于在列表与调用记录中识别。" error={errors.name}>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="DeepSeek Chat"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="供应商">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.provider}
                onChange={(event) =>
                  setForm({ ...form, provider: event.target.value as ModelProvider })
                }
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="上下文长度" hint="例如 128k。" error={errors.context}>
              <Input
                value={form.context}
                onChange={(event) => setForm({ ...form, context: event.target.value })}
                placeholder="128k"
              />
            </Field>
          </div>
          <Field label="Base URL" hint="兼容 OpenAI Chat Completions 协议。" error={errors.baseUrl}>
            <Input
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
              placeholder="https://api.deepseek.com/v1"
            />
          </Field>
          <Field
            label="Model ID"
            hint="映射到后端 model 字段，调用服务时使用。"
            error={errors.modelId}
          >
            <Input
              className="font-mono"
              value={form.modelId}
              onChange={(event) => setForm({ ...form, modelId: event.target.value })}
              placeholder="deepseek-chat"
            />
          </Field>
          <Field
            label="API Key"
            hint={
              isEdit
                ? "留空则保留现有密钥；读取时只显示配置状态。"
                : "仅在提交时发送，后端存入系统密钥链。"
            }
            error={errors.apiKey}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
              placeholder={isEdit ? "已配置（留空不修改）" : "sk-..."}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
            />
            设为默认模型
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={saving}
            className="bg-brand text-brand-foreground hover:opacity-90"
            onClick={() => void submit()}
          >
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <FieldHint>{hint}</FieldHint>
      ) : null}
    </div>
  );
}
function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "destructive";
}) {
  return (
    <div className="card-warm p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`font-display text-3xl font-semibold ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground"}`}
        >
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}
function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "未知错误";
}
