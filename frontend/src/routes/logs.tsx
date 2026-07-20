import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { RefreshCw, Terminal, Cpu, Bot, Sparkles, AlertCircle, CheckCircle2, X, ArrowRight, Clock, ChevronRight, ListTree, Minimize2, Search, Copy, Download, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

type LogLevel = "info" | "warn" | "error";
type TraceStep = {
  id?: string;
  name: string;
  type: LogRow["type"];
  duration: string;
  status: "ok" | "error";
  note?: string;
  children?: TraceStep[];
};
type LogRow = {
  id: string;
  time: string;
  type: "tool" | "model" | "agent" | "skill";
  event: string;
  agent: string;
  status: "ok" | "error";
  level: LogLevel;
  latency: string;
  detail: string;
  input?: unknown;
  output?: unknown;
  trace?: TraceStep[];
};

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const dstr = `${yyyy}-${mm}-${dd}`;

const rows: LogRow[] = [
  {
    id: "1", time: `${dstr} 14:32:08`, type: "model", event: "chat.completion", agent: "主 Agent",
    status: "ok", level: "info", latency: "1.24s", detail: "DeepSeek Chat · 1832 in / 421 out",
    input: { model: "deepseek-chat", temperature: 0.3, messages: [{ role: "user", content: "帮我优化这段组件代码" }] },
    output: { role: "assistant", content: "已提取重复逻辑到 useLogs hook，见下方 diff……", tokens: { in: 1832, out: 421 } },
    trace: [
      { name: "resolve.model", type: "model", duration: "6ms", status: "ok", note: "命中 deepseek-chat" },
      {
        name: "http.request", type: "model", duration: "1.18s", status: "ok", note: "POST /v1/chat/completions",
        children: [
          { name: "dns.lookup", type: "model", duration: "12ms", status: "ok", note: "api.deepseek.com" },
          { name: "tls.handshake", type: "model", duration: "84ms", status: "ok" },
          {
            name: "stream.read", type: "model", duration: "1.07s", status: "ok",
            children: [
              { name: "chunk[0..7]", type: "model", duration: "220ms", status: "ok", note: "首 token 到达" },
              { name: "chunk[8..42]", type: "model", duration: "852ms", status: "ok", note: "42 段 SSE 事件" },
            ],
          },
        ],
      },
      { name: "usage.record", type: "model", duration: "3ms", status: "ok" },
    ],
  },
  {
    id: "2", time: `${dstr} 14:32:07`, type: "tool", event: "execute_command", agent: "主 Agent",
    status: "ok", level: "info", latency: "820ms", detail: "$ bun run build",
    input: { command: "bun run build", cwd: "/dev-server", timeout: 60 },
    output: { exitCode: 0, stdout: "vite v7.0.0 building for production...\n✓ built in 812ms", stderr: "" },
    trace: [
      { name: "sandbox.spawn", type: "tool", duration: "18ms", status: "ok" },
      { name: "process.exec", type: "tool", duration: "798ms", status: "ok", note: "exit 0" },
    ],
  },
  {
    id: "3", time: `${dstr} 14:32:05`, type: "tool", event: "write_file", agent: "主 Agent",
    status: "ok", level: "info", latency: "12ms", detail: "src/styles.css (12.4kb)",
    input: { path: "src/styles.css", bytes: 12400 },
    output: { ok: true, path: "src/styles.css" },
  },
  {
    id: "4", time: `${dstr} 14:32:04`, type: "skill", event: "ui-design-system", agent: "主 Agent",
    status: "ok", level: "info", latency: "342ms", detail: "生成 8 条 token 建议",
    input: { skill: "ui-design-system", context: "logs page" },
    output: { suggestions: 8, applied: 5 },
  },
  {
    id: "5", time: `${dstr} 14:32:02`, type: "tool", event: "read_file", agent: "主 Agent",
    status: "ok", level: "info", latency: "8ms", detail: "src/routes/index.tsx",
    input: { path: "src/routes/index.tsx" },
    output: { bytes: 4210, lines: 128 },
  },
  {
    id: "6", time: `${dstr} 13:31:58`, type: "model", event: "chat.completion", agent: "主 Agent",
    status: "ok", level: "warn", latency: "2.14s", detail: "DeepSeek Chat · 输出接近 token 上限",
    input: { model: "deepseek-chat", max_tokens: 800 },
    output: { finish_reason: "length", tokens: { in: 1420, out: 612 } },
  },
  {
    id: "7", time: `${dstr} 11:30:12`, type: "agent", event: "delegate_task", agent: "主 Agent → 文档助手",
    status: "ok", level: "info", latency: "3.42s", detail: "整理会议纪要 · 已返回 2.1kb 内容",
    input: { target: "文档助手", task: "整理今日会议纪要为 Markdown" },
    output: { bytes: 2100, sections: 4 },
    trace: [
      { name: "route.delegate", type: "agent", duration: "12ms", status: "ok", note: "→ 文档助手" },
      {
        name: "child.chat.completion", type: "model", duration: "3.28s", status: "ok",
        children: [
          { name: "child.resolve.model", type: "model", duration: "5ms", status: "ok" },
          { name: "child.http.request", type: "model", duration: "3.20s", status: "ok" },
          { name: "child.usage.record", type: "model", duration: "4ms", status: "ok" },
        ],
      },
      { name: "response.collect", type: "agent", duration: "128ms", status: "ok" },
    ],
  },
  {
    id: "8", time: `${dstr} 10:29:45`, type: "tool", event: "execute_command", agent: "代码助手",
    status: "error", level: "error", latency: "30.0s", detail: "命令超时：git log --all",
    input: { command: "git log --all", timeout: 30 },
    output: { error: "TimeoutError", message: "Command exceeded 30s and was killed." },
    trace: [
      { name: "sandbox.spawn", type: "tool", duration: "22ms", status: "ok" },
      { name: "process.exec", type: "tool", duration: "30.0s", status: "error", note: "SIGKILL after timeout" },
    ],
  },
  {
    id: "9", time: `${dstr} 09:28:11`, type: "model", event: "chat.completion", agent: "代码助手",
    status: "ok", level: "info", latency: "1.87s", detail: "DeepSeek Coder · 2201 in / 890 out",
    input: { model: "deepseek-coder", temperature: 0.2 },
    output: { tokens: { in: 2201, out: 890 } },
  },
];

const iconMap = { tool: Terminal, model: Cpu, agent: Bot, skill: Sparkles };
const colorMap = {
  tool: "text-brand bg-brand-soft",
  model: "text-success bg-success/10",
  agent: "text-foreground bg-accent",
  skill: "text-brand bg-brand-soft",
};

const RANGES = [
  { value: "all", label: "全部时间" },
  { value: "15m", label: "最近 15 分钟" },
  { value: "1h", label: "最近 1 小时" },
  { value: "6h", label: "最近 6 小时" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
];

const LEVELS = [
  { value: "all", label: "全部级别" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const STATUSES = [
  { value: "all", label: "全部状态" },
  { value: "ok", label: "成功" },
  { value: "error", label: "失败" },
];

function parseTs(t: string) {
  return new Date(t.replace(" ", "T")).getTime();
}

function rangeMs(v: string): number | null {
  switch (v) {
    case "15m": return 15 * 60 * 1000;
    case "1h": return 60 * 60 * 1000;
    case "6h": return 6 * 60 * 60 * 1000;
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function safeSlug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "log";
}

async function exportLogsZip(logs: LogRow[]) {
  if (!logs.length) {
    toast.error("当前没有可导出的日志");
    return;
  }
  try {
    const zip = new JSZip();
    const folder = zip.folder("logs")!;
    const report: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    let okCount = 0;
    let warnCount = 0;
    let errCount = 0;

    for (const r of logs) {
      let base = `${r.id}-${safeSlug(r.event)}`;
      let name = base;
      let i = 2;
      while (seen.has(name)) name = `${base}-${i++}`;
      seen.add(name);

      const dir = folder.folder(name)!;
      const hasInput = r.input !== undefined && r.input !== null;
      const hasOutput = r.output !== undefined && r.output !== null;
      if (hasInput) dir.file("input.json", JSON.stringify(r.input, null, 2));
      if (hasOutput) dir.file("output.json", JSON.stringify(r.output, null, 2));
      dir.file("meta.json", JSON.stringify({
        id: r.id, time: r.time, type: r.type, event: r.event, agent: r.agent,
        status: r.status, level: r.level, latency: r.latency, detail: r.detail,
      }, null, 2));

      const issues: string[] = [];
      if (!hasInput) issues.push("缺少 input");
      if (!hasOutput) issues.push("缺少 output");
      if (r.status === "error") issues.push("状态为失败");
      if (r.level === "warn") issues.push("级别为 warn");

      const level: "ok" | "warn" | "error" =
        r.status === "error" ? "error" : issues.length ? "warn" : "ok";
      if (level === "ok") okCount++;
      else if (level === "warn") warnCount++;
      else errCount++;

      report.push({
        folder: name,
        id: r.id,
        event: r.event,
        type: r.type,
        status: r.status,
        level: r.level,
        latency: r.latency,
        hasInput,
        hasOutput,
        validation: level,
        issues,
      });
    }

    const exportedAt = new Date().toISOString();
    zip.file("validation-report.json", JSON.stringify({
      exportedAt,
      total: logs.length,
      summary: { ok: okCount, warn: warnCount, error: errCount },
      entries: report,
    }, null, 2));

    const md = [
      `# 日志导出校验报告`,
      ``,
      `- 导出时间：${exportedAt}`,
      `- 日志总数：${logs.length}`,
      `- 通过：${okCount} · 警告：${warnCount} · 错误：${errCount}`,
      ``,
      `| 文件夹 | 事件 | 类型 | 状态 | 级别 | 校验 | 说明 |`,
      `| --- | --- | --- | --- | --- | --- | --- |`,
      ...report.map((e) => `| ${e.folder} | ${e.event} | ${e.type} | ${e.status} | ${e.level} | ${e.validation} | ${(e.issues as string[]).join("；") || "-"} |`),
    ].join("\n");
    zip.file("validation-report.md", md);

    const blob = await zip.generateAsync({ type: "blob" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `logs-export-${stamp}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${logs.length} 条日志 · ${filename}`);
  } catch {
    toast.error("导出失败，请稍后重试");
  }
}


function LogsPage() {
  const [range, setRange] = useState("all");
  const [level, setLevel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [active, setActive] = useState<LogRow | null>(null);

  const filtered = useMemo(() => {
    const ms = rangeMs(range);
    const now = Date.now();
    return rows.filter((r) => {
      if (ms != null && now - parseTs(r.time) > ms) return false;
      if (level !== "all" && r.level !== level) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [range, level, status]);

  const canReset = range !== "all" || level !== "all" || status !== "all";

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="日志"
        subtitle="Agent 执行、模型调用、工具与技能的结构化日志。点击任意行查看执行详情。"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportLogsZip(filtered)} disabled={filtered.length === 0}>
              <Package className="h-3.5 w-3.5" /> 导出当前日志
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> 刷新
            </Button>
          </div>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <span className="text-xs text-muted-foreground">筛选</span>
        <FilterSelect value={range} onChange={setRange} options={RANGES} width={140} />
        <FilterSelect value={level} onChange={setLevel} options={LEVELS} width={120} />
        <FilterSelect value={status} onChange={setStatus} options={STATUSES} width={120} />
        {canReset && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => { setRange("all"); setLevel("all"); setStatus("all"); }}
          >
            <X className="h-3 w-3" /> 重置
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">共 {filtered.length} 条</span>
      </div>

      <Tabs defaultValue="all" className="mt-4">
        <TabsList className="bg-surface">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="model">模型调用</TabsTrigger>
          <TabsTrigger value="tool">工具执行</TabsTrigger>
          <TabsTrigger value="agent">Agent 编排</TabsTrigger>
          <TabsTrigger value="error">错误</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <LogTable data={filtered} onSelect={setActive} />
        </TabsContent>
        <TabsContent value="model" className="mt-4">
          <LogTable data={filtered.filter((r) => r.type === "model")} onSelect={setActive} emptyText="暂无模型调用日志" />
        </TabsContent>
        <TabsContent value="tool" className="mt-4">
          <LogTable data={filtered.filter((r) => r.type === "tool")} onSelect={setActive} emptyText="暂无工具执行日志" />
        </TabsContent>
        <TabsContent value="agent" className="mt-4">
          <LogTable data={filtered.filter((r) => r.type === "agent")} onSelect={setActive} emptyText="暂无 Agent 编排日志" />
        </TabsContent>
        <TabsContent value="error" className="mt-4">
          <LogTable data={filtered.filter((r) => r.status === "error")} onSelect={setActive} emptyText="暂无错误日志" />
        </TabsContent>
      </Tabs>

      <LogDetailDrawer row={active} onClose={() => setActive(null)} />
    </div>
  );
}

function FilterSelect({
  value, onChange, options, width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width: number;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 bg-surface-elevated text-xs" style={{ width }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const levelStyles: Record<LogLevel, string> = {
  info: "border-border text-muted-foreground",
  warn: "border-warning/40 text-warning",
  error: "border-destructive/40 text-destructive",
};

function LogTable({
  data, onSelect, emptyText = "暂无日志",
}: {
  data: LogRow[];
  onSelect: (r: LogRow) => void;
  emptyText?: string;
}) {
  return (
    <div className="card-warm overflow-hidden">
      <div className="grid grid-cols-[110px_1fr_140px_70px_100px_80px] items-center gap-3 border-b border-border bg-surface/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <div>时间</div>
        <div>事件</div>
        <div>Agent</div>
        <div>级别</div>
        <div>耗时</div>
        <div>状态</div>
      </div>
      {data.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        data.map((r) => {
          const Icon = iconMap[r.type];
          const timeShort = r.time.slice(-8);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className="grid w-full grid-cols-[110px_1fr_140px_70px_100px_80px] items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent/30 focus:outline-none focus:bg-accent/40"
            >
              <span className="font-mono text-[11px] text-muted-foreground" title={r.time}>{timeShort}</span>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colorMap[r.type]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[12px] font-medium text-foreground">{r.event}</span>
                    <Badge variant="outline" className="h-4 border-border text-[9px] font-normal uppercase">
                      {r.type}
                    </Badge>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{r.detail}</p>
                </div>
              </div>
              <span className="truncate text-[12px] text-muted-foreground">{r.agent}</span>
              <Badge variant="outline" className={`h-5 text-[10px] uppercase ${levelStyles[r.level]}`}>
                {r.level}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">{r.latency}</span>
              <span>
                {r.status === "ok" ? (
                  <span className="flex items-center gap-1 text-[11px] text-success">
                    <CheckCircle2 className="h-3 w-3" /> 成功
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> 失败
                  </span>
                )}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

function LogDetailDrawer({ row, onClose }: { row: LogRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {row && (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-5 text-[10px] uppercase">{row.type}</Badge>
                <Badge variant="outline" className={`h-5 text-[10px] uppercase ${levelStyles[row.level]}`}>
                  {row.level}
                </Badge>
                {row.status === "ok" ? (
                  <span className="flex items-center gap-1 text-[11px] text-success">
                    <CheckCircle2 className="h-3 w-3" /> 成功
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> 失败
                  </span>
                )}
              </div>
              <SheetTitle className="font-mono text-base">{row.event}</SheetTitle>
              <SheetDescription>{row.detail}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <MetaCell label="时间" value={row.time} mono />
              <MetaCell label="Agent" value={row.agent} />
              <MetaCell label="耗时" value={row.latency} mono icon={<Clock className="h-3 w-3" />} />
            </div>

            <TraceSection trace={row.trace} rowId={row.id} />


            <Section title="输入" copyValue={row.input} copyLabel="输入" downloadName={`${row.id}-input.json`}>
              <JsonBlock value={row.input} />
            </Section>

            <Section title="输出" copyValue={row.output} copyLabel="输出" downloadName={`${row.id}-output.json`}>
              <JsonBlock value={row.output} />
            </Section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetaCell({
  label, value, mono, icon,
}: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-1 text-[12px] text-foreground ${mono ? "font-mono" : ""}`}>
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function Section({
  title, children, copyValue, copyLabel, downloadName,
}: {
  title: string;
  children: React.ReactNode;
  copyValue?: unknown;
  copyLabel?: string;
  downloadName?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canCopy = copyValue !== undefined && copyValue !== null;
  const canDownload = canCopy && !!downloadName;
  function serialize() {
    return typeof copyValue === "string" ? (copyValue as string) : JSON.stringify(copyValue, null, 2);
  }
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(serialize());
      toast.success(`${copyLabel ?? title}已复制到剪贴板`);
    } catch {
      toast.error("复制失败，请手动选择内容");
    }
  }
  function doDownload(text: string) {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName!;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`已下载 ${downloadName}`);
      setPreviewOpen(false);
    } catch {
      toast.error("下载失败，请稍后重试");
    }
  }
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
        <div className="flex items-center gap-1">
          {canDownload && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={() => setPreviewOpen(true)}
            >
              <Download className="h-3 w-3" /> 下载 JSON
            </Button>
          )}
          {canCopy && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3" /> 复制
            </Button>
          )}
        </div>
      </div>
      {children}
      {canDownload && (
        <DownloadPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          label={copyLabel ?? title}
          filename={downloadName!}
          rawValue={copyValue}
          onConfirm={doDownload}
        />
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type PathCheck = { ok: boolean; level: "ok" | "warn" | "error"; message: string };
function validateFilename(name: string): PathCheck[] {
  const checks: PathCheck[] = [];
  const hasTraversal = name.includes("/") || name.includes("\\") || name.includes("..");
  checks.push(hasTraversal
    ? { ok: false, level: "error", message: "文件名不得包含路径分隔符或 .. 片段" }
    : { ok: true, level: "ok", message: "文件名不含路径分隔符" });
  const validChars = /^[A-Za-z0-9._-]+$/.test(name);
  checks.push(validChars
    ? { ok: true, level: "ok", message: "字符集合法（字母/数字/._-）" }
    : { ok: false, level: "warn", message: "建议仅使用字母、数字、点、下划线与短横线" });
  const endsJson = name.toLowerCase().endsWith(".json");
  checks.push(endsJson
    ? { ok: true, level: "ok", message: "扩展名为 .json" }
    : { ok: false, level: "error", message: "文件必须以 .json 结尾" });
  const lenOk = name.length > 0 && name.length <= 120;
  checks.push(lenOk
    ? { ok: true, level: "ok", message: `文件名长度合法（${name.length}/120）` }
    : { ok: false, level: "error", message: "文件名长度需在 1–120 之间" });
  return checks;
}

function DownloadPreviewDialog({
  open, onOpenChange, label, filename, rawValue, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: string;
  filename: string;
  rawValue: unknown;
  onConfirm: (text: string) => void;
}) {
  const [format, setFormat] = useState<"pretty" | "min">("pretty");
  const [revalidateNonce, setRevalidateNonce] = useState(0);
  const [revalidating, setRevalidating] = useState(false);
  const [lastValidatedAt, setLastValidatedAt] = useState<number>(() => Date.now());
  const content = useMemo(() => {
    if (typeof rawValue === "string") return rawValue as string;
    return format === "pretty" ? JSON.stringify(rawValue, null, 2) : JSON.stringify(rawValue);
  }, [rawValue, format]);
  const prettySize = useMemo(() => new Blob([typeof rawValue === "string" ? (rawValue as string) : JSON.stringify(rawValue, null, 2)]).size, [rawValue, revalidateNonce]);
  const minSize = useMemo(() => new Blob([typeof rawValue === "string" ? (rawValue as string) : JSON.stringify(rawValue)]).size, [rawValue, revalidateNonce]);
  const size = useMemo(() => new Blob([content]).size, [content, revalidateNonce]);
  const savedPct = prettySize > 0 ? Math.max(0, Math.round((1 - minSize / prettySize) * 100)) : 0;
  const checks = useMemo(() => validateFilename(filename), [filename, revalidateNonce]);
  const blocked = checks.some((c) => c.level === "error");
  const errorCount = checks.filter((c) => c.level === "error").length;
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const handleRevalidate = () => {
    setRevalidating(true);
    window.setTimeout(() => {
      setRevalidateNonce((n) => n + 1);
      setLastValidatedAt(Date.now());
      setRevalidating(false);
      const next = validateFilename(filename);
      const errs = next.filter((c) => c.level === "error").length;
      const warns = next.filter((c) => c.level === "warn").length;
      toast.success("已重新校验", {
        description: `${next.length} 项检查 · ${errs} 错误 · ${warns} 警告`,
      });
    }, 400);
  };
  const savePath = `~/Downloads/${filename}`;
  const isString = typeof rawValue === "string";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>下载预览 · {label}</DialogTitle>
          <DialogDescription>切换格式后预览和下载的内容将保持一致。</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-surface-elevated p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">文件名</div>
            <div className="mt-1 truncate font-mono text-[12px] text-foreground">{filename}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-elevated p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">大小</div>
            <div className="mt-1 font-mono text-[12px] text-foreground">
              {formatBytes(size)}
              {!isString && format === "min" && savedPct > 0 && (
                <span className="ml-1 text-[10px] text-success">-{savedPct}%</span>
              )}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-border bg-surface-elevated p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">保存路径</div>
            <div className="mt-1 truncate font-mono text-[12px] text-foreground">{savePath}</div>
          </div>
        </div>

        {!isString && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">格式</span>
            <div className="inline-flex rounded-md border border-border bg-surface-elevated p-0.5">
              <button
                type="button"
                onClick={() => setFormat("pretty")}
                className={`h-6 rounded px-2 text-[11px] transition-colors ${format === "pretty" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                格式化
              </button>
              <button
                type="button"
                onClick={() => setFormat("min")}
                className={`h-6 rounded px-2 text-[11px] transition-colors ${format === "min" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                压缩
              </button>
            </div>
            <span className="ml-auto text-[10px] text-muted-foreground">
              格式化 {formatBytes(prettySize)} · 压缩 {formatBytes(minSize)}
            </span>
          </div>
        )}

        <div className="mt-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">路径校验</span>
            <span className="text-[10px] text-muted-foreground">
              上次校验 {new Date(lastValidatedAt).toLocaleTimeString()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRevalidate}
              disabled={revalidating}
              className="ml-auto h-6 gap-1 px-2 text-[11px] text-muted-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${revalidating ? "animate-spin" : ""}`} />
              {revalidating ? "校验中…" : "重新校验"}
            </Button>
          </div>
          <ul className="space-y-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                {c.level === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : c.level === "warn" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                ) : (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className={c.level === "error" ? "text-destructive" : c.level === "warn" ? "text-warning" : "text-muted-foreground"}>
                  {c.message}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">内容预览</div>
          <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-surface-elevated p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all">
            {content.length > 4000 ? content.slice(0, 4000) + "\n… (已截断预览)" : content}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => onConfirm(content)} disabled={blocked || revalidating} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            {revalidating ? "校验中…" : blocked ? "校验未通过" : "确认下载"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <EmptyHint text="无数据" />;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface-elevated p-3 font-mono text-[11px] leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-elevated px-3 py-4 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}

function stepPath(prefix: string, index: number, step: TraceStep) {
  return step.id ?? `${prefix}/${index}:${step.name}`;
}

function parseDuration(d: string): number {
  const m = d.trim().match(/^([\d.]+)\s*(ms|s|m)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "ms") return n;
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60_000;
  return n;
}

function sumTopLevel(trace: TraceStep[] | undefined): number {
  if (!trace) return 0;
  return trace.reduce((acc, s) => acc + parseDuration(s.duration), 0);
}

type HeatLevel = "hot" | "warm" | "cool";
function heatOf(pct: number): HeatLevel {
  if (pct >= 0.4) return "hot";
  if (pct >= 0.2) return "warm";
  return "cool";
}

const heatBar: Record<HeatLevel, string> = {
  hot: "bg-destructive",
  warm: "bg-warning",
  cool: "bg-brand/60",
};
const heatText: Record<HeatLevel, string> = {
  hot: "text-destructive",
  warm: "text-warning",
  cool: "text-muted-foreground",
};
const heatCard: Record<HeatLevel, string> = {
  hot: "border-destructive/40 bg-destructive/5",
  warm: "border-warning/40 bg-warning/10",
  cool: "",
};

function collectPaths(trace: TraceStep[] | undefined, prefix = "root"): string[] {
  if (!trace) return [];
  const paths: string[] = [];
  trace.forEach((s, i) => {
    const p = stepPath(prefix, i, s);
    if (s.children && s.children.length > 0) {
      paths.push(p);
      paths.push(...collectPaths(s.children, p));
    }
  });
  return paths;
}

function findMatches(
  trace: TraceStep[] | undefined,
  q: string,
  prefix = "root",
  ancestors: string[] = [],
): { matched: Set<string>; expand: Set<string> } {
  const matched = new Set<string>();
  const expand = new Set<string>();
  if (!trace) return { matched, expand };
  const needle = q.toLowerCase();
  trace.forEach((s, i) => {
    const p = stepPath(prefix, i, s);
    const hay = `${s.name} ${s.note ?? ""}`.toLowerCase();
    if (hay.includes(needle)) {
      matched.add(p);
      ancestors.forEach((a) => expand.add(a));
    }
    if (s.children && s.children.length > 0) {
      const sub = findMatches(s.children, q, p, [...ancestors, p]);
      sub.matched.forEach((m) => matched.add(m));
      sub.expand.forEach((e) => expand.add(e));
    }
  });
  return { matched, expand };
}

function TraceSection({ trace, rowId }: { trace?: TraceStep[]; rowId: string }) {
  const allPaths = useMemo(() => collectPaths(trace), [trace]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allPaths));
  const [query, setQuery] = useState("");

  // reset when switching rows
  useEffect(() => {
    setExpanded(new Set(allPaths));
    setQuery("");
  }, [rowId, allPaths]);

  const q = query.trim();
  const { matched, expand: forceExpand } = useMemo(
    () => (q ? findMatches(trace, q) : { matched: new Set<string>(), expand: new Set<string>() }),
    [trace, q],
  );
  const effectiveExpanded = useMemo(() => {
    if (!q) return expanded;
    const next = new Set(expanded);
    forceExpand.forEach((p) => next.add(p));
    return next;
  }, [expanded, forceExpand, q]);

  const has = trace && trace.length > 0;
  const anyChildren = allPaths.length > 0;
  const allOpen = anyChildren && allPaths.every((p) => effectiveExpanded.has(p));

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">调用链</h3>
        {has && anyChildren && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => setExpanded(allOpen ? new Set() : new Set(allPaths))}
          >
            {allOpen ? (
              <><Minimize2 className="h-3 w-3" /> 全部折叠</>
            ) : (
              <><ListTree className="h-3 w-3" /> 展开全部</>
            )}
          </Button>
        )}
      </div>
      {has && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索节点名或备注…"
            className="h-8 bg-surface-elevated pl-7 pr-16 text-xs"
          />
          {q && (
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{matched.size} 命中</span>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                aria-label="清除搜索"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      )}
      {has ? (
        <ol className="space-y-1.5">
          {trace!.map((s, i) => (
            <TraceNode
              key={stepPath("root", i, s)}
              step={s}
              path={stepPath("root", i, s)}
              depth={0}
              expanded={effectiveExpanded}
              onToggle={toggle}
              query={q}
              matched={matched}
              totalMs={sumTopLevel(trace)}
            />
          ))}
        </ol>
      ) : (
        <EmptyHint text="该事件无子调用链" />
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-warning/25 px-0.5 text-foreground">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

function TraceNode({
  step, path, depth, expanded, onToggle, query, matched, totalMs,
}: {
  step: TraceStep;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (p: string) => void;
  query: string;
  matched: Set<string>;
  totalMs: number;
}) {
  const Icon = iconMap[step.type];
  const hasChildren = !!step.children && step.children.length > 0;
  const isOpen = expanded.has(path);
  const isHit = query && matched.has(path);
  const ms = parseDuration(step.duration);
  const pct = totalMs > 0 ? Math.min(1, ms / totalMs) : 0;
  const heat = heatOf(pct);
  const pctLabel = `${(pct * 100).toFixed(pct >= 0.1 ? 0 : 1)}%`;

  return (
    <li>
      <div
        className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${
          isHit
            ? "border-warning/60 bg-warning/10"
            : heat !== "cool"
              ? heatCard[heat]
              : "border-border bg-surface-elevated"
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(path)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
            hasChildren ? "hover:bg-accent" : "opacity-30 cursor-default"
          }`}
          aria-label={hasChildren ? (isOpen ? "折叠" : "展开") : undefined}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${colorMap[step.type]}`}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-medium">
              <Highlight text={step.name} query={query} />
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className={`font-mono text-[11px] ${heat === "cool" ? "text-muted-foreground" : `${heatText[heat]} font-semibold`}`}>
              {step.duration}
            </span>
            {heat === "hot" && (
              <Badge variant="outline" className="h-4 border-destructive/40 text-[9px] uppercase text-destructive">
                热点
              </Badge>
            )}
            {step.status === "error" && (
              <Badge variant="outline" className="h-4 border-destructive/40 text-[9px] text-destructive">error</Badge>
            )}
            {hasChildren && (
              <Badge variant="outline" className="h-4 border-border text-[9px] text-muted-foreground">
                {step.children!.length} 子步骤
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border/60" title={`占本次调用 ${pctLabel}`}>
              <div
                className={`h-full ${heatBar[heat]} transition-all`}
                style={{ width: `${Math.max(pct * 100, 2)}%` }}
              />
            </div>
            <span className={`shrink-0 font-mono text-[10px] tabular-nums ${heatText[heat]}`}>{pctLabel}</span>
          </div>
          {step.note && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              <Highlight text={step.note} query={query} />
            </p>
          )}
        </div>
      </div>
      {hasChildren && isOpen && (
        <ol className="mt-1.5 space-y-1.5">
          {step.children!.map((c, i) => {
            const childPath = stepPath(path, i, c);
            return (
              <TraceNode
                key={childPath}
                step={c}
                path={childPath}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                query={query}
                matched={matched}
                totalMs={totalMs}
              />
            );
          })}
        </ol>
      )}
    </li>
  );
}


