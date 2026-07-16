import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Circle,
  ChevronDown,
  ChevronRight,
  Copy,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { MockTestResult, TestStep, TestStepState } from "@/lib/mock-test";
import { formatSince } from "@/lib/mock-test";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  subtitle?: string;
  result: MockTestResult | null;
  onRetry?: () => void;
  retrying?: boolean;
};

const STATE_META: Record<TestStepState, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "通过", tone: "text-success", Icon: CheckCircle2 },
  warn: { label: "告警", tone: "text-warning", Icon: AlertTriangle },
  fail: { label: "失败", tone: "text-destructive", Icon: AlertCircle },
  skip: { label: "跳过", tone: "text-muted-foreground", Icon: Circle },
};

export function TestDetailDialog({ open, onOpenChange, title, subtitle, result, onRetry, retrying }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            连通性测试详情 · {title}
          </DialogTitle>
          <DialogDescription>
            {subtitle ?? "按鉴权、权限、目标端可达性等步骤逐条展示模拟日志与失败原因。"}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
            尚未运行连通性测试，点击「运行测试」开始。
          </div>
        ) : (
          <>
            <Summary result={result} />
            <ScrollArea className="max-h-[440px] rounded-md border border-border">
              <ol className="divide-y divide-border">
                {(result.steps ?? []).map((s, i) => (
                  <StepRow key={s.id} step={s} index={i + 1} total={result.latency} />
                ))}
                {!result.steps?.length && (
                  <li className="p-4 text-sm text-muted-foreground">此测试未产生分步日志。</li>
                )}
              </ol>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          {onRetry && (
            <Button variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              重新测试
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ result }: { result: MockTestResult }) {
  const steps = result.steps ?? [];
  const okN = steps.filter((s) => s.state === "ok").length;
  const warnN = steps.filter((s) => s.state === "warn").length;
  const failN = steps.filter((s) => s.state === "fail").length;
  const skipN = steps.filter((s) => s.state === "skip").length;
  const tone = result.ok
    ? failN === 0 && warnN === 0
      ? "bg-success/10 text-success"
      : "bg-warning/10 text-warning"
    : "bg-destructive/10 text-destructive";
  const Icon = result.ok ? (warnN > 0 ? AlertTriangle : CheckCircle2) : AlertCircle;
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-medium">{result.ok ? (warnN > 0 ? "完成（有告警）" : "全部通过") : "测试失败"}</span>
        <span className="ml-auto text-xs opacity-80">
          {result.latency}ms · {formatSince(result.ts)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs opacity-90">
        <span>共 {steps.length} 步</span>
        <span>通过 {okN}</span>
        {warnN > 0 && <span>告警 {warnN}</span>}
        {failN > 0 && <span>失败 {failN}</span>}
        {skipN > 0 && <span>跳过 {skipN}</span>}
      </div>
      <div className="mt-1 text-xs opacity-90">{result.message}</div>
    </div>
  );
}

function StepRow({ step, index, total }: { step: TestStep; index: number; total: number }) {
  const [open, setOpen] = useState(step.state !== "ok");
  const meta = STATE_META[step.state];
  const pct = total > 0 ? Math.min(100, Math.round((step.latency / total) * 100)) : 0;
  const hasBody = (step.logs && step.logs.length > 0) || step.suggestion || step.meta;

  async function copyLogs() {
    if (!step.logs?.length) return;
    try {
      await navigator.clipboard.writeText(step.logs.join("\n"));
      toast.success("日志已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <li className="p-3">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={`flex w-full items-start gap-2 text-left ${hasBody ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
          {index}
        </div>
        <meta.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{step.label}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${meta.tone.replace("text-", "bg-")}/10 ${meta.tone}`}>
              {meta.label}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {step.latency}ms · {pct}%
            </span>
          </div>
          {step.detail && (
            <div className={`mt-0.5 text-[12px] ${step.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>
              {step.detail}
            </div>
          )}
          <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
            <div
              className={`h-full ${step.state === "fail" ? "bg-destructive" : step.state === "warn" ? "bg-warning" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {hasBody && (
          <div className="mt-0.5 text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        )}
      </button>

      {open && hasBody && (
        <div className="mt-2 space-y-2 pl-9">
          {step.meta && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(step.meta).map(([k, v]) => (
                <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}
          {step.suggestion && (
            <div className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
              <span>建议：{step.suggestion}</span>
            </div>
          )}
          {step.logs && step.logs.length > 0 && (
            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border px-2 py-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Logs</span>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={copyLogs}>
                  <Copy className="mr-1 h-3 w-3" />复制
                </Button>
              </div>
              <pre className="max-h-40 overflow-auto p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
{step.logs.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
