// 自定义 Webhook 事件接收模拟器
// 本地生成事件、计算 HMAC 签名、模拟服务端校验与响应，历史存 localStorage。
import { useSyncExternalStore } from "react";
import type { Connector } from "./mock-store";

export type SigMode = "valid" | "tampered" | "missing" | "expired";

export type WebhookEventPreset = {
  id: string;
  name: string;
  desc: string;
  payload: unknown;
};

export const EVENT_PRESETS: WebhookEventPreset[] = [
  {
    id: "ping",
    name: "ping",
    desc: "连通性探测，仅回执 pong",
    payload: { event: "ping", ts: 0, nonce: "" },
  },
  {
    id: "message.created",
    name: "message.created",
    desc: "外部平台新消息回调",
    payload: {
      event: "message.created",
      ts: 0,
      data: {
        id: "msg_01H8ZK",
        channel: "C_general",
        user: { id: "u_42", name: "张三" },
        text: "有新的工单进来了，请查看。",
      },
    },
  },
  {
    id: "user.updated",
    name: "user.updated",
    desc: "用户资料变更事件",
    payload: {
      event: "user.updated",
      ts: 0,
      data: { id: "u_42", changes: { department: "研发中心" } },
    },
  },
  {
    id: "payment.succeeded",
    name: "payment.succeeded",
    desc: "支付成功回调",
    payload: {
      event: "payment.succeeded",
      ts: 0,
      data: { orderId: "ORD-2035", amount: 199.0, currency: "CNY" },
    },
  },
];

export type WebhookRecord = {
  id: string;
  connectorId: string;
  ts: number;
  preset: string;
  sigMode: SigMode;
  request: {
    method: "POST";
    url: string;
    headers: Record<string, string>;
    body: string; // raw JSON string
  };
  signature: {
    provided?: string;
    expected: string;
    match: boolean;
    reason?: string;
    timestampSkewSec?: number;
  };
  response: {
    status: number;
    ok: boolean;
    body: unknown;
    latency: number;
  };
};

const K = "mwb.webhookEvents";
const MAX_PER_CONNECTOR = 20;

type Store = Record<string, WebhookRecord[]>;
let cache: Store = load();
const listeners = new Set<() => void>();

function load(): Store {
  try {
    const raw = localStorage.getItem(K);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(K, JSON.stringify(cache));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshot(): Store {
  return cache;
}

export function useWebhookEvents(connectorId: string): WebhookRecord[] {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return s[connectorId] ?? [];
}

export function clearEvents(connectorId: string) {
  const next = { ...cache };
  delete next[connectorId];
  cache = next;
  save();
}

// --- HMAC-SHA256 via Web Crypto ---
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  if (!("subtle" in crypto)) return "unavailable";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


export type SimulateInput = {
  connector: Connector;
  preset: WebhookEventPreset;
  sigMode: SigMode;
  /** 覆盖 payload；未提供时使用 preset.payload */
  payloadOverride?: unknown;
};

export async function simulateWebhookEvent(input: SimulateInput): Promise<WebhookRecord> {
  const start = performance.now();
  const { connector, preset, sigMode } = input;
  const now = Math.floor(Date.now() / 1000);
  const payload =
    (input.payloadOverride ?? {
      ...(preset.payload as Record<string, unknown>),
      ts: now,
      nonce: Math.random().toString(36).slice(2, 10),
    }) as Record<string, unknown>;
  const body = JSON.stringify(payload, null, 0);
  const url = connector.webhookUrl || `https://webhook.example.com/${connector.appId || "endpoint"}`;
  const secret = connector.appSecret || "";
  const timestamp =
    sigMode === "expired" ? String(now - 15 * 60) : String(now);

  const expected = secret ? await hmacSha256Hex(secret, `${timestamp}.${body}`) : "";
  const tampered = expected ? expected.slice(0, -4) + "dead" : "dead";
  let provided: string | undefined;
  if (sigMode === "valid" || sigMode === "expired") provided = expected;
  else if (sigMode === "tampered") provided = tampered;
  else provided = undefined; // missing

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "MiniWorkBuddy-Sim/1.0",
    "x-webhook-timestamp": timestamp,
    "x-webhook-event": String((payload as { event?: string }).event ?? preset.id),
  };
  if (provided) headers["x-webhook-signature"] = `sha256=${provided}`;

  // 服务端模拟校验
  const skew = now - Number(timestamp);
  let match = false;
  let reason: string | undefined;
  let status = 200;
  let respBody: unknown = { ok: true, received: preset.id };

  if (!secret) {
    reason = "连接器未配置签名密钥，跳过校验（不安全）";
    match = false;
    status = 200;
    respBody = { ok: true, warn: "no_secret_configured", received: preset.id };
  } else if (!provided) {
    reason = "缺少 x-webhook-signature 头";
    status = 401;
    respBody = { ok: false, error: "missing_signature" };
  } else if (Math.abs(skew) > 5 * 60) {
    reason = `时间戳偏移 ${skew}s，超过 ±300s 容忍窗口`;
    status = 401;
    respBody = { ok: false, error: "timestamp_skew", skew };
  } else if (provided !== expected) {
    reason = "签名不匹配（HMAC-SHA256 校验失败）";
    status = 401;
    respBody = { ok: false, error: "signature_mismatch" };
  } else {
    match = true;
    reason = "签名有效";
    status = preset.id === "ping" ? 200 : 202;
    respBody = preset.id === "ping"
      ? { ok: true, pong: true }
      : { ok: true, received: preset.id, id: `evt_${Date.now()}` };
  }

  const latency = Math.round(performance.now() - start) + 20 + Math.floor(Math.random() * 60);
  const rec: WebhookRecord = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    connectorId: connector.id,
    ts: Date.now(),
    preset: preset.id,
    sigMode,
    request: { method: "POST", url, headers, body },
    signature: {
      provided,
      expected,
      match,
      reason,
      timestampSkewSec: skew,
    },
    response: { status, ok: status >= 200 && status < 300, body: respBody, latency },
  };

  const list = [rec, ...(cache[connector.id] ?? [])].slice(0, MAX_PER_CONNECTOR);
  cache = { ...cache, [connector.id]: list };
  save();
  return rec;
}
