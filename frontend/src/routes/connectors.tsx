import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plug,
  Plus,
  Pencil,
  Trash2,
  TestTube,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  ShieldCheck,
  ExternalLink,
  Download,
  Upload,
  EyeOff,
  Activity,
  BellOff,
  Bell,
  RefreshCw,
  Lightbulb,
  Radio,
  RotateCcw,


} from "lucide-react";

import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ListToolbar } from "@/components/list-toolbar";
import { EmptyState, FieldHint } from "@/components/empty-state";
import {
  connectorsStore,
  useStore,
  uid,
  type Connector,
  type ConnectorType,
} from "@/lib/mock-store";
import { validateConnector } from "@/lib/validators";
import { mockTestConnector, formatSince, type MockTestResult } from "@/lib/mock-test";
import {
  downloadConnectorBackup,
  readConnectorBackup,
  applyConnectorRestore,
  type ConnectorPreview,
  type ConnectorRestoreMode,
} from "@/lib/connector-backup";

import {
  useConnectorHealth,
  runAll as runAllHealth,
  runOneById as runOneHealth,
  updateConfig as updateHealthConfig,
  muteConnector,
  unmuteConnector,
  suggestionsFor,
  isMuted,
  nextRunEta,
  INTERVAL_OPTIONS,
  type Suggestion,
} from "@/lib/connector-health";
import {
  EVENT_PRESETS,
  simulateWebhookEvent,
  useWebhookEvents,
  clearEvents,
  hmacSha256Hex,
  type SigMode,
  type WebhookRecord,
  type WebhookEventPreset,
} from "@/lib/webhook-events";

import { ScrollArea } from "@/components/ui/scroll-area";
import { TestDetailDialog } from "@/components/test-detail-dialog";


// ---------- 类型元数据 ----------
const TYPE_META: Record<
  ConnectorType,
  {

    label: string;
    short: string;
    hint: string;
    docs: string;
    accent: string; // Tailwind class for chip
    idLabel: string;
    idHint: string;
    secretLabel: string;
    secretHint: string;
    needAgentId: boolean;
    needWebhook: boolean;
  }
> = {
  feishu: {
    label: "飞书 · Lark",
    short: "飞书",
    hint: "自建应用凭证：App ID + App Secret，可选事件回调 Encrypt Key。",
    docs: "https://open.feishu.cn/document/",
    accent: "bg-[oklch(0.92_0.05_235)] text-[oklch(0.35_0.14_235)]",
    idLabel: "App ID",
    idHint: "格式类似 cli_xxxxxx，可在飞书开放平台「凭证与基础信息」查看。",
    secretLabel: "App Secret",
    secretHint: "仅保存在本地 workspace，不会随日志外泄。",
    needAgentId: false,
    needWebhook: false,
  },
  dingtalk: {
    label: "钉钉 · DingTalk",
    short: "钉钉",
    hint: "自建应用 AppKey + AppSecret；群机器人可额外填 Webhook 与加签。",
    docs: "https://open.dingtalk.com/document/",
    accent: "bg-[oklch(0.93_0.04_255)] text-[oklch(0.36_0.15_255)]",
    idLabel: "AppKey",
    idHint: "钉钉开放平台「应用凭证」中的 AppKey / SuiteKey。",
    secretLabel: "AppSecret",
    secretHint: "配合 AppKey 换取 access_token，服务端调用凭证。",
    needAgentId: false,
    needWebhook: false,
  },
  wecom: {
    label: "企业微信 · WeCom",
    short: "企微",
    hint: "CorpID + 应用 Secret + AgentId，用于服务端调用与消息推送。",
    docs: "https://developer.work.weixin.qq.com/document/",
    accent: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.34_0.12_150)]",
    idLabel: "CorpID",
    idHint: "企业微信「我的企业」页底部的企业 ID，以 ww 开头。",
    secretLabel: "应用 Secret",
    secretHint: "应用管理 → 自建应用详情页可查看。",
    needAgentId: true,
    needWebhook: false,
  },
  webhook: {
    label: "自定义 Webhook",
    short: "Webhook",
    hint: "通用 HTTP 通知渠道，POST JSON 到指定 URL，可附加签名 Secret。",
    docs: "",
    accent: "bg-muted text-foreground",
    idLabel: "渠道标识",
    idHint: "用于日志中区分不同 Webhook，如 slack-alerts / n8n-flow。",
    secretLabel: "签名 Secret",
    secretHint: "可选。用于 HMAC 签名或 Bearer Token 校验。",
    needAgentId: false,
    needWebhook: true,
  },
};

const TYPE_KEYS = Object.keys(TYPE_META) as ConnectorType[];
const FILTERS = ["全部", "已启用", "已停用"] as const;
const SORTS = [
  { value: "name", label: "名称" },
  { value: "type", label: "类型" },
  { value: "createdAt", label: "创建时间" },
];

type ConnectorSearch = {
  q?: string;
  filter?: string;
  type?: ConnectorType;
  sort?: string;
  order?: "asc" | "desc";
};

export const Route = createFileRoute("/connectors")({
  validateSearch: (s: Record<string, unknown>): ConnectorSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    type: TYPE_KEYS.includes(s.type as ConnectorType) ? (s.type as ConnectorType) : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "连接器 · Mini-WorkBuddy" },
      {
        name: "description",
        content: "接入飞书、钉钉、企业微信及自定义 Webhook，管理服务端凭证并做连通性测试。",
      },
      { property: "og:title", content: "连接器 · Mini-WorkBuddy" },
      {
        property: "og:description",
        content: "统一管理 IM 平台与 Webhook 的服务端凭证与连通性。",
      },
    ],
  }),
  component: ConnectorsPage,
});

function emptyConnector(type: ConnectorType): Connector {
  return {
    id: uid(),
    type,
    name: "",
    appId: "",
    appSecret: "",
    agentId: "",
    webhookUrl: "",
    encryptKey: "",
    scope: "",
    enabled: true,
    status: "unknown",
    createdAt: Date.now(),
  };
}

function ConnectorsPage() {
  const connectors = useStore(connectorsStore);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const typeFilter = search.type;
  const sort = search.sort ?? "createdAt";
  const order = search.order ?? "desc";
  const hasQuery = !!(search.q || search.filter || search.type || search.sort || search.order);
  const patch = (p: Partial<ConnectorSearch>) =>
    navigate({
      search: (prev: ConnectorSearch) => {
        const next = { ...prev, ...p };
        (Object.keys(next) as (keyof ConnectorSearch)[]).forEach((k) => {
          if (next[k] === "" || next[k] == null) delete next[k];
        });
        return next;
      },
    });

  const [editing, setEditing] = useState<Connector | null>(null);
  const [creatingType, setCreatingType] = useState<ConnectorType | null>(null);
  const [pickTypeOpen, setPickTypeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Connector | null>(null);
  const [results, setResults] = useState<Record<string, MockTestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [detailFor, setDetailFor] = useState<Connector | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMask, setExportMask] = useState(true);
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [importPreview, setImportPreview] = useState<ConnectorPreview | null>(null);
  const [importMode, setImportMode] = useState<ConnectorRestoreMode>("merge");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [webhookSim, setWebhookSim] = useState<Connector | null>(null);

  const health = useConnectorHealth();


  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = connectors.filter((c) => {
      if (kw && !`${c.name} ${c.appId} ${c.scope}`.toLowerCase().includes(kw)) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (filter === "已启用") return c.enabled;
      if (filter === "已停用") return !c.enabled;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      let c = 0;
      if (sort === "name") c = a.name.localeCompare(b.name, "zh");
      else if (sort === "type") c = a.type.localeCompare(b.type);
      else c = a.createdAt - b.createdAt;
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [connectors, q, filter, typeFilter, sort, order]);

  async function testOne(c: Connector) {
    setTesting((s) => ({ ...s, [c.id]: true }));
    const r = await mockTestConnector({
      type: c.type,
      name: c.name,
      appId: c.appId,
      appSecret: c.appSecret,
      agentId: c.agentId,
      webhookUrl: c.webhookUrl,
      enabled: c.enabled,
    });
    setResults((s) => ({ ...s, [c.id]: r }));
    setTesting((s) => {
      const n = { ...s };
      delete n[c.id];
      return n;
    });
    connectorsStore.update((x) => x.id === c.id, {
      status: r.ok ? "ok" : "error",
    });
    if (r.ok) toast.success(`${c.name} · ${r.latency}ms`, { description: r.message });
    else toast.error(`${c.name} 连通失败`, { description: r.message });
  }

  function toggle(c: Connector, enabled: boolean) {
    connectorsStore.update((x) => x.id === c.id, { enabled });
    toast.success(`${c.name} ${enabled ? "已启用" : "已停用"}`);
  }

  function save(next: Connector) {
    const others = connectorsStore.get().filter((x) => x.id !== next.id);
    const r = validateConnector(next, others);
    if (!r.ok) {
      toast.error(`保存失败：${r.firstMessage}`, { description: r.suggestion });
      return r.errors;
    }
    const exists = connectorsStore.get().some((x) => x.id === next.id);
    if (exists) connectorsStore.replace((x) => x.id === next.id, next);
    else connectorsStore.add(next);
    toast.success(`${next.name} 已保存`);
    setEditing(null);
    setCreatingType(null);
    return {};
  }

  function remove(c: Connector) {
    connectorsStore.remove((x) => x.id === c.id);
    setPendingDelete(null);
    toast.success(`已删除 ${c.name}`);
  }

  async function onPickImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const preview = await readConnectorBackup(f);
    if (preview) {
      setImportMode(preview.duplicateIds.length > 0 ? "merge" : "append");
      setImportPreview(preview);
    }
  }

  function doExport() {
    downloadConnectorBackup({
      items: exportScope === "filtered" ? filtered : connectors,
      mask: exportMask,
      scopeLabel: exportScope === "filtered" ? `当前筛选 ${filtered.length}` : `全部 ${connectors.length}`,
    });
    setExportOpen(false);
  }

  function doImport() {
    if (!importPreview) return;
    applyConnectorRestore(importPreview, importMode);
    setImportPreview(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <PageHeader
        title="连接器"
        subtitle="接入飞书、钉钉、企业微信与自定义 Webhook，凭证仅保存在本地 workspace。"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
              <Download className="h-4 w-4" /> 导出
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => importFileRef.current?.click()}>
              <Upload className="h-4 w-4" /> 导入
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onPickImport}
            />
            <Button className="gap-2 bg-brand text-brand-foreground hover:opacity-90" onClick={() => setPickTypeOpen(true)}>
              <Plus className="h-4 w-4" />
              新建连接器
            </Button>
          </div>
        }
      />


      <div className="mt-4 flex items-start gap-3 rounded-lg border border-brand/25 bg-brand-soft/40 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <div className="text-foreground/80">
          <span className="font-medium">安全提示：</span>
          Secret、加签 Key、Webhook URL 均只写入浏览器 localStorage，
          调用日志会自动脱敏；请勿将备份 JSON 分享到公开渠道。
        </div>
      </div>

      <HealthBar
        connectors={connectors}
        health={health}
        onEdit={(c) => setEditing(c)}
      />


      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(v) => patch({ q: v || undefined })}
          filters={FILTERS}
          activeFilter={filter}
          onFilterChange={(v) => patch({ filter: v === "全部" ? undefined : v })}
          sortOptions={SORTS}
          sort={sort}
          order={order}
          onSortChange={(v) => patch({ sort: v === "createdAt" ? undefined : v })}
          onOrderChange={(v) => patch({ order: v === "desc" ? undefined : v })}
          placeholder="搜索连接器..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as ConnectorSearch })}
        />
        {/* 类型 chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip active={!typeFilter} onClick={() => patch({ type: undefined })}>
            全部类型
          </Chip>
          {TYPE_KEYS.map((t) => (
            <Chip key={t} active={typeFilter === t} onClick={() => patch({ type: typeFilter === t ? undefined : t })}>
              {TYPE_META[t].short}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.map((c) => {
          const meta = TYPE_META[c.type];
          const res = results[c.id];
          return (
            <div key={c.id} className="card-warm p-5">
              <div className="flex items-start gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-border ${meta.accent}`}>
                  <Plug className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">{c.name || "(未命名)"}</h3>
                    <Badge variant="outline" className="border-border text-[10px] font-normal">
                      {meta.short}
                    </Badge>
                    <StatusPill status={c.status} />
                    <div className="ml-auto flex items-center gap-0.5">
                      {c.type === "webhook" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="事件接收与预览" onClick={() => setWebhookSim(c)}>
                          <Radio className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="连通性测试" disabled={!!testing[c.id]} onClick={() => testOne(c)}>
                        {testing[c.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>

                      <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="删除" onClick={() => setPendingDelete(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5 text-[12px] text-muted-foreground sm:grid-cols-2">
                    <KeyLine label={meta.idLabel} value={c.appId} />
                    <KeyLine label={meta.secretLabel} value={c.appSecret ? "•••••••• (已配置)" : "(未配置)"} muted={!c.appSecret} />
                    {meta.needAgentId && <KeyLine label="AgentId" value={c.agentId || "(未配置)"} muted={!c.agentId} />}
                    {(meta.needWebhook || c.webhookUrl) && (
                      <KeyLine label="Webhook" value={c.webhookUrl || "(未配置)"} muted={!c.webhookUrl} copy />
                    )}
                  </div>
                  {c.scope && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scope
                        .split(/[,\s]+/)
                        .filter(Boolean)
                        .map((s) => (
                          <code key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {s}
                          </code>
                        ))}
                    </div>
                  )}
                  <HealthPanel
                    connector={c}
                    record={health.records[c.id]}
                    manualResult={res}
                    muted={isMuted(health, c.id)}
                    onEdit={() => setEditing(c)}
                    onRetry={() => runOneHealth(c.id)}
                    onToggleMute={(m) => (m ? muteConnector(c.id) : unmuteConnector(c.id))}
                    onDetail={res ? () => setDetailFor(c) : undefined}
                  />

                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} />
                  <span className="text-[11px] text-muted-foreground">{c.enabled ? "已启用" : "已停用"}</span>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState
            icon={Plug}
            title={hasQuery ? "没有符合条件的连接器" : "还没有配置任何连接器"}
            description={hasQuery ? "调整搜索或筛选条件后重试。" : "从飞书 / 钉钉 / 企业微信 / 自定义 Webhook 中选择一种开始接入。"}
            action={
              !hasQuery ? (
                <Button className="gap-2 bg-brand text-brand-foreground hover:opacity-90" onClick={() => setPickTypeOpen(true)}>
                  <Plus className="h-4 w-4" />
                  新建连接器
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {/* 类型选择弹窗 */}
      <Dialog open={pickTypeOpen} onOpenChange={setPickTypeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>选择连接器类型</DialogTitle>
            <DialogDescription>不同平台使用不同的凭证字段，选择后进入表单填写。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2 sm:grid-cols-2">
            {TYPE_KEYS.map((t) => {
              const m = TYPE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPickTypeOpen(false);
                    setCreatingType(t);
                    setEditing(emptyConnector(t));
                  }}
                  className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left transition hover:border-brand/40 hover:bg-brand-soft/30"
                >
                  <div className="flex items-center gap-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-md ring-1 ring-border ${m.accent}`}>
                      <Plug className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">{m.label}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">{m.hint}</p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConnectorDialog
        value={editing}
        isCreating={!!creatingType}
        onClose={() => {
          setEditing(null);
          setCreatingType(null);
        }}
        onSave={save}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除连接器？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.name}」将从本地移除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:opacity-90"
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WebhookSimDialog connector={webhookSim} onClose={() => setWebhookSim(null)} />

      <TestDetailDialog
        open={!!detailFor}
        onOpenChange={(o: boolean) => !o && setDetailFor(null)}
        title={detailFor?.name ?? ""}
        subtitle={detailFor ? `${TYPE_META[detailFor.type].short} · ${detailFor.appId || detailFor.webhookUrl || ""}` : undefined}
        result={detailFor ? results[detailFor.id] ?? null : null}
        retrying={detailFor ? !!testing[detailFor.id] : false}
        onRetry={detailFor ? () => testOne(detailFor) : undefined}
      />



      {/* 导出对话框 */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>导出连接器配置</DialogTitle>
            <DialogDescription>
              导出为 JSON 文件，可在其他环境通过「导入」还原相同的字段与设置。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">导出范围</Label>
              <Select value={exportScope} onValueChange={(v) => setExportScope(v as "all" | "filtered")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部连接器（{connectors.length}）</SelectItem>
                  <SelectItem value="filtered">仅当前筛选结果（{filtered.length}）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-surface px-3 py-2.5">
              <div className="flex items-start gap-2">
                <EyeOff className="mt-0.5 h-4 w-4 text-brand" />
                <div>
                  <p className="text-sm font-medium text-foreground">脱敏凭证</p>
                  <p className="text-[11px] text-muted-foreground">
                    App Secret / 加签 Key / Webhook URL 将替换为占位符，导入时保留目标环境已有凭证。
                  </p>
                </div>
              </div>
              <Switch checked={exportMask} onCheckedChange={setExportMask} />
            </div>
            {!exportMask && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-foreground/80">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                导出的 JSON 会包含明文密钥，仅在可信环境之间传输。
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>取消</Button>
            <Button className="gap-2 bg-brand text-brand-foreground hover:opacity-90" onClick={doExport}>
              <Download className="h-4 w-4" /> 下载 JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入预览对话框 */}
      <Dialog open={!!importPreview} onOpenChange={(o) => !o && setImportPreview(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入连接器配置</DialogTitle>
            <DialogDescription>
              共识别 {importPreview?.incoming.length ?? 0} 个连接器
              {importPreview?.masked && "（含脱敏字段）"}
              {importPreview && importPreview.duplicateIds.length > 0
                ? `，其中 ${importPreview.duplicateIds.length} 个与本地 ID 冲突。`
                : "。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-border bg-surface p-2 text-[11px]">
              {importPreview?.incoming.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="ml-1 text-muted-foreground">· {TYPE_META[c.type].short}</span>
                  </span>
                  {importPreview.existingIds.has(c.id) ? (
                    <Badge variant="secondary" className="shrink-0">冲突</Badge>
                  ) : (
                    <Badge className="shrink-0 bg-success/15 text-success hover:bg-success/15">新</Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">导入模式</Label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as ConnectorRestoreMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">合并 · 同 ID 覆盖，其余保留</SelectItem>
                  <SelectItem value="append">追加 · 冲突项生成新 ID，不覆盖任何本地条目</SelectItem>
                  <SelectItem value="replace">替换 · 清空本地并使用备份</SelectItem>
                </SelectContent>
              </Select>
              <FieldHint>
                {importMode === "merge" && "同 ID 以备份为准；脱敏字段将保留本地已有值。"}
                {importMode === "append" && "适合跨环境合并，绝不修改现有配置。"}
                {importMode === "replace" && "会清空本地全部连接器，请先做一次导出备份。"}
              </FieldHint>
            </div>

            {importPreview?.masked && (
              <div className="flex items-start gap-2 rounded-md border border-brand/30 bg-brand-soft/40 p-2.5 text-[11px] text-foreground/80">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                备份中的敏感字段已脱敏。合并模式会保留目标环境的原凭证；替换模式导入后需手动补填 Secret / Webhook。
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>取消</Button>
            <Button
              className={
                importMode === "replace"
                  ? "gap-2 bg-destructive text-destructive-foreground hover:opacity-90"
                  : "gap-2 bg-brand text-brand-foreground hover:opacity-90"
              }
              onClick={doImport}
            >
              <Upload className="h-4 w-4" />
              {importMode === "replace" ? "替换全部" : importMode === "merge" ? "合并导入" : "追加导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
        active
          ? "border-brand/40 bg-brand-soft text-brand"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: Connector["status"] }) {
  const map = {
    ok: { label: "连通", cls: "bg-success/15 text-success" },
    warn: { label: "待验证", cls: "bg-warning/15 text-warning" },
    error: { label: "异常", cls: "bg-destructive/15 text-destructive" },
    unknown: { label: "未测试", cls: "bg-muted text-muted-foreground" },
  } as const;
  const m = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
}

function KeyLine({ label, value, muted, copy }: { label: string; value: string; muted?: boolean; copy?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 truncate">
      <span className="shrink-0 text-muted-foreground/80">{label}</span>
      <span className={`truncate font-mono text-[11px] ${muted ? "text-muted-foreground/60" : "text-foreground"}`}>
        {value}
      </span>
      {copy && value && !muted && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => toast.success("已复制"),
              () => toast.error("复制失败"),
            );
          }}
          title="复制"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function ConnectorDialog({
  value,
  isCreating,
  onClose,
  onSave,
}: {
  value: Connector | null;
  isCreating: boolean;
  onClose: () => void;
  onSave: (c: Connector) => Record<string, string>;
}) {
  const [form, setForm] = useState<Connector | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const open = !!value;
  if (open && form?.id !== value?.id) {
    setForm(value);
    setErrors({});
  }
  if (!open && form) setForm(null);
  if (!form) return null;

  const meta = TYPE_META[form.type];

  function handleSave() {
    if (!form) return;
    const errs = onSave(form);
    setErrors(errs);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? "新建" : "编辑"} · {meta.label}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>{meta.hint}</span>
            {meta.docs && (
              <a
                href={meta.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-brand hover:underline"
              >
                官方文档 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {isCreating && (
            <div className="grid gap-1.5">
              <Label className="text-xs">类型</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as ConnectorType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_KEYS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">显示名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} placeholder={`${meta.short} · 用途简述`} />
            {errors.name ? <p className="text-[11px] text-destructive">{errors.name}</p> : <FieldHint>用于列表与日志中区分不同连接器。</FieldHint>}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">{meta.idLabel}</Label>
            <Input className="font-mono" value={form.appId} onChange={(e) => setForm({ ...form, appId: e.target.value })} aria-invalid={!!errors.appId} />
            {errors.appId ? <p className="text-[11px] text-destructive">{errors.appId}</p> : <FieldHint>{meta.idHint}</FieldHint>}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">{meta.secretLabel}</Label>
            <Input type="password" className="font-mono" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} aria-invalid={!!errors.appSecret} autoComplete="new-password" />
            {errors.appSecret ? <p className="text-[11px] text-destructive">{errors.appSecret}</p> : <FieldHint>{meta.secretHint}</FieldHint>}
          </div>

          {meta.needAgentId && (
            <div className="grid gap-1.5">
              <Label className="text-xs">AgentId</Label>
              <Input className="font-mono" value={form.agentId ?? ""} onChange={(e) => setForm({ ...form, agentId: e.target.value })} aria-invalid={!!errors.agentId} placeholder="10000001" />
              {errors.agentId ? <p className="text-[11px] text-destructive">{errors.agentId}</p> : <FieldHint>企业微信自建应用详情页可查看。</FieldHint>}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">
              Webhook URL {meta.needWebhook ? "" : <span className="text-muted-foreground">（可选）</span>}
            </Label>
            <Input className="font-mono" value={form.webhookUrl ?? ""} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} aria-invalid={!!errors.webhookUrl} placeholder="https://..." />
            {errors.webhookUrl ? <p className="text-[11px] text-destructive">{errors.webhookUrl}</p> : <FieldHint>群机器人 / 事件回调 URL；不填则仅使用 API 凭证。</FieldHint>}
          </div>

          {form.type !== "webhook" && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Encrypt / 加签 Key <span className="text-muted-foreground">（可选）</span></Label>
              <Input className="font-mono" value={form.encryptKey ?? ""} onChange={(e) => setForm({ ...form, encryptKey: e.target.value })} aria-invalid={!!errors.encryptKey} />
              {errors.encryptKey ? <p className="text-[11px] text-destructive">{errors.encryptKey}</p> : <FieldHint>用于事件回调验签或消息加解密。</FieldHint>}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">权限范围 scope <span className="text-muted-foreground">（可选）</span></Label>
            <Textarea rows={2} className="font-mono text-xs" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="im:message,contact:read" />
            <FieldHint>逗号或空格分隔，仅用于本地审计展示，不会实际下发。</FieldHint>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button className="bg-brand text-brand-foreground hover:opacity-90" onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ 健康检查 UI ============
function HealthBar({
  connectors,
  health,
  onEdit,
}: {
  connectors: Connector[];
  health: ReturnType<typeof useConnectorHealth>;
  onEdit: (c: Connector) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const counts = useMemo(() => {
    let ok = 0, warn = 0, error = 0, unknown = 0;
    for (const c of connectors) {
      if (!c.enabled) continue;
      const s = health.records[c.id]?.state ?? "unknown";
      if (s === "ok") ok++;
      else if (s === "warn") warn++;
      else if (s === "error") error++;
      else unknown++;
    }
    return { ok, warn, error, unknown };
  }, [connectors, health.records]);
  const failing = connectors.filter(
    (c) => c.enabled && (health.records[c.id]?.state === "error" || health.records[c.id]?.state === "warn"),
  );
  const eta = nextRunEta(health);
  const etaLabel =
    !health.config.enabled ? "已暂停" :
    health.isRunning ? "检测中…" :
    eta <= 0 ? "即将检测" :
    `${Math.max(1, Math.ceil((eta - (now - health.lastRun)) / 1000))}s 后`;

  const [expanded, setExpanded] = useState(false);
  const hasFailing = failing.length > 0;

  return (
    <div className={`mt-3 rounded-lg border p-3 text-sm ${
      counts.error > 0 ? "border-destructive/40 bg-destructive/5" :
      counts.warn > 0 ? "border-warning/40 bg-warning/5" :
      "border-border bg-muted/30"
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        <Activity className={`h-4 w-4 ${counts.error > 0 ? "text-destructive" : counts.warn > 0 ? "text-warning" : "text-brand"}`} />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-foreground">健康检查</span>
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[10px]">正常 {counts.ok}</Badge>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[10px]">告警 {counts.warn}</Badge>
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">失败 {counts.error}</Badge>
          {counts.unknown > 0 && <Badge variant="outline" className="text-[10px]">未知 {counts.unknown}</Badge>}
        </div>
        <span className="text-[11px] text-muted-foreground">下次：{etaLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            value={health.config.intervalSec}
            onChange={(e) => updateHealthConfig({ intervalSec: Number(e.target.value) })}
            title="轮询间隔"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            title={health.config.notify ? "关闭状态变化通知" : "开启状态变化通知"}
            onClick={() => updateHealthConfig({ notify: !health.config.notify })}
          >
            {health.config.notify ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => updateHealthConfig({ enabled: !health.config.enabled })}
          >
            {health.config.enabled ? "暂停自检" : "恢复自检"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={health.isRunning}
            onClick={() => runAllHealth()}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${health.isRunning ? "animate-spin" : ""}`} />
            立即检测
          </Button>
          {hasFailing && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "收起" : `查看 ${failing.length} 个异常`}
            </Button>
          )}
        </div>
      </div>
      {expanded && hasFailing && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {failing.map((c) => {
            const r = health.records[c.id];
            const sugs = suggestionsFor(c, r);
            return (
              <div key={c.id} className="flex items-start gap-2 rounded-md bg-background/60 p-2 text-xs">
                <AlertCircle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${r?.state === "error" ? "text-destructive" : "text-warning"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-muted-foreground">{TYPE_META[c.type].short}</span>
                    <span className="text-muted-foreground">· {r?.message ?? "尚未检测"}</span>
                  </div>
                  {sugs.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <Lightbulb className="h-3 w-3 text-warning" />
                      {sugs.map((s, i) => (
                        <span key={i} className="rounded bg-muted px-1.5 py-0.5">{s.label}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => runOneHealth(c.id)}>
                  重试
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onEdit(c)}>
                  编辑
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HealthPanel({
  connector,
  record,
  manualResult,
  muted,
  onEdit,
  onRetry,
  onToggleMute,
  onDetail,
}: {
  connector: Connector;
  record?: import("@/lib/connector-health").HealthRecord;
  manualResult?: MockTestResult;
  muted: boolean;
  onEdit: () => void;
  onRetry: () => void;
  onToggleMute: (m: boolean) => void;
  onDetail?: () => void;
}) {
  const primary = record ?? (manualResult ? {
    state: manualResult.ok ? "ok" : "error" as const,
    message: manualResult.message,
    latency: manualResult.latency,
    ts: manualResult.ts,
    consecutiveFails: manualResult.ok ? 0 : 1,
  } : undefined);
  if (!primary) return null;
  const isProblem = primary.state === "warn" || primary.state === "error";
  const suggestions: Suggestion[] = isProblem ? suggestionsFor(connector, record) : [];
  const tone =
    primary.state === "ok" ? "bg-success/10 text-success" :
    primary.state === "warn" ? "bg-warning/10 text-warning" :
    primary.state === "error" ? "bg-destructive/10 text-destructive" :
    primary.state === "checking" ? "bg-muted text-muted-foreground" :
    "bg-muted text-muted-foreground";
  const Icon = primary.state === "ok" ? CheckCircle2 : primary.state === "checking" ? Loader2 : AlertCircle;
  return (
    <div className={`mt-3 rounded-md px-3 py-2 text-[12px] ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${primary.state === "checking" ? "animate-spin" : ""}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate">{primary.message}</div>
          <div className="text-[10px] opacity-70">
            {primary.latency != null && `${primary.latency}ms · `}
            {formatSince(primary.ts)}
            {primary.consecutiveFails > 1 && ` · 连续失败 ${primary.consecutiveFails} 次`}
            {muted && " · 已静音"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onDetail && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onDetail} title="查看分步日志">
              详情
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3 w-3" />重试
          </Button>
          {isProblem && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              title={muted ? "取消静音" : "静音 30 分钟"}
              onClick={() => onToggleMute(!muted)}
            >
              {muted ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-current/10 pt-2 text-[11px] opacity-90">
          <Lightbulb className="h-3 w-3" />
          {suggestions.map((s, i) => (
            s.action === "edit" ? (
              <button key={i} onClick={onEdit} className="rounded bg-background/60 px-1.5 py-0.5 underline-offset-2 hover:underline">
                {s.label}
              </button>
            ) : s.action === "retry" ? (
              <button key={i} onClick={onRetry} className="rounded bg-background/60 px-1.5 py-0.5 underline-offset-2 hover:underline">
                {s.label}
              </button>
            ) : (
              <span key={i} className="rounded bg-background/60 px-1.5 py-0.5">{s.label}</span>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Webhook 事件接收 & 预览 ============
const SIG_MODES: { value: SigMode; label: string; hint: string }[] = [
  { value: "valid", label: "有效签名", hint: "使用 secret 计算 HMAC-SHA256" },
  { value: "tampered", label: "篡改签名", hint: "尾部 4 位改动，服务端应拒绝" },
  { value: "missing", label: "缺失签名", hint: "不携带 x-webhook-signature" },
  { value: "expired", label: "过期时间戳", hint: "时间戳偏移 15 分钟，超容忍窗口" },
];

function WebhookSimDialog({ connector, onClose }: { connector: Connector | null; onClose: () => void }) {
  const open = !!connector;
  const events = useWebhookEvents(connector?.id ?? "");
  const [presetId, setPresetId] = useState<string>("ping");
  const [sigMode, setSigMode] = useState<SigMode>("valid");
  const [payloadText, setPayloadText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"preview" | "detail">("preview");

  const preset: WebhookEventPreset = EVENT_PRESETS.find((p) => p.id === presetId) ?? EVENT_PRESETS[0];
  const selected = events.find((e) => e.id === selectedId) ?? events[0];

  // Fill textarea with preset payload (pretty) when preset or dialog changes
  useEffect(() => {
    if (!open) return;
    setPayloadText(JSON.stringify(preset.payload, null, 2));
    setJsonError(null);
  }, [open, presetId, connector?.id]);

  useEffect(() => {
    if (!open) return;
    setSigMode("valid");
    setSelectedId(null);
    setRightTab("preview");
  }, [open, connector?.id]);

  // Live parsed payload for preview panel
  const parsed = (() => {
    if (!payloadText.trim()) return { ok: true as const, value: preset.payload };
    try { return { ok: true as const, value: JSON.parse(payloadText) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "JSON 解析失败" }; }
  })();
  const previewBody = parsed.ok ? JSON.stringify(parsed.value, null, 2) : payloadText;
  const previewUrl = connector?.webhookUrl || `https://webhook.example.com/${connector?.appId || "endpoint"}`;
  const previewHeaders: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "MiniWorkBuddy-Sim/1.0",
    "x-webhook-timestamp": sigMode === "expired" ? "(now - 15m)" : "(now)",
    "x-webhook-event": String((parsed.ok && (parsed.value as { event?: string })?.event) || preset.id),
    ...(sigMode === "missing"
      ? {}
      : { "x-webhook-signature": sigMode === "valid" ? "sha256=<computed on send>" : sigMode === "tampered" ? "sha256=<tampered>" : "sha256=<computed, expired ts>" }),
  };

  // 实时签名校验预览
  type SigPreview = {
    hasSecret: boolean;
    secretMasked: string;
    timestamp: string;
    timestampLabel: string;
    canonical: string;
    expected: string;
    provided: string | null;
    match: boolean;
    verdict: "ok" | "warn" | "fail";
    reason: string;
    skewSec: number;
  };
  const [sigPreview, setSigPreview] = useState<SigPreview | null>(null);
  useEffect(() => {
    if (!connector) { setSigPreview(null); return; }
    if (!parsed.ok) { setSigPreview(null); return; }
    let cancelled = false;
    (async () => {
      const now = Math.floor(Date.now() / 1000);
      const ts = sigMode === "expired" ? now - 15 * 60 : now;
      const skew = now - ts;
      const bodyStr = JSON.stringify(parsed.value);
      const secret = connector.appSecret || "";
      const canonical = `${ts}.${bodyStr}`;
      const expected = secret ? await hmacSha256Hex(secret, canonical) : "";
      if (cancelled) return;
      const tampered = expected ? expected.slice(0, -4) + "dead" : "dead";
      let provided: string | null = null;
      if (sigMode === "valid" || sigMode === "expired") provided = expected;
      else if (sigMode === "tampered") provided = tampered;
      else provided = null;

      let verdict: SigPreview["verdict"] = "ok";
      let reason = "签名有效，服务端将返回 2xx";
      let match = false;
      if (!secret) { verdict = "warn"; reason = "连接器未配置签名密钥，服务端将跳过校验（不安全）"; }
      else if (!provided) { verdict = "fail"; reason = "缺少 x-webhook-signature 头 → 401 missing_signature"; }
      else if (Math.abs(skew) > 5 * 60) { verdict = "fail"; reason = `时间戳偏移 ${skew}s 超出 ±300s 容忍窗口 → 401 timestamp_skew`; }
      else if (provided !== expected) { verdict = "fail"; reason = "HMAC-SHA256 结果与提供签名不一致 → 401 signature_mismatch"; }
      else { match = true; }

      setSigPreview({
        hasSecret: !!secret,
        secretMasked: secret ? `${secret.slice(0, 2)}••••${secret.slice(-2)} (${secret.length} chars)` : "(未配置)",
        timestamp: String(ts),
        timestampLabel: sigMode === "expired" ? "now − 15m" : "now",
        canonical,
        expected: expected || "(无密钥，无法计算)",
        provided,
        match,
        verdict,
        reason,
        skewSec: skew,
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector?.id, connector?.appSecret, previewBody, sigMode, parsed.ok]);


  async function fire() {
    if (!connector) return;
    if (!parsed.ok) {
      setJsonError(parsed.error);
      toast.error("请求体 JSON 无法解析", { description: parsed.error });
      return;
    }
    setJsonError(null);
    setFiring(true);
    try {
      const rec = await simulateWebhookEvent({ connector, preset, sigMode, payloadOverride: parsed.value });
      setSelectedId(rec.id);
      setRightTab("detail");
      toast[rec.response.ok ? "success" : "error"](
        `${preset.name} · ${rec.response.status}`,
        { description: rec.signature.reason },
      );
    } finally {
      setFiring(false);
    }
  }

  async function handleReplay(rec: WebhookRecord) {
    if (!connector || firing) return;
    const preset = EVENT_PRESETS.find((p) => p.id === rec.preset) ?? EVENT_PRESETS[0];
    let payload: unknown;
    try {
      payload = JSON.parse(rec.request.body);
    } catch {
      toast.error("重放失败：历史请求体无法解析");
      return;
    }
    // 同步左侧编辑器，让预览与历史一致
    setPresetId(preset.id);
    setSigMode(rec.sigMode);
    setPayloadText(JSON.stringify(payload, null, 2));
    setJsonError(null);
    setFiring(true);
    try {
      const next = await simulateWebhookEvent({
        connector,
        preset,
        sigMode: rec.sigMode,
        payloadOverride: payload,
      });
      setSelectedId(next.id);
      setRightTab("detail");
      toast[next.response.ok ? "success" : "error"](
        `重放 ${preset.name} · ${next.response.status}`,
        { description: next.signature.reason },
      );
    } finally {
      setFiring(false);
    }
  }

  function handleExport(rec: WebhookRecord) {
    let requestBody: unknown = rec.request.body;
    try { requestBody = JSON.parse(rec.request.body); } catch { /* keep raw */ }
    const payload = {
      exportedAt: new Date().toISOString(),
      connector: connector ? { id: connector.id, name: connector.name, type: connector.type } : null,
      event: {
        id: rec.id,
        preset: rec.preset,
        sigMode: rec.sigMode,
        timestamp: new Date(rec.ts).toISOString(),
      },
      request: {
        method: rec.request.method,
        url: rec.request.url,
        headers: rec.request.headers,
        body: requestBody,
      },
      signature: rec.signature,
      response: {
        status: rec.response.status,
        ok: rec.response.ok,
        latencyMs: rec.response.latency,
        body: rec.response.body,
      },
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date(rec.ts).toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `webhook-${rec.preset}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("已导出", { description: `${a.download} · ${new Blob([json]).size} B` });
  }

  function handleExportMarkdown(rec: WebhookRecord) {
    let requestBody: unknown = rec.request.body;
    try { requestBody = JSON.parse(rec.request.body); } catch { /* keep raw */ }
    const bodyStr = typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody, null, 2);
    const respStr = typeof rec.response.body === "string" ? rec.response.body : JSON.stringify(rec.response.body, null, 2);
    const headerLines = Object.entries(rec.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
    const verdict = rec.signature.match ? "✅ 通过" : rec.response.ok ? "⚠️ 放行（不安全）" : "❌ 拒绝";
    const sp = sigPreview;
    const sigSection = sp
      ? [
          `- **① 提取密钥**：\`${sp.secretMasked}\``,
          `- **② 生成时间戳**：\`${sp.timestamp}\`（${sp.timestampLabel}，偏移 ${sp.skewSec}s）`,
          `- **③ 拼接规范串**：\n\n\`\`\`\n${sp.canonical}\n\`\`\``,
          `- **④ HMAC-SHA256 计算**：\n\n\`\`\`\n${sp.expected}\n\`\`\``,
          `- **⑤ 与请求签名比对**：\n\n\`\`\`\n${sp.provided === null ? "(未附带 x-webhook-signature 头)" : "sha256=" + sp.provided}\n\`\`\``,
          `- **⑥ 最终判定**：${sp.verdict === "ok" ? "将通过校验" : sp.verdict === "warn" ? "将放行但不安全" : "将被拒绝"} — ${sp.reason}`,
        ].join("\n")
      : [
          `- **提供签名**：\`${rec.signature.provided ?? "(缺失)"}\``,
          `- **期望签名**：\`${rec.signature.expected || "(无密钥)"}\``,
          `- **时间戳偏移**：${rec.signature.timestampSkewSec ?? 0}s`,
          `- **判定原因**：${rec.signature.reason ?? "-"}`,
        ].join("\n");

    const md = `# Webhook 模拟报告

- **导出时间**：${new Date().toISOString()}
- **连接器**：${connector ? `${connector.name}（${connector.type} · ${connector.id}）` : "未知"}
- **事件**：\`${rec.preset}\`（签名模式：${rec.sigMode}）
- **触发时间**：${new Date(rec.ts).toISOString()}

## 请求预览

- **方法**：\`${rec.request.method}\`
- **URL**：\`${rec.request.url}\`

### Headers

\`\`\`
${headerLines}
\`\`\`

### Body

\`\`\`json
${bodyStr}
\`\`\`

## 签名校验过程

${sigSection}

## 响应

- **状态**：\`${rec.response.status}\` ${rec.response.ok ? "OK" : "FAIL"}
- **延迟**：${rec.response.latency} ms
- **最终判定**：${verdict}

### Response Body

\`\`\`json
${respStr}
\`\`\`
`;

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date(rec.ts).toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `webhook-${rec.preset}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("已导出 Markdown", { description: `${a.download} · ${blob.size} B` });
  }




  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-brand" />
            Webhook 事件接收 · {connector?.name}
          </DialogTitle>
          <DialogDescription>
            手动选择事件类型、编辑请求体并在右侧预览面板查看请求，触发后会得到本地模拟的签名校验与响应结果。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-medium text-foreground">触发事件</div>
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">事件类型</Label>
                  <Select value={presetId} onValueChange={setPresetId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[10px] text-muted-foreground">{preset.desc}</div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">签名模式</Label>
                  <Select value={sigMode} onValueChange={(v) => setSigMode(v as SigMode)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIG_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[10px] text-muted-foreground">
                    {SIG_MODES.find((m) => m.value === sigMode)?.hint}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">请求体（可编辑 JSON）</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => { setPayloadText(JSON.stringify(preset.payload, null, 2)); setJsonError(null); }}
                    >重置</Button>
                  </div>
                  <Textarea
                    rows={8}
                    className="font-mono text-[11px]"
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                  />
                  {(jsonError || (!parsed.ok && payloadText.trim())) && (
                    <div className="text-[10px] text-destructive">JSON 错误：{jsonError || (parsed.ok ? "" : parsed.error)}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="h-8 bg-brand text-brand-foreground hover:opacity-90"
                  disabled={firing || !connector || !parsed.ok}
                  onClick={fire}
                >
                  {firing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Radio className="mr-1 h-3.5 w-3.5" />}
                  发送到预览面板
                </Button>
                {!connector?.appSecret && (
                  <div className="rounded bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
                    未配置签名密钥，服务端将跳过校验并返回警告。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="text-xs font-medium text-foreground">历史 ({events.length})</div>
                {events.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[11px]"
                    onClick={() => connector && clearEvents(connector.id)}
                  >清空</Button>
                )}
              </div>
              <ScrollArea className="h-[220px]">
                {events.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">尚无事件</div>
                ) : (
                  <div className="divide-y divide-border">
                    {events.map((e) => (
                      <div
                        key={e.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setSelectedId(e.id); setRightTab("detail"); }}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelectedId(e.id); setRightTab("detail"); } }}
                        className={`group w-full cursor-pointer px-3 py-2 text-left text-[11px] transition ${selected?.id === e.id ? "bg-brand-soft/40" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${e.response.ok ? "bg-success" : "bg-destructive"}`} />
                          <span className="font-medium text-foreground">{e.preset}</span>
                          <span className="ml-auto text-muted-foreground">{e.response.status}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="重放此次请求"
                            aria-label="重放此次请求"
                            disabled={firing}
                            className="h-6 w-6 p-0 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={(ev) => { ev.stopPropagation(); handleReplay(e); }}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{SIG_MODES.find((m) => m.value === e.sigMode)?.label}</span>
                          <span>·</span>
                          <span>{formatSince(e.ts)}</span>
                          <span>·</span>
                          <span>{e.response.latency}ms</span>
                        </div>
                      </div>
                    ))}

                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
              <button
                onClick={() => setRightTab("preview")}
                className={`rounded px-2 py-1 text-[11px] font-medium transition ${rightTab === "preview" ? "bg-brand-soft/60 text-brand" : "text-muted-foreground hover:bg-muted/50"}`}
              >请求预览</button>
              <button
                onClick={() => setRightTab("detail")}
                disabled={!selected}
                className={`rounded px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${rightTab === "detail" ? "bg-brand-soft/60 text-brand" : "text-muted-foreground hover:bg-muted/50"}`}
              >响应详情{selected ? "" : "（未发送）"}</button>
              {selected && (
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={firing}
                    onClick={() => handleReplay(selected)}
                    className="h-6 gap-1 px-2 text-[11px]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    重放
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExport(selected)}
                    className="h-6 gap-1 px-2 text-[11px]"
                  >
                    <Download className="h-3 w-3" />
                    JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExportMarkdown(selected)}
                    className="h-6 gap-1 px-2 text-[11px]"
                  >
                    <Download className="h-3 w-3" />
                    Markdown
                  </Button>
                </div>
              )}
            </div>


            <ScrollArea className="h-[500px]">
              {rightTab === "preview" ? (
                <div className="space-y-3 p-4">
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">目标</div>
                    <div className="text-[11px]">
                      <span className="rounded bg-brand-soft/60 px-1.5 py-0.5 font-mono text-[10px] text-brand">POST</span>{" "}
                      <code className="font-mono text-[10px] text-muted-foreground">{previewUrl}</code>
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">Headers（发送时签名与时间戳会被计算）</div>
                    <div className="rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
                      {Object.entries(previewHeaders).map(([k, v]) => (
                        <div key={k}><span className="text-brand">{k}</span>: {v}</div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[11px] font-medium text-muted-foreground">Body（{parsed.ok ? "有效 JSON" : "解析失败"}）</div>
                      <div className="text-[10px] text-muted-foreground">{new Blob([previewBody]).size} B</div>
                    </div>
                    <pre className={`max-h-[280px] overflow-auto rounded p-2 font-mono text-[10px] leading-relaxed ${parsed.ok ? "bg-muted" : "bg-destructive/10 text-destructive"}`}>{previewBody}</pre>
                  </div>
                  <div className={`rounded-md border p-3 ${sigPreview?.verdict === "fail" ? "border-destructive/40 bg-destructive/5" : sigPreview?.verdict === "warn" ? "border-warning/40 bg-warning/5" : "border-border"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        签名校验过程（HMAC-SHA256）
                      </div>
                      {sigPreview && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sigPreview.verdict === "ok" ? "bg-success/15 text-success" : sigPreview.verdict === "warn" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}`}>
                          {sigPreview.verdict === "ok" ? "将通过校验" : sigPreview.verdict === "warn" ? "将放行但不安全" : "将被拒绝"}
                        </span>
                      )}
                    </div>
                    {!sigPreview ? (
                      <div className="text-[10px] text-muted-foreground">等待请求体解析…</div>
                    ) : (
                      <ol className="space-y-1.5 text-[10px] leading-relaxed">
                        <li>
                          <div className="text-muted-foreground">① 取签名密钥（appSecret）</div>
                          <code className="mt-0.5 block rounded bg-muted p-1.5 font-mono text-[10px]">{sigPreview.secretMasked}</code>
                        </li>
                        <li>
                          <div className="text-muted-foreground">② 生成时间戳 <span className="font-mono">{sigPreview.timestampLabel}</span>（偏移 {sigPreview.skewSec}s）</div>
                          <code className="mt-0.5 block rounded bg-muted p-1.5 font-mono text-[10px]">x-webhook-timestamp: {sigPreview.timestamp}</code>
                        </li>
                        <li>
                          <div className="text-muted-foreground">③ 拼接待签串 <span className="font-mono">{`${'`${ts}.${body}`'}`}</span></div>
                          <code className="mt-0.5 block max-h-[60px] overflow-auto rounded bg-muted p-1.5 font-mono text-[10px] break-all">{sigPreview.canonical.length > 240 ? sigPreview.canonical.slice(0, 240) + "…" : sigPreview.canonical}</code>
                        </li>
                        <li>
                          <div className="text-muted-foreground">④ 计算 <span className="font-mono">HMAC-SHA256(secret, canonical)</span> → 期望签名</div>
                          <code className="mt-0.5 block rounded bg-muted p-1.5 font-mono text-[10px] break-all">{sigPreview.expected}</code>
                        </li>
                        <li>
                          <div className="text-muted-foreground">⑤ 将随请求发送的签名（受签名模式影响）</div>
                          <code className={`mt-0.5 block rounded p-1.5 font-mono text-[10px] break-all ${sigPreview.provided === null ? "bg-destructive/10 text-destructive" : sigPreview.match ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                            {sigPreview.provided === null ? "(未附带 x-webhook-signature 头)" : `sha256=${sigPreview.provided}`}
                          </code>
                        </li>
                        <li className="pt-1">
                          <div className="text-muted-foreground">⑥ 服务端比对结果</div>
                          <div className={`mt-0.5 flex items-start gap-1.5 rounded p-1.5 text-[10px] ${sigPreview.verdict === "ok" ? "bg-success/10 text-success" : sigPreview.verdict === "warn" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
                            {sigPreview.verdict === "ok" ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
                            <span>{sigPreview.reason}</span>
                          </div>
                        </li>
                      </ol>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    编辑左侧请求体或切换签名模式，签名过程与失配原因会实时刷新；点击「发送到预览面板」即可写入历史。
                  </div>

                </div>
              ) : selected ? (
                <WebhookRecordDetail record={selected} />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-xs text-muted-foreground">
                  尚未发送事件。
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function WebhookRecordDetail({ record }: { record: WebhookRecord }) {
  const sig = record.signature;
  const sigTone = sig.match
    ? "bg-success/10 text-success border-success/30"
    : record.response.status >= 400
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : "bg-warning/10 text-warning border-warning/30";
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} 已复制`);
    } catch {
      toast.error("复制失败");
    }
  };
  const bodyPretty = (() => {
    try { return JSON.stringify(JSON.parse(record.request.body), null, 2); }
    catch { return record.request.body; }
  })();
  return (
    <div className="space-y-3 p-4">
      <div className={`rounded-md border p-3 text-xs ${sigTone}`}>
        <div className="flex items-center gap-2">
          {sig.match ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          <span className="font-medium">签名校验：{sig.match ? "通过" : "未通过"}</span>
          <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">
            HTTP {record.response.status}
          </span>
        </div>
        <div className="mt-1 text-[11px] opacity-90">{sig.reason}</div>
        {sig.timestampSkewSec != null && Math.abs(sig.timestampSkewSec) > 5 && (
          <div className="mt-0.5 text-[10px] opacity-80">时间戳偏移：{sig.timestampSkewSec}s</div>
        )}
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">签名对比 (HMAC-SHA256)</div>
        <div className="grid gap-1.5 text-[11px]">
          <div>
            <div className="text-[10px] text-muted-foreground">Provided</div>
            <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-[10px]">
              {sig.provided ? `sha256=${sig.provided}` : "(未提供)"}
            </code>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Expected</div>
            <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-[10px]">
              {sig.expected ? `sha256=${sig.expected}` : "(无 secret)"}
            </code>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <div className="text-[11px] font-medium text-foreground">请求</div>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => copy(bodyPretty, "请求体")}>
            <Copy className="mr-1 h-3 w-3" />复制 body
          </Button>
        </div>
        <div className="space-y-2 p-3">
          <div className="text-[11px]">
            <span className="rounded bg-brand-soft/60 px-1.5 py-0.5 font-mono text-[10px] text-brand">POST</span>{" "}
            <code className="font-mono text-[10px] text-muted-foreground">{record.request.url}</code>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-muted-foreground">Headers</div>
            <div className="rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">
              {Object.entries(record.request.headers).map(([k, v]) => (
                <div key={k}><span className="text-brand">{k}</span>: {v}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-muted-foreground">Body</div>
            <pre className="max-h-52 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">{bodyPretty}</pre>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <div className="text-[11px] font-medium text-foreground">模拟响应</div>
          <span className="text-[10px] text-muted-foreground">{record.response.latency}ms</span>
        </div>
        <pre className="max-h-52 overflow-auto p-3 font-mono text-[10px] leading-relaxed">
{JSON.stringify(record.response.body, null, 2)}
        </pre>
      </div>
    </div>
  );
}


