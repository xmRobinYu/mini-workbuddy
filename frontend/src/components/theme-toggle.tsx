import { useEffect } from "react";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeMode } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun; shortcut: string }> = [
  { value: "light", label: "浅色", icon: Sun, shortcut: "⇧L" },
  { value: "dark", label: "深色", icon: Moon, shortcut: "⇧D" },
  { value: "system", label: "跟随系统", icon: Monitor, shortcut: "⇧S" },
];

function currentLabel(mode: ThemeMode) {
  return OPTIONS.find((o) => o.value === mode)?.label ?? "跟随系统";
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Topbar theme entry.
 * - Icon reflects the *resolved* appearance (sun/moon).
 * - Compact label shows the *chosen* mode so "跟随系统" is visible without opening.
 * - Keyboard shortcuts (global):
 *     Shift+T   cycle light → dark → system
 *     Shift+L   set light
 *     Shift+D   set dark
 *     Shift+S   set system
 *   Shortcuts are disabled while typing in an input/textarea/contentEditable.
 */
export function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;

  useEffect(() => {
    function apply(next: ThemeMode) {
      setMode(next);
      const label = currentLabel(next);
      const effective =
        next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "深色" : "浅色") : label;
      toast.success(`主题已切换：${label}`, {
        description: next === "system" ? `跟随系统，当前生效 ${effective}` : `当前生效 ${effective}`,
        duration: 1800,
      });
    }

    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        const order: ThemeMode[] = ["light", "dark", "system"];
        const idx = order.indexOf(mode);
        apply(order[(idx + 1) % order.length]);
      } else if (k === "l") {
        e.preventDefault();
        apply("light");
      } else if (k === "d") {
        e.preventDefault();
        apply("dark");
      } else if (k === "s") {
        e.preventDefault();
        apply("system");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode]);

  function pick(next: ThemeMode) {
    setMode(next);
    const label = currentLabel(next);
    const effective =
      next === "system"
        ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "深色"
            : "浅色")
        : label;
    toast.success(`主题已切换：${label}`, {
      description: next === "system" ? `跟随系统，当前生效 ${effective}` : `当前生效 ${effective}`,
      duration: 1800,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          aria-label={`主题：${currentLabel(mode)}（快捷键 Shift+T 循环切换）`}
          title={`主题：${currentLabel(mode)} · Shift+T 循环切换`}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">{currentLabel(mode)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>主题模式</span>
          <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground/70">
            Shift+T 循环
          </span>
        </DropdownMenuLabel>
        {OPTIONS.map((o) => {
          const active = mode === o.value;
          const OIcon = o.icon;
          return (
            <DropdownMenuItem
              key={o.value}
              onClick={() => pick(o.value)}
              className={active ? "text-brand" : ""}
            >
              <OIcon className="mr-2 h-3.5 w-3.5" />
              <span className="flex-1">{o.label}</span>
              {active ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <DropdownMenuShortcut>{o.shortcut}</DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
          当前生效：{resolved === "dark" ? "深色" : "浅色"}
          {mode === "system" && " · 跟随系统"}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
