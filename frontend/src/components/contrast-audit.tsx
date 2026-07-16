import { useEffect, useMemo, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  evaluateContrast,
  summarize,
  type ContrastResult,
  type ThemeScope,
} from "@/lib/contrast";
import { toast } from "sonner";

/**
 * Design Token 对比度审计面板。
 * - 同时评估浅色 / 深色主题下的所有关键配对
 * - 计算 WCAG 2.1 相对亮度对比度
 * - 失败项以红色徽标高亮，警告项以琥珀色
 * - “重新校验” 会重新读取 CSS 变量（用于自定义 accent 后刷新）
 */
export function ContrastAudit() {
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 首次进入下一 tick 再评估，等主题脚本注入 & 字体加载完成
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const light = useMemo<ContrastResult[]>(
    () => (ready ? evaluateContrast("light") : []),
    [ready, tick]
  );
  const dark = useMemo<ContrastResult[]>(
    () => (ready ? evaluateContrast("dark") : []),
    [ready, tick]
  );

  const revalidate = useCallback(() => {
    setTick((t) => t + 1);
    const l = evaluateContrast("light");
    const d = evaluateContrast("dark");
    const totalFail = summarize(l).fail + summarize(d).fail;
    if (totalFail === 0) {
      toast.success("对比度校验通过", {
        description: "所有关键文本 / 按钮组合均满足 WCAG AA。",
      });
    } else {
      toast.error(`发现 ${totalFail} 项对比度失败`, {
        description: "请调整 tokens.css 中对应变量或强调色。",
      });
    }
  }, []);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            对比度自动校验
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            依据 WCAG 2.1 计算 <code>tokens.css</code> 里主要文本 / 按钮 / 边框在浅色与深色下的对比度。
            文本目标 4.5:1，非文本 UI 目标 3:1。修改令牌后点击“重新校验”即可刷新。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={revalidate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新校验
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ScopePanel scope="light" results={light} />
        <ScopePanel scope="dark" results={dark} />
      </div>
    </Card>
  );
}

function ScopePanel({ scope, results }: { scope: ThemeScope; results: ContrastResult[] }) {
  const stats = summarize(results);
  const hasIssue = stats.fail + stats.warn > 0;
  const label = scope === "light" ? "浅色主题" : "深色主题";

  return (
    <section
      aria-label={`${label}对比度报告`}
      className="rounded-lg border border-border bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {stats.fail > 0 ? (
            <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden />
          ) : hasIssue ? (
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
          )}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-1.5" role="status" aria-live="polite">
          <StatBadge tone="success" count={stats.pass} label="通过" />
          <StatBadge tone="warning" count={stats.warn} label="警告" />
          <StatBadge tone="destructive" count={stats.fail} label="失败" />
        </div>
      </header>

      <ul className="divide-y divide-border">
        {results.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            正在计算…
          </li>
        ) : (
          results.map((r) => <ResultRow key={r.id} result={r} />)
        )}
      </ul>
    </section>
  );
}

function StatBadge({
  tone,
  count,
  label,
}: {
  tone: "success" | "warning" | "destructive";
  count: number;
  label: string;
}) {
  const bg =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
      ? "bg-warning/20 text-warning-foreground"
      : "bg-destructive/15 text-destructive";
  return (
    <span
      className={`inline-flex min-w-[52px] items-center justify-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] ${bg}`}
      aria-label={`${label} ${count} 项`}
    >
      <span className="font-semibold tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}

function ResultRow({ result }: { result: ContrastResult }) {
  const { label, usage, ratio, minRatio, status, fgColor, bgColor, kind, fg, bg } = result;
  const statusMeta =
    status === "pass"
      ? { icon: CheckCircle2, tone: "text-success", text: "通过" }
      : status === "warn"
      ? { icon: AlertTriangle, tone: "text-warning", text: "警告" }
      : { icon: ShieldAlert, tone: "text-destructive", text: "失败" };
  const Icon = statusMeta.icon;

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
      {/* 前景 / 背景实样 */}
      <div
        className="grid h-11 w-14 shrink-0 place-items-center rounded-md border border-border font-mono text-[11px] font-semibold"
        style={{ backgroundColor: bgColor || undefined, color: fgColor || undefined }}
        aria-hidden
        title={`${fgColor} on ${bgColor}`}
      >
        Aa
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {kind === "border" || kind === "ui" ? "UI ≥3" : "Text ≥4.5"}
          </Badge>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          --{fg} on --{bg} · {usage}
        </p>
      </div>

      <div className="flex items-center gap-2 text-right">
        <div>
          <div className={`font-mono text-sm font-semibold tabular-nums ${statusMeta.tone}`}>
            {ratio.toFixed(2)}:1
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            目标 {minRatio.toFixed(1)}
          </div>
        </div>
        <Icon className={`h-4 w-4 ${statusMeta.tone}`} aria-label={statusMeta.text} />
      </div>
    </li>
  );
}
