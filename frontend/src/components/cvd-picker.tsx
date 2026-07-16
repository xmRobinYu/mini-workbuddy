import { Eye } from "lucide-react";
import { CVD_MATRICES, CVD_ORDER, useCvd, type CvdKey } from "@/lib/cvd";
import { cn } from "@/lib/utils";

/**
 * 全局色觉模式切换（segmented control）。
 * 用于主题预览卡片与色觉模拟面板联动——同一时刻整个 UI 参照系一致。
 */
export function CvdPicker({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { cvd, setCvd } = useCvd();

  return (
    <div
      role="radiogroup"
      aria-label="色觉模拟模式"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-surface px-3 py-2 text-[11px]",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        色觉模式
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {CVD_ORDER.map((k: CvdKey) => {
          const active = k === cvd;
          const m = CVD_MATRICES[k];
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={m.label}
              title={m.desc}
              onClick={() => setCvd(k)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {m.short}
            </button>
          );
        })}
      </div>
      {!compact && (
        <span className="ml-auto text-muted-foreground">
          <span className="text-foreground">{CVD_MATRICES[cvd].label}</span>
          {" "}· 同步应用于主题预览与色觉面板
        </span>
      )}
    </div>
  );
}
