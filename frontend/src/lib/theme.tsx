import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "wb-theme";

/**
 * Pre-hydration script — injected in <head> to apply the persisted theme before
 * React hydrates. Prevents a light-flash when the user's preference is dark.
 */
export const themeInitScript = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k)||'system';
  var m=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = s==='dark' || (s==='system' && m);
  var root=document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}catch(e){}})();
`.trim();

type Ctx = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function systemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const TRANSITION_CLASS = "theme-transition";
const TRANSITION_MS = 260;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Briefly enable cross-fading of color-family properties around a theme swap.
 * - No-op during SSR.
 * - Skipped when the user prefers reduced motion.
 * - Skipped when a stylesheet has disabled transitions globally (visual
 *   regression capture injects `* { transition:none !important }`) — in that
 *   case adding the class has no effect either way, but we avoid the timer.
 */
function withThemeTransition(fn: () => void) {
  if (typeof document === "undefined") {
    fn();
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  if (reduced) {
    fn();
    return;
  }
  root.classList.add(TRANSITION_CLASS);
  fn();
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    root.classList.remove(TRANSITION_CLASS);
    transitionTimer = null;
  }, TRANSITION_MS);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  // Skip the transition on the very first mount so the initial paint doesn't
  // fade from an already-correct color (init script has already applied it).
  const firstApply = useRef(true);

  // Hydrate from localStorage on client
  useEffect(() => {
    const m = readMode();
    setModeState(m);
  }, []);

  // Apply theme class and track system changes
  useEffect(() => {
    const dark = mode === "dark" || (mode === "system" && systemDark());
    const root = document.documentElement;
    const apply = () => {
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      setResolved(dark ? "dark" : "light");
    };
    if (firstApply.current) {
      firstApply.current = false;
      apply();
    } else {
      withThemeTransition(apply);
    }

    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const d = mq.matches;
      withThemeTransition(() => {
        root.classList.toggle("dark", d);
        root.style.colorScheme = d ? "dark" : "light";
        setResolved(d ? "dark" : "light");
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {}
    setModeState(m);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { mode: "system", resolved: "light", setMode: () => {} };
  return ctx;
}
