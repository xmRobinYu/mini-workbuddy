import { createFileRoute } from "@tanstack/react-router";
import { Brain, Clock, Archive, Search, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/memory")({
  component: MemoryPage,
});

const longTerm = [
  "用户偏好暖色调极简风格，参考 Linear 的信息密度",
  "项目使用 Bun + TanStack Start，禁用 npm/yarn",
  "所有配色使用 oklch 格式，主色为赤陶色 oklch(0.6 0.14 42)",
  "命令行执行需在 workspace 目录，超时 30s",
  "PRD 版本 v1.1，P0 聚焦 6 大模块 + 记忆/压缩/协作/日志",
];

const shortTerm = [
  { date: "2026-07-15", items: 4, size: "1.2 KB" },
  { date: "2026-07-14", items: 7, size: "2.8 KB" },
  { date: "2026-07-13", items: 3, size: "0.9 KB" },
  { date: "2026-07-12", items: 5, size: "1.6 KB" },
];

function MemoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <PageHeader
        title="记忆"
        subtitle="长期记忆持久保存跨会话事实，短期记忆按天归档，7 天后自动清理。"
      />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-4 w-4 text-brand" /> 长期记忆
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">14.6</span>
            <span className="text-sm text-muted-foreground">KB / 50 KB</span>
          </div>
          <Progress value={29} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            达到 50KB 上限时自动触发摘要压缩
          </p>
        </div>
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-brand" /> 短期记忆
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">19</span>
            <span className="text-sm text-muted-foreground">条 · 4 天</span>
          </div>
          <Progress value={57} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">7 天后归档到 archive/</p>
        </div>
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Archive className="h-4 w-4 text-brand" /> 已归档
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">128</span>
            <span className="text-sm text-muted-foreground">条历史</span>
          </div>
          <Progress value={80} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">可通过 search_memory 检索</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-warm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">长期记忆</h3>
              <p className="text-xs text-muted-foreground">memory.md · 自动注入所有会话的系统提示词</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Search className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> 编辑
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border/60">
            {longTerm.map((m, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-foreground">{m}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    saved by save_memory · 2 天前
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-warm overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-base font-semibold text-foreground">短期记忆</h3>
            <p className="text-xs text-muted-foreground">按天归档 · memory/YYYY-MM-DD.md</p>
          </div>
          <ul className="divide-y divide-border/60">
            {shortTerm.map((d) => (
              <li key={d.date} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="font-mono text-[13px] text-foreground">{d.date}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.items} 条 · {d.size}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[12px]">
                  查看
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card-warm mt-5 p-5">
        <h3 className="font-display text-base font-semibold text-foreground">
          上下文压缩
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          使用 tiktoken 实时计算 token，达到窗口 75% 时自动触发压缩，保留最近 10% 原始消息 +
          摘要，支持多次压缩。
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">当前会话上下文</span>
            <span className="text-muted-foreground">
              <span className="font-mono">8,240</span> / 128,000 tokens
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand" style={{ width: "6%" }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            距离自动压缩阈值还有 87,760 tokens
          </p>
        </div>
      </div>
    </div>
  );
}
