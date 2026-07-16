import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CvdPicker } from "@/components/cvd-picker";
import {
  CVD_MATRICES,
  CVD_ORDER,
  cvdFilterFor,
  useCvd,
  type CvdKey,
  type Mat3,
} from "@/lib/cvd";
import { cn } from "@/lib/utils";

/**
 * 色觉模拟面板 —— 对同一份样例 UI 应用所有 CVD 矩阵；每个样例元素旁标注
 * WCAG 对比度评分，Fail 元素红色描边高亮。顶部使用全局 <CvdPicker>，
 * 每张卡片可一键「设为全局」以联动主题预览。
 */

/* ---------- 颜色解析与 WCAG 计算 ---------- */

type RGB = [number, number, number];

function parseColor(input: string): RGB | null {
  if (!input || typeof document === "undefined") return null;
  const probe = document.createElement("div");
  probe.style.color = input;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const m = computed.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function applyMat(rgb: RGB, m: Mat3): RGB {
  const [r, g, b] = rgb;
  const clip = (v: number) => Math.max(0, Math.min(255, v));
  return [
    clip(m[0] * r + m[1] * g + m[2] * b),
    clip(m[3] * r + m[4] * g + m[5] * b),
    clip(m[6] * r + m[7] * g + m[8] * b),
  ];
}

function luminance([r, g, b]: RGB): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function ratio(fg: RGB, bg: RGB): number {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

type SampleKind = "text" | "large-text" | "ui";
type Sample = { id: string; label: string; fg: string; bg: string; kind: SampleKind };

const SAMPLES: Sample[] = [
  { id: "btn-primary", label: "主要按钮", fg: "brand-foreground", bg: "brand", kind: "text" },
  { id: "btn-secondary", label: "次要按钮", fg: "secondary-foreground", bg: "secondary", kind: "text" },
  { id: "btn-destructive", label: "删除按钮", fg: "destructive-foreground", bg: "destructive", kind: "text" },
  { id: "badge-success", label: "成功徽章", fg: "success", bg: "card", kind: "text" },
  { id: "badge-warning", label: "警告徽章", fg: "warning", bg: "card", kind: "text" },
  { id: "badge-error", label: "错误徽章", fg: "destructive", bg: "card", kind: "text" },
  { id: "badge-info", label: "信息徽章", fg: "brand", bg: "brand-soft", kind: "text" },
  { id: "link", label: "正文链接", fg: "brand", bg: "card", kind: "text" },
  { id: "body", label: "正文文本", fg: "foreground", bg: "card", kind: "text" },
  { id: "muted", label: "次要说明", fg: "muted-foreground", bg: "card", kind: "text" },
];

type Score = {
  ratio: number;
  status: "aaa" | "aa" | "aa-large" | "fail";
  reason?: string;
};

function grade(kind: SampleKind, r: number): Score {
  if (kind === "ui") {
    if (r >= 3) return { ratio: r, status: "aa" };
    return { ratio: r, status: "fail", reason: `UI/图形对比 ${r}:1 < 3:1（WCAG 1.4.11）` };
  }
  if (r >= 7) return { ratio: r, status: "aaa" };
  if (r >= 4.5) return { ratio: r, status: "aa" };
  if (r >= 3) return { ratio: r, status: "aa-large", reason: `${r}:1 仅达大号文本 3:1，普通正文需 ≥ 4.5:1` };
  return { ratio: r, status: "fail", reason: `${r}:1 < 4.5:1，色弱下无法可靠区分` };
}

const STATUS_STYLES: Record<Score["status"], string> = {
  aaa: "bg-success/15 text-success border-success/30",
  aa: "bg-success/15 text-success border-success/30",
  "aa-large": "bg-warning/20 text-warning-foreground border-warning/40",
  fail: "bg-destructive/15 text-destructive border-destructive/40",
};

const STATUS_LABEL: Record<Score["status"], string> = {
  aaa: "AAA",
  aa: "AA",
  "aa-large": "AA·大字",
  fail: "Fail",
};

function ScoreBadge({ score }: { score: Score }) {
  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center gap-1 rounded-sm border px-1 py-px font-mono text-[9px] leading-none",
        STATUS_STYLES[score.status],
      )}
      title={score.reason ?? `对比度 ${score.ratio}:1`}
    >
      {STATUS_LABEL[score.status]} · {score.ratio}
    </span>
  );
}

function failRing(score: Score | undefined) {
  if (!score) return "";
  return score.status === "fail"
    ? "outline outline-2 outline-offset-2 outline-destructive"
    : score.status === "aa-large"
      ? "outline outline-1 outline-offset-2 outline-warning"
      : "";
}

function SampleUI({ scores }: { scores: Record<string, Score> }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-brand-foreground", failRing(scores["btn-primary"]))}>
          主要<ScoreBadge score={scores["btn-primary"]} />
        </span>
        <span className={cn("rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground", failRing(scores["btn-secondary"]))}>
          次要<ScoreBadge score={scores["btn-secondary"]} />
        </span>
        <span className={cn("rounded-md bg-destructive px-2 py-1 text-[10px] font-medium text-destructive-foreground", failRing(scores["btn-destructive"]))}>
          删除<ScoreBadge score={scores["btn-destructive"]} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={cn("rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-success", failRing(scores["badge-success"]))}>
          ● 成功<ScoreBadge score={scores["badge-success"]} />
        </span>
        <span className={cn("rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-warning", failRing(scores["badge-warning"]))}>
          ● 警告<ScoreBadge score={scores["badge-warning"]} />
        </span>
        <span className={cn("rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-destructive", failRing(scores["badge-error"]))}>
          ● 错误<ScoreBadge score={scores["badge-error"]} />
        </span>
        <span className={cn("rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-brand", failRing(scores["badge-info"]))}>
          ● 信息<ScoreBadge score={scores["badge-info"]} />
        </span>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground">图表色板</div>
        <div className="flex h-8 items-end gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${40 + i * 10}%`, background: `var(--chart-${i})` }}
              aria-label={`chart-${i}`}
            />
          ))}
        </div>
      </div>

      <p className={cn("rounded-sm p-1 text-[10px] leading-snug text-foreground", failRing(scores["body"]))}>
        正文段落示例<ScoreBadge score={scores["body"]} />，
        <span className={cn("inline", failRing(scores["link"]))}>
          <a className="text-brand underline decoration-brand/40 underline-offset-2">可点击链接</a>
          <ScoreBadge score={scores["link"]} />
        </span>
        ，与
        <span className={cn("inline text-muted-foreground", failRing(scores["muted"]))}>
          次要说明<ScoreBadge score={scores["muted"]} />
        </span>
        混排以检验层级。
      </p>
    </div>
  );
}

/* ---------- 主面板 ---------- */

export function ColorVisionPanel() {
  const { cvd, setCvd } = useCvd();
  const [rawColors, setRawColors] = useState<Record<string, RGB>>({});

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const names = new Set<string>();
      SAMPLES.forEach((s) => {
        names.add(s.fg);
        names.add(s.bg);
      });
      const next: Record<string, RGB> = {};
      names.forEach((n) => {
        const v = style.getPropertyValue(`--${n}`).trim();
        const rgb = parseColor(v);
        if (rgb) next[n] = rgb;
      });
      setRawColors(next);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const scoresByCvd = useMemo(() => {
    const out = {} as Record<CvdKey, Record<string, Score>>;
    CVD_ORDER.forEach((k) => {
      const m = CVD_MATRICES[k].mat;
      const scores: Record<string, Score> = {};
      SAMPLES.forEach((s) => {
        const fg = rawColors[s.fg];
        const bg = rawColors[s.bg];
        if (!fg || !bg) {
          scores[s.id] = { ratio: 0, status: "fail", reason: "无法读取 token 颜色" };
          return;
        }
        scores[s.id] = grade(s.kind, ratio(applyMat(fg, m), applyMat(bg, m)));
      });
      out[k] = scores;
    });
    return out;
  }, [rawColors]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          色觉模拟 · Color Vision
        </h2>
        <p className="text-xs text-muted-foreground">
          顶部选择即全局色觉模式，主题预览卡片同步应用；下方矩阵展示所有 CVD 的对比效果与 WCAG 评分。
        </p>
      </div>

      <CvdPicker />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CVD_ORDER.map((k) => {
          const scores = scoresByCvd[k] ?? {};
          const fails = Object.values(scores).filter((s) => s.status === "fail").length;
          const warns = Object.values(scores).filter((s) => s.status === "aa-large").length;
          const isActive = cvd === k;
          return (
            <Card
              key={k}
              className={cn(
                "overflow-hidden p-3 transition-colors",
                isActive
                  ? "border-brand/60 ring-1 ring-brand/40 bg-brand-soft/20"
                  : "hover:border-brand/30",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {CVD_MATRICES[k].label}
                  {isActive && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-medium text-brand">
                      <Check className="h-2.5 w-2.5" />全局
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 font-mono text-[10px]">
                  {fails > 0 && (
                    <span className="rounded-sm border border-destructive/40 bg-destructive/15 px-1 py-px text-destructive">
                      Fail · {fails}
                    </span>
                  )}
                  {warns > 0 && (
                    <span className="rounded-sm border border-warning/40 bg-warning/20 px-1 py-px text-warning-foreground">
                      Warn · {warns}
                    </span>
                  )}
                  <span className="text-muted-foreground">{k}</span>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {CVD_MATRICES[k].desc}
                </p>
                <button
                  type="button"
                  onClick={() => setCvd(k)}
                  disabled={isActive}
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                    isActive
                      ? "cursor-default border-border bg-muted text-muted-foreground"
                      : "border-brand/40 bg-brand/10 text-brand hover:bg-brand hover:text-brand-foreground",
                  )}
                >
                  {isActive ? "已联动" : "设为全局"}
                </button>
              </div>
              <div style={{ filter: cvdFilterFor(k) }}>
                <SampleUI scores={scores} />
              </div>

              {(fails > 0 || warns > 0) && (
                <ul className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                  {SAMPLES.filter((s) => {
                    const st = scores[s.id]?.status;
                    return st === "fail" || st === "aa-large";
                  }).map((s) => (
                    <li key={s.id} className="flex gap-1">
                      <span
                        className={cn(
                          "font-mono",
                          scores[s.id].status === "fail" ? "text-destructive" : "text-warning-foreground",
                        )}
                      >
                        {s.label}:
                      </span>
                      <span>{scores[s.id].reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        评分基于把 token 颜色同样应用 CVD 矩阵后计算的 WCAG 相对亮度对比：文本 AA ≥ 4.5、AAA ≥ 7，大号文本或 UI 组件 ≥ 3。选择「设为全局」即同步到主题预览卡片，便于在同一色觉模式下对照不同主题的排版可读性。
      </p>
    </section>
  );
}
