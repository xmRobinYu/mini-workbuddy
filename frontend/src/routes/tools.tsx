import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, PenLine, Terminal, Info, ShieldCheck, Pencil, TestTube, Loader2, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { mockTestTool, formatSince, type MockTestResult } from "@/lib/mock-test";
import { TestDetailDialog } from "@/components/test-detail-dialog";
import { validateTool } from "@/lib/validators";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list-toolbar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toolsStore, useStore, recordHistory, type Tool } from "@/lib/mock-store";
import { EmptyState, FieldHint } from "@/components/empty-state";
import { ConnectorBindingEditor, ConnectorBindingBadge } from "@/components/connector-binding-editor";


type ToolsSearch = { q?: string; filter?: string; sort?: string; order?: "asc" | "desc" };
const TOOL_FILTERS = ["全部", "已启用", "已停用"] as const;
const TOOL_SORTS = [
  { value: "name", label: "名称" },
  { value: "key", label: "Key" },
];

export const Route = createFileRoute("/tools")({
  validateSearch: (s: Record<string, unknown>): ToolsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  component: ToolsPage,
});

const iconMap = { file: FileText, pen: PenLine, terminal: Terminal } as const;

function ToolsPage() {
  const tools = useStore(toolsStore);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const sort = search.sort ?? "name";
  const order = search.order ?? "asc";
  const hasQuery = !!(search.q || search.filter || search.sort || search.order);
  const patch = (p: Partial<ToolsSearch>) =>
    navigate({
      search: (prev: ToolsSearch) => {
        const next = { ...prev, ...p };
        (Object.keys(next) as (keyof ToolsSearch)[]).forEach((k) => {
          if (next[k] === "" || next[k] == null) delete next[k];
        });
        return next;
      },
    });
  const [editing, setEditing] = useState<Tool | null>(null);
  const [results, setResults] = useState<Record<string, MockTestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [bulkTesting, setBulkTesting] = useState(false);
  const [detailFor, setDetailFor] = useState<Tool | null>(null);

  async function testOne(t: Tool) {
    setTesting((s) => ({ ...s, [t.key]: true }));
    const r = await mockTestTool({ key: t.key, name: t.name, enabled: t.enabled });
    setResults((s) => ({ ...s, [t.key]: r }));
    setTesting((s) => {
      const n = { ...s };
      delete n[t.key];
      return n;
    });
    recordHistory("tools", `${r.ok ? "自检通过" : "自检失败"}：${t.name}`);
    if (r.ok) toast.success(`${t.name} · ${r.latency}ms`, { description: r.message });
    else toast.error(`${t.name} 自检失败`, { description: r.message });
    return r;
  }
  async function testAll() {
    if (bulkTesting || filtered.length === 0) return;
    setBulkTesting(true);
    const rs = await Promise.all(filtered.map((t) => testOne(t)));
    const okN = rs.filter((r) => r.ok).length;
    setBulkTesting(false);
    toast.info(`工具自检完成 · 成功 ${okN} / ${rs.length}`);
  }

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = tools.filter((t) => {
      if (kw && !`${t.name} ${t.key} ${t.desc}`.toLowerCase().includes(kw)) return false;
      if (filter === "已启用") return t.enabled;
      if (filter === "已停用") return !t.enabled;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const c = sort === "key"
        ? a.key.localeCompare(b.key)
        : a.name.localeCompare(b.name, "zh");
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [tools, q, filter, sort, order]);

  function toggle(t: Tool, enabled: boolean) {
    toolsStore.update((x) => x.key === t.key, { enabled });
    recordHistory("tools", `${enabled ? "启用" : "停用"}工具「${t.name}」`);
    toast.success(`${t.name} ${enabled ? "已启用" : "已停用"}`);
  }
  function save(t: Tool) {
    if (!t.name.trim() || !t.desc.trim()) {
      toast.error("请填写名称与描述");
      return;
    }
    toolsStore.replace((x) => x.key === t.key, t);
    recordHistory("tools", `编辑工具「${t.name}」`);
    toast.success("已保存");
    setEditing(null);
  }



  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <PageHeader
        title="工具"
        subtitle="内置三个基础工具，默认全部启用。可单独启用或停用，但不能新增或删除。"
        action={
          <Button variant="outline" onClick={testAll} disabled={bulkTesting || filtered.length === 0} className="gap-2">
            {bulkTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            一键测试{filtered.length ? ` (${filtered.length})` : ""}
          </Button>
        }
      />

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-brand/25 bg-brand-soft/40 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <div className="text-foreground/80">
          <span className="font-medium">安全加固：</span>
          所有工具执行受路径校验、命令白名单和 30s 超时保护；密钥仅存储在本地 workspace，不会随会话或日志外泄。
        </div>
      </div>

      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(v) => patch({ q: v || undefined })}
          filters={TOOL_FILTERS}
          activeFilter={filter}
          onFilterChange={(v) => patch({ filter: v === "全部" ? undefined : v })}
          sortOptions={TOOL_SORTS}
          sort={sort}
          order={order}
          onSortChange={(v) => patch({ sort: v === "name" ? undefined : v })}
          onOrderChange={(v) => patch({ order: v === "asc" ? undefined : v })}
          placeholder="搜索工具..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as ToolsSearch })}
        />
      </div>

      <div className="mt-4 space-y-3">
        {filtered.map((t) => {
          const Icon = iconMap[t.icon];
          return (
            <div key={t.key} className="card-warm p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">{t.name}</h3>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {t.key}
                    </code>
                    <Badge variant="outline" className="border-border text-[10px] font-normal">内置</Badge>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="一键测试" disabled={!!testing[t.key]} onClick={() => testOne(t)}>
                        {testing[t.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConnectorBindingBadge binding={t.connectorBinding} />
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-surface px-3 py-2 text-[12px] text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                    <span>{t.detail}</span>
                  </div>

                  {results[t.key] && (
                    <div className={`mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-[12px] ${
                      results[t.key].ok
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {results[t.key].ok
                        ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                        : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{results[t.key].message}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] opacity-70">
                          <span>{results[t.key].latency}ms · {formatSince(results[t.key].ts)}</span>
                          <button
                            type="button"
                            onClick={() => setDetailFor(t)}
                            className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                          >
                            <FileText className="h-3 w-3" />查看详情
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Switch checked={t.enabled} onCheckedChange={(v) => toggle(t, v)} />
                  <span className="text-[11px] text-muted-foreground">{t.enabled ? "已启用" : "已停用"}</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState
            compact
            icon={Terminal}
            title="没有符合条件的工具"
            description="调整搜索关键词或筛选条件后重试。"
          />
        )}
      </div>


      <ToolDialog value={editing} onClose={() => setEditing(null)} onSave={save} />

      <TestDetailDialog
        open={!!detailFor}
        onOpenChange={(o) => !o && setDetailFor(null)}
        title={detailFor?.name ?? ""}
        subtitle={detailFor ? `key: ${detailFor.key} · ${detailFor.enabled ? "已启用" : "已停用"}` : undefined}
        result={detailFor ? results[detailFor.key] ?? null : null}
        retrying={detailFor ? !!testing[detailFor.key] : false}
        onRetry={detailFor ? () => testOne(detailFor) : undefined}
      />
    </div>
  );
}

function ToolDialog({
  value, onClose, onSave,
}: { value: Tool | null; onClose: () => void; onSave: (t: Tool) => void }) {
  const [form, setForm] = useState<Tool | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const open = !!value;
  if (open && form?.key !== value?.key) { setForm(value); setErrors({}); }
  if (!open && form) setForm(null);
  if (!form) return null;

  function handleSave() {
    if (!form) return;
    const r = validateTool(form);
    setErrors(r.errors);
    if (!r.ok) {
      toast.error(`保存失败：${r.firstMessage}`, { description: r.suggestion });
      return;
    }
    onSave(form);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑工具 · {form.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">显示名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            {errors.name ? <p className="text-[11px] text-destructive">{errors.name}</p> : <FieldHint>用于工具选择器与调用日志中显示。</FieldHint>}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Key</Label>
            <Input className="font-mono" value={form.key} disabled />
            <FieldHint>内置工具 Key 不可修改。</FieldHint>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">功能描述</Label>
            <Textarea rows={2} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} aria-invalid={!!errors.desc} />
            {errors.desc ? <p className="text-[11px] text-destructive">{errors.desc}</p> : <FieldHint>一句话概括工具能做什么，供 Agent 决策时参考。</FieldHint>}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">安全约束</Label>
            <Textarea rows={2} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} aria-invalid={!!errors.detail} />
            {errors.detail ? <p className="text-[11px] text-destructive">{errors.detail}</p> : <FieldHint>说明允许访问的路径、命令白名单或超时时长，便于审计。</FieldHint>}
          </div>
          <ConnectorBindingEditor
            value={form.connectorBinding}
            onChange={(v) => setForm({ ...form, connectorBinding: v })}
          />

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button className="bg-brand text-brand-foreground hover:opacity-90" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
