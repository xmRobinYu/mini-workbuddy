import { toast } from "sonner";
import { connectorsStore, type Connector, type ConnectorType } from "./mock-store";

export type ConnectorBackup = {
  type: "mini-workbuddy-connectors";
  version: 1;
  exportedAt: string;
  masked: boolean;
  count: number;
  data: Connector[];
};

const SECRET_FIELDS: (keyof Connector)[] = ["appSecret", "encryptKey", "webhookUrl"];

function maskConnector(c: Connector): Connector {
  const out = { ...c };
  for (const k of SECRET_FIELDS) {
    const v = out[k];
    if (typeof v === "string" && v.length > 0) {
      (out as any)[k] = "***REDACTED***";
    }
  }
  return out;
}

export function buildConnectorBackup(opts: { items: Connector[]; mask: boolean }): ConnectorBackup {
  const data = opts.mask ? opts.items.map(maskConnector) : opts.items;
  return {
    type: "mini-workbuddy-connectors",
    version: 1,
    exportedAt: new Date().toISOString(),
    masked: opts.mask,
    count: data.length,
    data,
  };
}

export function downloadConnectorBackup(opts: { items?: Connector[]; mask?: boolean; scopeLabel?: string } = {}) {
  const items = opts.items ?? connectorsStore.get();
  const mask = opts.mask ?? false;
  const payload = buildConnectorBackup({ items, mask });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mwb-connectors${mask ? "-masked" : ""}-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success(
    `已导出 ${items.length} 个连接器${mask ? "（凭证已脱敏）" : ""}${opts.scopeLabel ? ` · ${opts.scopeLabel}` : ""}`,
  );
}

const VALID_TYPES: ConnectorType[] = ["feishu", "dingtalk", "wecom", "webhook"];

function isConnector(x: any): x is Connector {
  return (
    x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.appId === "string" &&
    typeof x.type === "string" &&
    VALID_TYPES.includes(x.type)
  );
}

export type ConnectorRestoreMode = "replace" | "merge" | "append";

export type ConnectorPreview = {
  payload: ConnectorBackup;
  incoming: Connector[];
  existingIds: Set<string>;
  duplicateIds: string[];
  masked: boolean;
};

export async function readConnectorBackup(file: File): Promise<ConnectorPreview | null> {
  let json: any;
  try {
    json = JSON.parse(await file.text());
  } catch {
    toast.error("文件不是有效的 JSON");
    return null;
  }
  if (!json || json.type !== "mini-workbuddy-connectors" || !Array.isArray(json.data)) {
    toast.error("不是连接器备份文件");
    return null;
  }
  const incoming = (json.data as any[]).filter(isConnector) as Connector[];
  if (incoming.length === 0) {
    toast.error("备份中没有可识别的连接器");
    return null;
  }
  const existing = connectorsStore.get();
  const existingIds = new Set(existing.map((c) => c.id));
  const duplicateIds = incoming.filter((c) => existingIds.has(c.id)).map((c) => c.id);
  return {
    payload: json as ConnectorBackup,
    incoming,
    existingIds,
    duplicateIds,
    masked: !!json.masked,
  };
}

/** Apply a previously read backup. Returns counts. */
export function applyConnectorRestore(
  preview: ConnectorPreview,
  mode: ConnectorRestoreMode,
): { added: number; updated: number; kept: number; total: number } {
  const existing = connectorsStore.get();
  const existingMap = new Map(existing.map((c) => [c.id, c]));
  let added = 0;
  let updated = 0;
  let kept = existing.length;

  if (mode === "replace") {
    connectorsStore.set(preview.incoming);
    toast.success(`已替换为 ${preview.incoming.length} 个连接器${preview.masked ? "（含脱敏字段，需重新填写凭证）" : ""}`);
    return { added: preview.incoming.length, updated: 0, kept: 0, total: preview.incoming.length };
  }

  if (mode === "merge") {
    // 同 ID 以备份为准；其余保留
    for (const c of preview.incoming) {
      if (existingMap.has(c.id)) {
        existingMap.set(c.id, mergePreservingSecrets(existingMap.get(c.id)!, c, preview.masked));
        updated++;
      } else {
        existingMap.set(c.id, c);
        added++;
      }
    }
    const merged = Array.from(existingMap.values());
    connectorsStore.set(merged);
    toast.success(`合并完成 · 新增 ${added} · 更新 ${updated} · 保留 ${kept - updated < 0 ? 0 : kept - updated}`);
    return { added, updated, kept: kept - updated, total: merged.length };
  }

  // append：为重复 ID 生成新 ID，不覆盖任何现有条目
  const newItems: Connector[] = preview.incoming.map((c) => {
    if (existingMap.has(c.id)) {
      const newId = `${c.id}-${Math.random().toString(36).slice(2, 6)}`;
      added++;
      return { ...c, id: newId, name: `${c.name}（导入）` };
    }
    added++;
    return c;
  });
  const combined = [...existing, ...newItems];
  connectorsStore.set(combined);
  toast.success(`已追加 ${added} 个连接器`);
  return { added, updated: 0, kept: existing.length, total: combined.length };
}

/** 备份中的凭证如为脱敏占位，则保留本地现有凭证（避免覆盖真实密钥）。 */
function mergePreservingSecrets(local: Connector, incoming: Connector, masked: boolean): Connector {
  if (!masked) return { ...local, ...incoming };
  const out: Connector = { ...local, ...incoming };
  for (const k of SECRET_FIELDS) {
    const v = incoming[k];
    if (typeof v === "string" && v === "***REDACTED***") {
      (out as any)[k] = local[k];
    }
  }
  return out;
}
