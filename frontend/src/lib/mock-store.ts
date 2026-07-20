import { useSyncExternalStore } from "react";

type Listener = () => void;

function createStore<T>(key: string, initial: T[]) {
  let state: T[] = load();
  const listeners = new Set<Listener>();

  function load(): T[] {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initial;
      return JSON.parse(raw) as T[];
    } catch {
      return initial;
    }
  }

  function persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  function emit() {
    persist();
    listeners.forEach((l) => l());
  }

  return {
    get: () => state,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set(next: T[]) {
      state = next;
      emit();
    },
    add(item: T) {
      state = [...state, item];
      emit();
    },
    update(pred: (item: T) => boolean, patch: Partial<T>) {
      state = state.map((it) => (pred(it) ? { ...it, ...patch } : it));
      emit();
    },
    replace(pred: (item: T) => boolean, next: T) {
      state = state.map((it) => (pred(it) ? next : it));
      emit();
    },
    remove(pred: (item: T) => boolean) {
      state = state.filter((it) => !pred(it));
      emit();
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T[] {
  return useSyncExternalStore(
    store.subscribe,
    store.get,
    store.get,
  );
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ===== Types =====
export type Model = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  context: string;
  status: "ok" | "warn" | "error";
  default?: boolean;
};

export type ConnectorBinding = {
  connectorId: string;
  /** action key defined in CONNECTOR_ACTIONS */
  action: string;
  /** map of action parameter key -> source expression (literal or ${var}) */
  paramMap: Record<string, string>;
};

export type Tool = {
  key: string;
  name: string;
  desc: string;
  enabled: boolean;
  detail: string;
  icon: "file" | "pen" | "terminal";
  connectorBinding?: ConnectorBinding;
};

export type Skill = {
  id: string;
  name: string;
  slug: string;
  desc: string;
  files: number;
  enabled: boolean;
  source: "内置" | "自建" | "ZIP 导入" | "扫描发现";
  connectorBinding?: ConnectorBinding;
};


export type Agent = {
  id: string;
  name: string;
  slug: string;
  desc: string;
  systemPrompt: string;
  modelId: string;
  toolKeys: string[];
  skillIds: string[];
  tags: string[];
  system?: boolean;
};




export type ConnectorType = "feishu" | "dingtalk" | "wecom" | "webhook";

export type Connector = {
  id: string;
  type: ConnectorType;
  name: string;
  /** 飞书 App ID / 钉钉 AppKey / 企微 CorpID / Webhook 名称 */
  appId: string;
  /** 飞书 App Secret / 钉钉 AppSecret / 企微 CorpSecret / Webhook Secret */
  appSecret: string;
  /** 企微 / 钉钉自建应用的 AgentId（可选） */
  agentId?: string;
  /** 群机器人 Webhook / 通用 Webhook URL（可选） */
  webhookUrl?: string;
  /** 事件回调 Encrypt / 加签 Key（可选） */
  encryptKey?: string;
  /** 权限范围（逗号分隔），用于展示与审计 */
  scope: string;
  enabled: boolean;
  status: "ok" | "warn" | "error" | "unknown";
  createdAt: number;
};


// ===== Initial data =====
const initialModels: Model[] = [
  { id: "m1", name: "DeepSeek Chat", provider: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", modelId: "deepseek-chat", apiKey: "", context: "128k", status: "ok", default: true },
  { id: "m2", name: "DeepSeek Coder", provider: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", modelId: "deepseek-coder", apiKey: "", context: "128k", status: "ok" },
  { id: "m3", name: "Qwen3-Max", provider: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", modelId: "qwen-max", apiKey: "", context: "32k", status: "ok" },
  { id: "m4", name: "Kimi K2", provider: "Moonshot", baseUrl: "https://api.moonshot.cn/v1", modelId: "moonshot-v1-128k", apiKey: "", context: "128k", status: "warn" },
  { id: "m5", name: "本地 Ollama", provider: "Ollama", baseUrl: "http://localhost:11434/v1", modelId: "qwen2.5:14b", apiKey: "", context: "32k", status: "error" },
];

const initialTools: Tool[] = [
  { key: "read_file", name: "读文件", desc: "读取 workspace 目录下的文本文件，返回文件内容与元信息。", enabled: true, detail: "支持相对路径与绝对路径校验，防止越权访问。", icon: "file" },
  { key: "write_file", name: "写文件", desc: "在 workspace 目录写入文件，采用原子写入 + 文件锁，保证一致性。", enabled: true, detail: "写入前会校验路径白名单，二进制文件将拒绝写入。", icon: "pen" },
  { key: "execute_command", name: "命令行", desc: "在受限沙箱中执行 shell 命令，超时 30 秒自动终止。", enabled: true, detail: "命令白名单：ls / cat / grep / bun / node / python / git ...", icon: "terminal" },
];

const initialSkills: Skill[] = [
  { id: "s1", name: "PRD 生成器", slug: "prd-generator", desc: "从一句话想法生成结构化 PRD，含用户故事与功能矩阵", files: 4, enabled: true, source: "内置" },
  { id: "s2", name: "会议纪要整理", slug: "meeting-notes", desc: "把音频转录或速记整理成结构化 Markdown 纪要", files: 2, enabled: true, source: "ZIP 导入" },
  { id: "s3", name: "Markdown 转 PPT 大纲", slug: "md-to-ppt", desc: "把长 Markdown 转成分页 PPT 大纲，含备注与要点", files: 3, enabled: false, source: "扫描发现" },
  { id: "s4", name: "代码重构建议", slug: "code-refactor", desc: "读取源文件并给出结构性重构建议与差异 diff", files: 6, enabled: true, source: "自建" },
  { id: "s5", name: "UI 设计系统", slug: "ui-design-system", desc: "从参考风格生成 oklch 色板、字体和组件 token", files: 5, enabled: true, source: "自建" },
  { id: "s6", name: "英文翻译", slug: "translate-en", desc: "保留 Markdown 结构和代码块，术语一致性检查", files: 2, enabled: false, source: "内置" },
];

const initialAgents: Agent[] = [
  { id: "a1", name: "主 Agent", slug: "main", desc: "编排者角色，可调度所有子 Agent 完成复杂任务", systemPrompt: "你是主 Agent，负责规划与调度子 Agent。", modelId: "m1", toolKeys: ["read_file", "write_file", "execute_command"], skillIds: ["s1", "s4"], tags: ["编排", "全能"], system: true },
  { id: "a2", name: "文档助手", slug: "doc", desc: "擅长 Markdown 撰写、会议纪要整理、PRD 生成", systemPrompt: "你擅长撰写清晰、结构化的中文文档。", modelId: "m3", toolKeys: ["read_file", "write_file"], skillIds: ["s1", "s2"], tags: ["写作", "整理"] },
  { id: "a3", name: "代码助手", slug: "code", desc: "代码阅读、重构、调试与命令行执行", systemPrompt: "你是资深工程师，输出高质量代码和解释。", modelId: "m2", toolKeys: ["read_file", "write_file", "execute_command"], skillIds: ["s4"], tags: ["编码", "调试"] },
  { id: "a4", name: "产品经理", slug: "pm", desc: "从想法到用户故事、功能矩阵、验收标准", systemPrompt: "你是资深产品经理，输出 PRD 与验收标准。", modelId: "m3", toolKeys: ["read_file"], skillIds: ["s1"], tags: ["产品", "规划"] },
  { id: "a5", name: "翻译助手", slug: "translate", desc: "中英双向翻译，保留 Markdown 结构与技术术语", systemPrompt: "你负责中英双向翻译，保留 Markdown 结构。", modelId: "m1", toolKeys: ["read_file"], skillIds: ["s6"], tags: ["翻译"] },
];

export const modelsStore = createStore<Model>("mwb.models", initialModels);
export const toolsStore = createStore<Tool>("mwb.tools", initialTools);
export const skillsStore = createStore<Skill>("mwb.skills", initialSkills);
export const agentsStore = createStore<Agent>("mwb.agents", initialAgents);




const initialConnectors: Connector[] = [
  {
    id: "c1",
    type: "feishu",
    name: "飞书 · 研发协作机器人",
    appId: "cli_a1b2c3d4e5",
    appSecret: "",
    encryptKey: "",
    webhookUrl: "",
    scope: "im:message,im:message.group_at_msg,contact:user.base:readonly",
    enabled: true,
    status: "warn",
    createdAt: Date.now(),
  },
  {
    id: "c2",
    type: "dingtalk",
    name: "钉钉 · 产品通告",
    appId: "dingxyz123456",
    appSecret: "",
    agentId: "10000001",
    webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    encryptKey: "SEC1234abcd",
    scope: "im:group.send,contact:department.read",
    enabled: true,
    status: "ok",
    createdAt: Date.now(),
  },
  {
    id: "c3",
    type: "wecom",
    name: "企业微信 · IT 支持",
    appId: "ww1234567890abcd",
    appSecret: "",
    agentId: "1000002",
    webhookUrl: "",
    scope: "message:send,contact:read",
    enabled: false,
    status: "unknown",
    createdAt: Date.now(),
  },
];
export const connectorsStore = createStore<Connector>("mwb.connectors", initialConnectors);


// ===== History =====
export type EntityKind = "models" | "tools" | "skills" | "agents";

export const ENTITY_LABELS: Record<EntityKind, string> = {
  models: "模型",
  tools: "工具",
  skills: "Skills",
  agents: "Agent",
};

export type HistoryEntry = {
  id: string;
  label: string;
  ts: number;
  snapshot: unknown[];
};

const HISTORY_CAP = 30;

export const historyStores: Record<EntityKind, ReturnType<typeof createStore<HistoryEntry>>> = {
  models: createStore<HistoryEntry>("mwb.history.models", []),
  tools: createStore<HistoryEntry>("mwb.history.tools", []),
  skills: createStore<HistoryEntry>("mwb.history.skills", []),
  agents: createStore<HistoryEntry>("mwb.history.agents", []),
};

const dataStores: Record<EntityKind, { get: () => unknown[]; set: (n: any) => void }> = {
  models: modelsStore as any,
  tools: toolsStore as any,
  skills: skillsStore as any,
  agents: agentsStore as any,
};

export function recordHistory(entity: EntityKind, label: string) {
  const h = historyStores[entity];
  const snapshot = JSON.parse(JSON.stringify(dataStores[entity].get()));
  const entry: HistoryEntry = {
    id: `${Date.now().toString(36)}-${uid()}`,
    label,
    ts: Date.now(),
    snapshot,
  };
  h.set([entry, ...h.get()].slice(0, HISTORY_CAP));
}

export function rollbackHistory(entity: EntityKind, entryId: string): HistoryEntry | null {
  const h = historyStores[entity];
  const target = h.get().find((e) => e.id === entryId);
  if (!target) return null;
  dataStores[entity].set(JSON.parse(JSON.stringify(target.snapshot)));
  recordHistory(entity, `回滚到「${target.label}」`);
  return target;
}

export function clearHistory(entity: EntityKind) {
  historyStores[entity].set([]);
  recordHistory(entity, "清空历史");
}

// Seed baseline entry per entity on first run
if (typeof window !== "undefined") {
  (Object.keys(historyStores) as EntityKind[]).forEach((e) => {
    if (historyStores[e].get().length === 0) {
      recordHistory(e, "初始状态");
    }
  });
}
