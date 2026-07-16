import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Cpu, CheckCircle2, AlertCircle, TestTube, Pencil, Trash2, Star, Loader2, Zap, FileText,
} from "lucide-react";
import { mockTestModel, formatSince, type MockTestResult } from "@/lib/mock-test";
import { TestDetailDialog } from "@/components/test-detail-dialog";
import { validateModel } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { modelsStore, useStore, uid, recordHistory, type Model } from "@/lib/mock-store";
import { EmptyState, FieldHint } from "@/components/empty-state";

type ModelsSearch = {
  q?: string;
  filter?: string;
  sort?: string;
  order?: "asc" | "desc";
};

const MODEL_FILTERS = ["全部", "正常", "异常", "未测试", "默认"] as const;
const MODEL_SORTS = [
  { value: "name", label: "名称" },
  { value: "provider", label: "供应商" },
  { value: "status", label: "状态" },
];

export const Route = createFileRoute("/models")({
  validateSearch: (s: Record<string, unknown>): ModelsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  component: ModelsPage,
});


const emptyModel: Omit<Model, "id"> = {
  name: "", provider: "", baseUrl: "", modelId: "", apiKey: "",
  context: "128k", status: "warn",
};

function ModelsPage() {
  const models = useStore(modelsStore);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const sort = search.sort ?? "name";
  const order = search.order ?? "asc";
  const hasQuery = !!(search.q || search.filter || search.sort || search.order);

  const patch = (p: Partial<ModelsSearch>) =>
    navigate({
      search: (prev: ModelsSearch) => {
        const next = { ...prev, ...p };
        (Object.keys(next) as (keyof ModelsSearch)[]).forEach((k) => {
          if (next[k] === "" || next[k] == null) delete next[k];
        });
        return next;
      },
    });

  const [editing, setEditing] = useState<Model | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Model | null>(null);
  const [results, setResults] = useState<Record<string, MockTestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [bulkTesting, setBulkTesting] = useState(false);
  const [detailFor, setDetailFor] = useState<Model | null>(null);


  const okCount = models.filter((m) => m.status === "ok").length;
  const errCount = models.filter((m) => m.status === "error").length;

  function openNew() {
    setEditing({ ...emptyModel, id: "" });
    setOpen(true);
  }
  function openEdit(m: Model) {
    setEditing(m);
    setOpen(true);
  }
  function save(m: Model) {
    if (!m.name.trim() || !m.baseUrl.trim() || !m.modelId.trim()) {
      toast.error("请填写名称、Base URL 和 Model ID");
      return;
    }
    if (m.id) {
      modelsStore.replace((x) => x.id === m.id, m);
      recordHistory("models", `编辑模型「${m.name}」`);
      toast.success("模型已更新");
    } else {
      modelsStore.add({ ...m, id: uid() });
      recordHistory("models", `新增模型「${m.name}」`);
      toast.success("模型已新增");
    }
    setOpen(false);
  }
  function setDefault(m: Model) {
    modelsStore.set(models.map((x) => ({ ...x, default: x.id === m.id })));
    recordHistory("models", `设为默认：${m.name}`);
    toast.success(`${m.name} 已设为默认`);
  }
  async function testConn(m: Model) {
    setTesting((s) => ({ ...s, [m.id]: true }));
    const r = await mockTestModel({ name: m.name, baseUrl: m.baseUrl, apiKey: m.apiKey, modelId: m.modelId });
    setResults((s) => ({ ...s, [m.id]: r }));
    modelsStore.update((x) => x.id === m.id, { status: r.ok ? "ok" : "error" });
    setTesting((s) => {
      const n = { ...s };
      delete n[m.id];
      return n;
    });
    recordHistory("models", `${r.ok ? "连接测试通过" : "连接测试失败"}：${m.name}`);
    if (r.ok) toast.success(`${m.name} · ${r.latency}ms`, { description: r.message });
    else toast.error(`${m.name} 连接失败`, { description: r.message });
    return r;
  }
  async function testAll() {
    if (bulkTesting || filtered.length === 0) return;
    setBulkTesting(true);
    const rs = await Promise.all(filtered.map((m) => testConn(m)));
    const okN = rs.filter((r) => r.ok).length;
    setBulkTesting(false);
    toast.info(`测试完成 · 成功 ${okN} / ${rs.length}`);
  }
  function remove(m: Model) {
    modelsStore.remove((x) => x.id === m.id);
    recordHistory("models", `删除模型「${m.name}」`);
    toast.success("已删除");
    setToDelete(null);
  }


  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = models.filter((m) => {
      if (kw && !`${m.name} ${m.provider} ${m.modelId} ${m.baseUrl}`.toLowerCase().includes(kw)) return false;
      if (filter === "正常") return m.status === "ok";
      if (filter === "异常") return m.status === "error";
      if (filter === "未测试") return m.status === "warn";
      if (filter === "默认") return !!m.default;
      return true;
    });
    const statusRank = { ok: 0, warn: 1, error: 2 } as const;
    arr = [...arr].sort((a, b) => {
      let c = 0;
      if (sort === "provider") c = a.provider.localeCompare(b.provider, "zh");
      else if (sort === "status") c = statusRank[a.status] - statusRank[b.status];
      else c = a.name.localeCompare(b.name, "zh");
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [models, q, filter, sort, order]);


  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="模型"
        subtitle="接入任意兼容 OpenAI 协议的服务，配置 baseUrl 与 apiKey，支持多供应商切换。"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={testAll} disabled={bulkTesting || filtered.length === 0} className="gap-2">
              {bulkTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              一键测试{filtered.length ? ` (${filtered.length})` : ""}
            </Button>
            <Button onClick={openNew} className="gap-2 bg-brand text-brand-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> 新增模型
            </Button>
          </div>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="模型总数" value={String(models.length)} hint={`其中 ${models.filter((m) => m.default).length} 个默认`} />
        <StatCard label="健康" value={String(okCount)} hint="连接测试通过" tone="success" />
        <StatCard label="异常" value={String(errCount)} hint="需要检查配置" tone="destructive" />
      </div>

      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(v) => patch({ q: v || undefined })}
          filters={MODEL_FILTERS}
          activeFilter={filter}
          onFilterChange={(v) => patch({ filter: v === "全部" ? undefined : v })}
          sortOptions={MODEL_SORTS}
          sort={sort}
          order={order}
          onSortChange={(v) => patch({ sort: v === "name" ? undefined : v })}
          onOrderChange={(v) => patch({ order: v === "asc" ? undefined : v })}
          placeholder="搜索模型 / 供应商 / model id..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as ModelsSearch })}
        />
        <div className="mt-2 text-[11px] text-muted-foreground">
          {filtered.length} / {models.length}
        </div>
      </div>

      <div className="card-warm mt-3 overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.8fr_auto] items-center gap-4 border-b border-border bg-surface/60 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div>模型名称</div>
          <div>供应商</div>
          <div>Base URL</div>
          <div>上下文</div>
          <div>状态</div>
          <div className="w-24 text-right">操作</div>
        </div>
        {filtered.length === 0 && (
          <div className="p-4">
            {models.length === 0 ? (
              <EmptyState
                icon={Cpu}
                title="尚未配置模型"
                description="添加 OpenAI 兼容协议的服务端点即可使用。至少需要 Base URL、Model ID 与 API Key。"
                action={
                  <Button size="sm" onClick={openNew} className="gap-1.5 bg-brand text-brand-foreground hover:opacity-90">
                    <Plus className="h-3.5 w-3.5" /> 新增模型
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="没有符合条件的模型"
                description="调整搜索关键词或筛选条件后重试。"
              />
            )}
          </div>
        )}
        {filtered.map((m) => (

          <div
            key={m.id}
            className="group grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.8fr_auto] items-center gap-4 border-b border-border/60 px-4 py-3 text-sm last:border-b-0 hover:bg-accent/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Cpu className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{m.name}</span>
                  {m.default && (
                    <Badge className="h-4 rounded-sm bg-brand px-1 text-[9px] font-normal text-brand-foreground hover:bg-brand">
                      默认
                    </Badge>
                  )}
                </div>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{m.modelId}</span>
              </div>
            </div>
            <div className="text-muted-foreground text-[13px] truncate">{m.provider}</div>
            <div className="truncate font-mono text-[12px] text-muted-foreground">{m.baseUrl}</div>
            <div className="text-muted-foreground text-[13px]">{m.context}</div>
            <div className="min-w-0">
              {m.status === "ok" && (
                <span className="flex items-center gap-1 text-[12px] text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 正常
                </span>
              )}
              {m.status === "warn" && (
                <span className="flex items-center gap-1 text-[12px] text-warning">
                  <AlertCircle className="h-3.5 w-3.5" /> 未测试
                </span>
              )}
              {m.status === "error" && (
                <span className="flex items-center gap-1 text-[12px] text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" /> 异常
                </span>
              )}
              {results[m.id] && (
                <button
                  type="button"
                  onClick={() => setDetailFor(m)}
                  className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground hover:text-brand"
                  title={results[m.id].message}
                >
                  {results[m.id].latency}ms · {formatSince(results[m.id].ts)}
                  <FileText className="h-3 w-3" />
                  <span className="underline-offset-2 hover:underline">详情</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="测试连接" disabled={!!testing[m.id]} onClick={() => testConn(m)}>
                {testing[m.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="设为默认" disabled={m.default} onClick={() => setDefault(m)}>
                <Star className={`h-3.5 w-3.5 ${m.default ? "fill-brand text-brand" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => openEdit(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="删除" onClick={() => setToDelete(m)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ModelDialog open={open} onOpenChange={setOpen} value={editing} onSave={save} others={models} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 <b>{toDelete?.name}</b> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove(toDelete)}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TestDetailDialog
        open={!!detailFor}
        onOpenChange={(o) => !o && setDetailFor(null)}
        title={detailFor?.name ?? ""}
        subtitle={detailFor ? `${detailFor.provider} · ${detailFor.baseUrl}` : undefined}
        result={detailFor ? results[detailFor.id] ?? null : null}
        retrying={detailFor ? !!testing[detailFor.id] : false}
        onRetry={detailFor ? () => testConn(detailFor) : undefined}
      />
    </div>
  );
}

function ModelDialog({
  open, onOpenChange, value, onSave, others,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Model | null;
  onSave: (m: Model) => void;
  others: Model[];
}) {
  const [form, setForm] = useState<Model>(value ?? ({ ...emptyModel, id: "" } as Model));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useResetOnOpen(open, value, (v) => { setForm(v); setErrors({}); });

  if (!value) return null;
  const isEdit = !!value.id;

  function handleSave() {
    const r = validateModel(form, others);
    setErrors(r.errors);
    if (!r.ok) {
      toast.error(`保存失败：${r.firstMessage}`, { description: r.suggestion });
      return;
    }
    onSave(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑模型" : "新增模型"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="显示名称" hint="用于在列表与调用记录中识别，例如 DeepSeek Chat。" error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DeepSeek Chat" aria-invalid={!!errors.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="供应商" hint="用于分组与筛选。" error={errors.provider}>
              <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="DeepSeek" aria-invalid={!!errors.provider} />
            </Field>
            <Field label="上下文长度" hint="模型允许的最大 tokens，例如 128k。" error={errors.context}>
              <Input value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} placeholder="128k" aria-invalid={!!errors.context} />
            </Field>
          </div>
          <Field label="Base URL" hint="必须以 https:// 开头，兼容 OpenAI Chat Completions 协议。" error={errors.baseUrl}>
            <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" aria-invalid={!!errors.baseUrl} />
          </Field>
          <Field label="Model ID" hint="服务端使用的模型标识符。" error={errors.modelId}>
            <Input className="font-mono" value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })} placeholder="deepseek-chat" aria-invalid={!!errors.modelId} />
          </Field>
          <Field label="API Key" hint="仅保存在本地，不会随配置导出。" error={errors.apiKey}>
            <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." aria-invalid={!!errors.apiKey} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="bg-brand text-brand-foreground hover:opacity-90" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
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


function useResetOnOpen<T>(open: boolean, value: T | null, set: (v: T) => void) {
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    if (value) set(value);
    setSeen(true);
  }
  if (!open && seen) setSeen(false);
}

function StatCard({
  label, value, hint, tone = "default",
}: {
  label: string; value: string; hint: string; tone?: "default" | "success" | "destructive";
}) {
  return (
    <div className="card-warm p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-3xl font-semibold ${
          tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground"
        }`}>{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}
