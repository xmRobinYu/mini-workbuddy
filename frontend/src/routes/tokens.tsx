import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContrastAudit } from "@/components/contrast-audit";
import { ColorVisionPanel } from "@/components/color-vision-panel";
import { toast } from "sonner";

export const Route = createFileRoute("/tokens")({
  head: () => ({
    meta: [
      { title: "Design Tokens 预览 · Mini-WorkBuddy" },
      {
        name: "description",
        content: "浏览 tokens.css 中的颜色、圆角、阴影与字体变量，查看示例用法并一键复制。",
      },
      { property: "og:title", content: "Design Tokens 预览" },
      {
        property: "og:description",
        content: "浏览 tokens.css 中的所有设计令牌，方便协作与迭代。",
      },
    ],
  }),
  component: TokensPage,
});

/** 颜色令牌分组 —— 对应 tokens.css 的语义类别 */
const COLOR_GROUPS: {
  group: string;
  hint: string;
  items: { name: string; usage: string; on?: string }[];
}[] = [
  {
    group: "表面 · Surface",
    hint: "页面背景、卡片与浮层的层级",
    items: [
      { name: "background", usage: "bg-background", on: "text-foreground" },
      { name: "foreground", usage: "text-foreground", on: "bg-background" },
      { name: "surface", usage: "bg-surface", on: "text-foreground" },
      { name: "surface-elevated", usage: "bg-surface-elevated", on: "text-foreground" },
      { name: "card", usage: "bg-card", on: "text-card-foreground" },
      { name: "popover", usage: "bg-popover", on: "text-popover-foreground" },
    ],
  },
  {
    group: "品牌 · Brand",
    hint: "主要 CTA 与强调色",
    items: [
      { name: "brand", usage: "bg-brand", on: "text-brand-foreground" },
      { name: "brand-foreground", usage: "text-brand-foreground", on: "bg-brand" },
      { name: "brand-soft", usage: "bg-brand-soft", on: "text-brand" },
    ],
  },
  {
    group: "语义 · Semantic",
    hint: "次级按钮、灰阶背景",
    items: [
      { name: "primary", usage: "bg-primary", on: "text-primary-foreground" },
      { name: "secondary", usage: "bg-secondary", on: "text-secondary-foreground" },
      { name: "muted", usage: "bg-muted", on: "text-muted-foreground" },
      { name: "accent", usage: "bg-accent", on: "text-accent-foreground" },
    ],
  },
  {
    group: "反馈 · Feedback",
    hint: "成功 / 警告 / 危险状态",
    items: [
      { name: "success", usage: "bg-success", on: "text-white" },
      { name: "warning", usage: "bg-warning", on: "text-warning-foreground" },
      { name: "destructive", usage: "bg-destructive", on: "text-destructive-foreground" },
    ],
  },
  {
    group: "线条与焦点 · Lines",
    hint: "边框、输入框、焦点环",
    items: [
      { name: "border", usage: "border-border" },
      { name: "input", usage: "border-input" },
      { name: "ring", usage: "ring-ring", on: "text-foreground" },
      { name: "overlay", usage: "bg-overlay", on: "text-white" },
    ],
  },
  {
    group: "图表 · Chart",
    hint: "recharts 5 色轮转 + 网格",
    items: [
      { name: "chart-1", usage: "bg-chart-1", on: "text-white" },
      { name: "chart-2", usage: "bg-chart-2", on: "text-white" },
      { name: "chart-3", usage: "bg-chart-3", on: "text-white" },
      { name: "chart-4", usage: "bg-chart-4", on: "text-white" },
      { name: "chart-5", usage: "bg-chart-5", on: "text-white" },
      { name: "chart-grid", usage: "stroke-chart-grid" },
      { name: "chart-axis", usage: "fill-chart-axis" },
    ],
  },
  {
    group: "侧边栏 · Sidebar",
    hint: "AppSidebar 专属令牌",
    items: [
      { name: "sidebar", usage: "bg-sidebar", on: "text-sidebar-foreground" },
      { name: "sidebar-primary", usage: "bg-sidebar-primary", on: "text-sidebar-primary-foreground" },
      { name: "sidebar-accent", usage: "bg-sidebar-accent", on: "text-sidebar-accent-foreground" },
      { name: "sidebar-border", usage: "border-sidebar-border" },
    ],
  },
];

const RADII = [
  { name: "radius-sm", usage: "rounded-sm" },
  { name: "radius-md", usage: "rounded-md" },
  { name: "radius-lg", usage: "rounded-lg" },
  { name: "radius-xl", usage: "rounded-xl" },
  { name: "radius-2xl", usage: "rounded-2xl" },
];

const FONTS = [
  { name: "font-display", usage: "font-display", sample: "Space Grotesk · 展示" },
  { name: "font-sans", usage: "font-sans", sample: "DM Sans · 正文 Body" },
  { name: "font-mono", usage: "font-mono", sample: "JetBrains Mono · 01234" },
];

function useResolvedVar(cssVar: string) {
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    setValue(v);
  }, [cssVar]);
  return value;
}

function ColorSwatch({
  name,
  usage,
  on,
}: {
  name: string;
  usage: string;
  on?: string;
}) {
  const cssVar = `--${name}`;
  const resolved = useResolvedVar(cssVar);
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`已复制：${text}`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={`flex h-20 items-end justify-between px-3 py-2 ${usage} ${on ?? ""}`}
      >
        <span className="font-mono text-[11px] opacity-80">{cssVar}</span>
        <span className="font-mono text-[11px] opacity-80">{usage}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] text-foreground">{name}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground" title={resolved}>
            {resolved || "—"}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`复制 var(${cssVar})`}
          onClick={() => copy(`var(${cssVar})`)}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function TokensPage() {
  return (
    <div className="page-shell section-stack">
      <PageHeader
        title="Design Tokens 预览"
        subtitle="所有颜色、圆角、阴影、字体都定义在 src/styles/tokens.css。修改令牌即可整站换肤；此页会跟随浅/深色主题实时刷新。"
        action={
          <Badge variant="outline" className="font-mono text-[11px]">
            source: styles/tokens.css
          </Badge>
        }
      />
      <ContrastAudit />
      <ColorVisionPanel />


      {COLOR_GROUPS.map((g) => (
        <section key={g.group} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-foreground">{g.group}</h2>
            <span className="text-xs text-muted-foreground">{g.hint}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {g.items.map((c) => (
              <ColorSwatch key={c.name} name={c.name} usage={c.usage} on={c.on} />
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">圆角 · Radius</h2>
          <span className="text-xs text-muted-foreground">基础值 --radius = 0.5rem</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-5">
          {RADII.map((r) => (
            <Card key={r.name} className="flex flex-col items-center gap-2 p-4">
              <div className={`h-14 w-14 border border-border bg-brand-soft ${r.usage}`} />
              <div className="text-center">
                <div className="font-mono text-[12px] text-foreground">{r.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{r.usage}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">阴影 · Shadow</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {[
            { name: "shadow-card", usage: "shadow-[var(--shadow-card)]", label: "card 卡片阴影" },
            { name: "shadow-sm", usage: "shadow-sm", label: "sm 极轻" },
            { name: "shadow-md", usage: "shadow-md", label: "md 中等" },
            { name: "shadow-lg", usage: "shadow-lg", label: "lg 显著" },
          ].map((s) => (
            <div
              key={s.name}
              className={`flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-5 ${s.usage}`}
            >
              <div className="font-mono text-[12px] text-foreground">{s.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">字体 · Typography</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FONTS.map((f) => (
            <Card key={f.name} className="p-4">
              <div className={`text-xl text-foreground ${f.usage}`}>{f.sample}</div>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                var(--{f.name})
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">用法示例 · Usage</h2>
        <Card className="p-4">
          <pre className="overflow-auto rounded-md border border-border bg-surface-elevated p-3 font-mono text-[12px] leading-relaxed text-foreground">
{`/* 在 CSS 中直接引用 */
.custom {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

/* 在 Tailwind 中使用桥接后的工具类 */
<div className="bg-brand text-brand-foreground rounded-lg shadow-sm" />`}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            所有 <code>--&lt;name&gt;</code> 原始变量在 <code>src/styles.css</code> 的{" "}
            <code>@theme inline</code> 中桥接为 <code>--color-&lt;name&gt;</code>，
            Tailwind 工具类（如 <code>bg-brand</code>）自动生成。
          </p>
        </Card>
      </section>
    </div>
  );
}
