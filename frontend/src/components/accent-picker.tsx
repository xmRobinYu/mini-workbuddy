import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import {
  ACCENT_PRESETS,
  applyAccent,
  readAccent,
  writeAccent,
} from "@/lib/accent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function normalizeHex(v: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

export function AccentPicker() {
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = readAccent();
    setCurrent(v);
    setDraft(v ?? "");
    // Ensure DOM reflects storage (in case init script was skipped).
    if (v) applyAccent(v);
  }, []);

  function pick(hex: string) {
    const n = normalizeHex(hex);
    if (!n) return;
    writeAccent(n);
    setCurrent(n);
    setDraft(n);
    setError(null);
  }

  function reset() {
    writeAccent(null);
    setCurrent(null);
    setDraft("");
    setError(null);
  }

  function applyDraft() {
    const n = normalizeHex(draft);
    if (!n) {
      setError("请输入合法的 6 位十六进制颜色，例如 #2563EB");
      return;
    }
    pick(n);
  }

  const activePresetId =
    current &&
    ACCENT_PRESETS.find((p) => p.hex.toUpperCase() === current.toUpperCase())?.id;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">预设强调色</Label>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ACCENT_PRESETS.map((p) => {
            const active = activePresetId === p.id || (!current && p.id === "blue");
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.hex)}
                title={`${p.name} · ${p.hex}`}
                aria-pressed={active}
                className={`group relative flex h-10 items-center justify-center rounded-md border transition ${
                  active
                    ? "border-foreground/70 ring-2 ring-ring/40"
                    : "border-border hover:border-foreground/40"
                }`}
                style={{ backgroundColor: p.hex }}
              >
                {active && (
                  <Check className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
                )}
                <span className="sr-only">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <Label htmlFor="accent-hex" className="text-xs">
            自定义 (HEX)
          </Label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(draft) ?? current ?? "#2563EB"}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onBlur={(e) => pick(e.target.value)}
              className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-background p-0.5"
              aria-label="选择自定义强调色"
            />
            <Input
              id="accent-hex"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="#2563EB"
              className="h-9 max-w-[140px] font-mono uppercase"
              maxLength={7}
            />
            <Button size="sm" variant="outline" onClick={applyDraft}>
              应用
            </Button>
          </div>
          {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          className="gap-1.5 text-muted-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
        </Button>
      </div>

      <div className="rounded-md border border-border bg-surface/40 p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          实时预览
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground shadow-sm hover:opacity-90">
            主要按钮
          </button>
          <span className="rounded-md bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
            强调徽章
          </span>
          <span className="rounded-md border border-brand/40 px-2.5 py-1 text-xs text-brand">
            描边芯片
          </span>
          <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-brand" /> 状态点
          </span>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          选择会写入设计令牌
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">--brand</code>
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">--brand-soft</code>
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">--ring</code>
          与侧边栏对应令牌，浅色与深色模式各自匹配。
        </p>
      </div>
    </div>
  );
}
