import { useState, type CSSProperties } from "react";
import { Monitor, Moon, Sun, Check, Type } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { CvdPicker } from "@/components/cvd-picker";
import { CVD_MATRICES, cvdFilterFor, useCvd } from "@/lib/cvd";
import { cn } from "@/lib/utils";

/** 无障碍字号缩放档位——用于在预览中检查不同字号下的排版一致性。 */
const SCALE_OPTIONS = [
  { value: 0.9, label: "90%", hint: "紧凑" },
  { value: 1, label: "100%", hint: "默认" },
  { value: 1.15, label: "115%", hint: "较大" },
  { value: 1.3, label: "130%", hint: "无障碍" },
] as const;

type ScaleValue = (typeof SCALE_OPTIONS)[number]["value"];

const OPTIONS: Array<{ value: ThemeMode; label: string; hint: string; icon: typeof Sun }> = [
  { value: "light", label: "浅色", hint: "始终使用浅色界面", icon: Sun },
  { value: "dark", label: "深色", hint: "始终使用深色界面", icon: Moon },
  { value: "system", label: "跟随系统", hint: "随系统偏好自动切换", icon: Monitor },
];

/**
 * Mini component sampler — rendered inside a `.light` or `.dark` scope so its
 * tokens resolve to the target theme regardless of the app's current theme.
 * Shows the four color roles most likely to break: surface, brand, muted,
 * warning/destructive, plus border and shadow.
 */
function PreviewSurface({
  variant,
  scale,
  cvdFilter,
}: {
  variant: "light" | "dark";
  scale: ScaleValue;
  cvdFilter: string;
}) {
  // `zoom` 会等比缩放子节点（文字 + 内边距 + 图标 + SVG），
  // 从而如实反映真实字号变化下的排版；相比 transform scale 不需要额外补偿高度。
  const scaledStyle = {
    colorScheme: variant,
    // 非标准但主流浏览器（含 Firefox 126+）已实现
    zoom: scale,
    // 全局 CVD 联动——normal 时为 "none"，其余引用挂载在根节点的 SVG 滤镜
    filter: cvdFilter,
  } as CSSProperties;

  return (
    <div
      className={cn(
        variant,
        "rounded-md border border-border bg-background p-3 shadow-[var(--shadow-card)]",
      )}
      // Force color-scheme so native form controls (if any) match the preview.
      style={scaledStyle}
    >
      {/* Toolbar row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          <span className="h-2 w-2 rounded-full bg-warning" />
          <span className="h-2 w-2 rounded-full bg-success" />
        </div>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
          preview
        </span>
      </div>

      {/* Card */}
      <div className="mt-2 rounded-md border border-border bg-card p-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-card-foreground">Agent 配置</span>
          <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium text-brand">
            在线
          </span>
        </div>
        <div className="mt-1 h-1 w-full rounded-full bg-muted">
          <div className="h-1 w-2/3 rounded-full bg-brand" />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          正文示例 · muted-foreground
        </p>
      </div>

      {/* Button row */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-brand-foreground">
          主要
        </span>
        <span className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] text-foreground">
          次级
        </span>
        <span className="ml-auto rounded-md bg-destructive/10 px-1.5 py-1 text-[10px] font-medium text-destructive">
          警告
        </span>
      </div>

      {/* Chart sample — chart-1..5 + grid + axis tokens */}
      <div className="mt-2 rounded-md border border-border bg-card p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-card-foreground">调用趋势</span>
          <span className="font-mono text-[9px] text-muted-foreground">chart-1…5</span>
        </div>
        <svg
          viewBox="0 0 120 32"
          className="mt-1 h-8 w-full"
          role="img"
          aria-label="调用趋势示例图"
          preserveAspectRatio="none"
        >
          {/* grid */}
          {[8, 16, 24].map((y) => (
            <line
              key={y}
              x1="0"
              x2="120"
              y1={y}
              y2={y}
              className="stroke-[var(--chart-grid)]"
              strokeWidth="0.5"
            />
          ))}
          {/* bars using chart-1..5 */}
          {[
            { x: 4, h: 22, fill: "var(--chart-1)" },
            { x: 28, h: 14, fill: "var(--chart-2)" },
            { x: 52, h: 26, fill: "var(--chart-3)" },
            { x: 76, h: 18, fill: "var(--chart-4)" },
            { x: 100, h: 10, fill: "var(--chart-5)" },
          ].map((b) => (
            <rect
              key={b.x}
              x={b.x}
              y={30 - b.h}
              width="16"
              height={b.h}
              rx="1.5"
              fill={b.fill}
            />
          ))}
          {/* axis */}
          <line
            x1="0"
            x2="120"
            y1="31"
            y2="31"
            stroke="var(--chart-axis)"
            strokeWidth="0.6"
          />
        </svg>
      </div>

      {/* Error page sample — mimics the shared error boundary look */}
      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-destructive/15 text-destructive"
            aria-hidden
          >
            <span className="text-[10px] font-bold leading-none">!</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-foreground">加载失败</p>
            <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
              服务暂不可用 · 500 ·{" "}
              <span className="text-brand underline decoration-brand/40 underline-offset-2">
                查看诊断
              </span>
            </p>
          </div>
          <span className="rounded-md bg-brand px-1.5 py-0.5 text-[9px] font-medium text-brand-foreground">
            重试
          </span>
        </div>

        {/* Input with placeholder + focus ring hint */}
        <div className="mt-2">
          <div className="flex h-6 items-center rounded-md border border-input bg-background px-1.5 ring-1 ring-ring/40">
            <span className="truncate text-[9px] text-muted-foreground">
              输入错误代码以搜索…
            </span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">⏎</span>
          </div>
        </div>

        {/* Loading state: spinner + skeleton bars */}
        <div className="mt-2 flex items-center gap-1.5" role="status" aria-label="正在重试">
          <span
            className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
            aria-hidden
          />
          <div className="flex-1 space-y-1">
            <span className="block h-1.5 w-3/4 animate-pulse rounded-full bg-muted" />
            <span className="block h-1.5 w-1/2 animate-pulse rounded-full bg-muted" />
          </div>
          <span className="font-mono text-[9px] text-muted-foreground">重试中…</span>
        </div>
      </div>
    </div>
  );
}

function ModePreview({
  value,
  scale,
  cvdFilter,
}: {
  value: ThemeMode;
  scale: ScaleValue;
  cvdFilter: string;
}) {
  if (value === "system") {
    // Two half-cards visually communicate that "跟随系统" spans both.
    return (
      <div className="grid grid-cols-2 gap-2">
        <PreviewSurface variant="light" scale={scale} cvdFilter={cvdFilter} />
        <PreviewSurface variant="dark" scale={scale} cvdFilter={cvdFilter} />
      </div>
    );
  }
  return <PreviewSurface variant={value} scale={scale} cvdFilter={cvdFilter} />;
}

/**
 * Settings-page appearance control.
 * Each mode card previews the real token colors it would produce.
 */
export function ThemePicker() {
  const { mode, resolved, setMode } = useTheme();
  const { cvd } = useCvd();
  const cvdFilter = cvdFilterFor(cvd);
  const [scale, setScale] = useState<ScaleValue>(1);

  return (
    <div className="space-y-3">
      {/* 全局色觉模拟——同时应用于所有主题预览卡片 */}
      <CvdPicker />

      {/* 字号缩放工具栏——仅影响预览卡片，方便检查不同字号下的可读性与对齐 */}
      <div
        role="radiogroup"
        aria-label="预览字号缩放"
        className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-surface px-3 py-2 text-[11px]"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Type className="h-3.5 w-3.5" aria-hidden />
          预览字号
        </span>
        <div className="flex items-center gap-1">
          {SCALE_OPTIONS.map((s) => {
            const active = s.value === scale;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${s.label} · ${s.hint}`}
                onClick={() => setScale(s.value)}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
                  active
                    ? "bg-brand text-brand-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-muted-foreground">
          <span className="text-foreground">{SCALE_OPTIONS.find((s) => s.value === scale)?.hint}</span>
          {" "}· 仅影响预览，不改变全站字号
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = mode === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setMode(o.value)}
              aria-pressed={active}
              className={cn(
                "group flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-brand/60 bg-brand-soft/40 ring-1 ring-brand/40"
                  : "border-border bg-surface hover:border-brand/30 hover:bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md",
                      active
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface-elevated text-muted-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{o.label}</p>
                    <p className="text-[11px] text-muted-foreground">{o.hint}</p>
                  </div>
                </div>
                {active && (
                  <span className="flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                    <Check className="h-3 w-3" /> 已选择
                  </span>
                )}
              </div>

              {/* Live mini preview using scoped tokens */}
              <ModePreview value={o.value} scale={scale} cvdFilter={cvdFilter} />
            </button>

          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 bg-surface px-3 py-2 text-[11px] text-muted-foreground">
        <span>
          当前选择：
          <span className="text-foreground">
            {OPTIONS.find((o) => o.value === mode)?.label}
          </span>
        </span>
        <span aria-hidden>·</span>
        <span>
          实际生效：
          <span className="text-foreground">{resolved === "dark" ? "深色" : "浅色"}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          色觉模拟：
          <span className="text-foreground">{CVD_MATRICES[cvd].label}</span>
        </span>
        <span aria-hidden>·</span>
        <span>切换后自动保存到本地，刷新后仍生效。</span>
      </div>
    </div>
  );

}
