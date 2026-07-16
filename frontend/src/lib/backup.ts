import { toast } from "sonner";
import {
  modelsStore,
  toolsStore,
  skillsStore,
  agentsStore,
  recordHistory,
  type EntityKind,
  type Model,
  type Tool,
  type Skill,
  type Agent,
} from "./mock-store";


export type BackupPayload = {
  type: "mini-workbuddy-backup";
  version: 1;
  exportedAt: string;
  data: {
    models: Model[];
    tools: Tool[];
    skills: Skill[];
    agents: Agent[];
  };
};

export function buildBackup(): BackupPayload {
  return {
    type: "mini-workbuddy-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      models: modelsStore.get(),
      tools: toolsStore.get(),
      skills: skillsStore.get(),
      agents: agentsStore.get(),
    },
  };
}

export function downloadBackup() {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `mini-workbuddy-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("已导出配置文件");
}

function isArrayOf<T>(v: unknown, check: (x: any) => x is T): v is T[] {
  return Array.isArray(v) && v.every(check);
}
const isModel = (x: any): x is Model =>
  x && typeof x.id === "string" && typeof x.name === "string" && typeof x.provider === "string";
const isTool = (x: any): x is Tool =>
  x && typeof x.key === "string" && typeof x.name === "string";
const isSkill = (x: any): x is Skill =>
  x && typeof x.id === "string" && typeof x.slug === "string";
const isAgent = (x: any): x is Agent =>
  x && typeof x.id === "string" && typeof x.slug === "string" && Array.isArray(x.toolKeys);

export type RestoreMode = "replace" | "merge";

export async function restoreFromFile(file: File, mode: RestoreMode = "replace") {
  const text = await file.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    toast.error("文件不是有效的 JSON");
    return false;
  }
  if (!json || json.type !== "mini-workbuddy-backup" || !json.data) {
    toast.error("不是 Mini-WorkBuddy 备份文件");
    return false;
  }
  const { models, tools, skills, agents } = json.data;
  if (
    !isArrayOf(models, isModel) ||
    !isArrayOf(tools, isTool) ||
    !isArrayOf(skills, isSkill) ||
    !isArrayOf(agents, isAgent)
  ) {
    toast.error("备份文件结构不完整或字段缺失");
    return false;
  }

  if (mode === "replace") {
    modelsStore.set(models);
    toolsStore.set(tools);
    skillsStore.set(skills);
    agentsStore.set(agents);
  } else {
    mergeById(modelsStore, models, (x) => x.id);
    mergeById(toolsStore, tools, (x) => x.key);
    mergeById(skillsStore, skills, (x) => x.id);
    mergeById(agentsStore, agents, (x) => x.id);
  }
  const label = mode === "replace" ? "恢复备份（覆盖）" : "恢复备份（合并）";
  (["models", "tools", "skills", "agents"] as EntityKind[]).forEach((e) => recordHistory(e, label));

  toast.success(
    mode === "replace"
      ? `已恢复 ${models.length} 模型 / ${tools.length} 工具 / ${skills.length} Skills / ${agents.length} Agent`
      : `已合并导入`,
  );
  return true;
}

function mergeById<T>(
  store: { get: () => T[]; set: (n: T[]) => void },
  incoming: T[],
  key: (x: T) => string,
) {
  const map = new Map<string, T>();
  store.get().forEach((it) => map.set(key(it), it));
  incoming.forEach((it) => map.set(key(it), it));
  store.set(Array.from(map.values()));
}
