import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { connectorsStore, type Connector } from "@/lib/mock-store";
import { mockTestConnector } from "@/lib/mock-test";

// ============ Types ============
export type HealthState = "ok" | "warn" | "error" | "unknown" | "checking";

export type HealthRecord = {
  connectorId: string;
  state: HealthState;
  message: string;
  latency: number;
  ts: number;
  /** Consecutive failure counter used to escalate warn -> error */
  consecutiveFails: number;
};

export type HealthConfig = {
  enabled: boolean;
  /** interval in seconds */
  intervalSec: number;
  /** notify on state transitions */
  notify: boolean;
};

export const DEFAULT_CONFIG: HealthConfig = {
  enabled: true,
  intervalSec: 60,
  notify: true,
};

export const INTERVAL_OPTIONS = [
  { value: 30, label: "30 秒" },
  { value: 60, label: "1 分钟" },
  { value: 300, label: "5 分钟" },
  { value: 900, label: "15 分钟" },
];

// ============ Persistent state ============
const K_RECORDS = "mwb.connectorHealth.records";
const K_CONFIG = "mwb.connectorHealth.config";
const K_MUTED = "mwb.connectorHealth.muted";
const K_LAST_RUN = "mwb.connectorHealth.lastRun";

type Records = Record<string, HealthRecord>;

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

let records: Records = load<Records>(K_RECORDS, {});
let config: HealthConfig = { ...DEFAULT_CONFIG, ...load<Partial<HealthConfig>>(K_CONFIG, {}) };
let muted: Record<string, number> = load<Record<string, number>>(K_MUTED, {});
let lastRun: number = load<number>(K_LAST_RUN, 0);

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ============ Snapshot ============
export type HealthSnapshot = {
  records: Records;
  config: HealthConfig;
  muted: Record<string, number>;
  lastRun: number;
  isRunning: boolean;
};

let isRunning = false;
let cachedSnap: HealthSnapshot = buildSnap();
function buildSnap(): HealthSnapshot {
  return { records, config, muted, lastRun, isRunning };
}
function refreshSnap() {
  cachedSnap = buildSnap();
  emit();
}

// ============ Suggestions ============
export type Suggestion = {
  label: string;
  action?: "retry" | "edit" | "disable" | "docs";
};

export function suggestionsFor(c: Connector, r?: HealthRecord): Suggestion[] {
  const msg = (r?.message ?? "").toLowerCase();
  const out: Suggestion[] = [];
  if (!c.enabled) {
    out.push({ label: "启用连接器后再试" });
    return out;
  }
  if (msg.includes("secret") || msg.includes("鉴权") || msg.includes("invalid") || msg.includes("40001") || msg.includes("40078") || msg.includes("99991663")) {
    out.push({ label: "凭据无效或已过期，请核对 AppSecret / CorpSecret 后重新填写", action: "edit" });
  }
  if (msg.includes("agentid") || msg.includes("40056")) {
    out.push({ label: "补全企业微信 AgentId（自建应用 → 应用详情）", action: "edit" });
  }
  if (msg.includes("webhook") && msg.includes("空")) {
    out.push({ label: "补全 Webhook URL", action: "edit" });
  }
  if (msg.includes("429") || msg.includes("限频")) {
    out.push({ label: "被限频，降低轮询频率或稍后重试" });
  }
  if (msg.includes("白名单") || msg.includes("ip")) {
    out.push({ label: "将当前出网 IP 加入应用可信 IP 白名单" });
  }
  if (msg.includes("证书") || msg.includes("tls")) {
    out.push({ label: "证书/TLS 异常，检查系统时间与目标域名证书链" });
  }
  if (msg.includes("超时") || msg.includes("timeout") || msg.includes("网关")) {
    out.push({ label: "网络或对端不可达，重试或延长超时" });
  }
  if (out.length === 0) {
    out.push({ label: "查看官方错误码文档，核对参数与权限", action: "docs" });
  }
  out.push({ label: "重新触发一次自检", action: "retry" });
  return out;
}

// ============ Actions ============
export function updateConfig(patch: Partial<HealthConfig>) {
  config = { ...config, ...patch };
  save(K_CONFIG, config);
  refreshSnap();
}
export function muteConnector(id: string, minutes = 30) {
  muted = { ...muted, [id]: Date.now() + minutes * 60_000 };
  save(K_MUTED, muted);
  refreshSnap();
}
export function unmuteConnector(id: string) {
  const next = { ...muted };
  delete next[id];
  muted = next;
  save(K_MUTED, muted);
  refreshSnap();
}
export function clearRecord(id: string) {
  const next = { ...records };
  delete next[id];
  records = next;
  save(K_RECORDS, records);
  refreshSnap();
}

// ============ Runner ============
let inflight = new Set<string>();

async function runOne(c: Connector, { silent = false }: { silent?: boolean } = {}) {
  if (inflight.has(c.id)) return;
  inflight.add(c.id);
  const prev = records[c.id];
  records = {
    ...records,
    [c.id]: {
      connectorId: c.id,
      state: "checking",
      message: prev?.message ?? "检测中…",
      latency: prev?.latency ?? 0,
      ts: prev?.ts ?? Date.now(),
      consecutiveFails: prev?.consecutiveFails ?? 0,
    },
  };
  refreshSnap();

  try {
    const r = await mockTestConnector({
      type: c.type,
      name: c.name,
      appId: c.appId,
      appSecret: c.appSecret,
      agentId: c.agentId,
      webhookUrl: c.webhookUrl,
      enabled: c.enabled,
    });
    const fails = r.ok ? 0 : (prev?.consecutiveFails ?? 0) + 1;
    const state: HealthState = !c.enabled
      ? "unknown"
      : r.ok
        ? "ok"
        : fails >= 2
          ? "error"
          : "warn";
    const next: HealthRecord = {
      connectorId: c.id,
      state,
      message: r.message,
      latency: r.latency,
      ts: r.ts,
      consecutiveFails: fails,
    };
    records = { ...records, [c.id]: next };
    save(K_RECORDS, records);
    connectorsStore.update((x) => x.id === c.id, { status: state === "unknown" ? "unknown" : state });

    // Transition notifications
    if (!silent && config.notify) {
      const mutedUntil = muted[c.id] ?? 0;
      if (Date.now() >= mutedUntil) {
        if (prev?.state !== "error" && state === "error") {
          toast.error(`${c.name} 连续检测失败`, {
            description: r.message,
            duration: 8000,
          });
        } else if ((prev?.state === "error" || prev?.state === "warn") && state === "ok") {
          toast.success(`${c.name} 已恢复`, { description: r.message });
        }
      }
    }
  } finally {
    inflight.delete(c.id);
  }
}

export async function runAll({ silent = false } = {}) {
  const list = connectorsStore.get();
  lastRun = Date.now();
  save(K_LAST_RUN, lastRun);
  refreshSnap();
  await Promise.all(list.map((c) => runOne(c, { silent })));
}

export async function runOneById(id: string) {
  const c = connectorsStore.get().find((x) => x.id === id);
  if (!c) return;
  await runOne(c, { silent: true });
}

// ============ Global scheduler ============
let tickTimer: number | null = null;

function tick() {
  if (!config.enabled) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const dueAt = lastRun + config.intervalSec * 1000;
  if (Date.now() >= dueAt) {
    void runAll();
  }
}

function ensureTimer() {
  if (typeof window === "undefined") return;
  if (tickTimer != null) return;
  tickTimer = window.setInterval(tick, 5000);
  document.addEventListener("visibilitychange", tick);
  isRunning = true;
  refreshSnap();
  // opportunistic first-run
  if (lastRun === 0 || Date.now() - lastRun > config.intervalSec * 1000) {
    void runAll({ silent: true });
  }
}

// ============ Hooks ============
export function useConnectorHealth(): HealthSnapshot {
  useEffect(() => {
    ensureTimer();
  }, []);
  return useSyncExternalStore(subscribe, () => cachedSnap, () => cachedSnap);
}

export function nextRunEta(snap: HealthSnapshot): number {
  if (!snap.config.enabled) return Infinity;
  return Math.max(0, snap.lastRun + snap.config.intervalSec * 1000 - Date.now());
}

export function isMuted(snap: HealthSnapshot, id: string): boolean {
  const until = snap.muted[id];
  return !!until && until > Date.now();
}
