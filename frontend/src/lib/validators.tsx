import { z } from "zod";
import type { Model, Tool, Skill, Agent, Connector } from "./mock-store";

const slugRe = /^[a-z0-9][a-z0-9-]*$/;
const httpRe = /^https?:\/\/.+/i;

export type FieldErrors = Record<string, string>;
export type ValidateResult = {
  ok: boolean;
  errors: FieldErrors;
  firstMessage?: string;
  suggestion?: string;
};

function toResult(issues: FieldErrors, suggestion?: string): ValidateResult {
  const keys = Object.keys(issues);
  if (keys.length === 0) return { ok: true, errors: {} };
  return { ok: false, errors: issues, firstMessage: issues[keys[0]], suggestion };
}

// ===== Model =====
const modelSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(60, "名称过长（≤60）"),
  provider: z.string().trim().min(1, "请填写供应商").max(40, "供应商名过长"),
  baseUrl: z.string().trim().min(1, "Base URL 不能为空").regex(httpRe, "必须以 http(s):// 开头"),
  modelId: z.string().trim().min(1, "Model ID 不能为空").max(80, "Model ID 过长"),
  apiKey: z.string().max(200, "API Key 过长"),
  context: z.string().trim().min(1, "请填写上下文长度").regex(/^\d+[kKmM]?$/, "格式示例：128k / 32k / 1M"),
});

export function validateModel(value: Model, others: Model[]): ValidateResult {
  const errors: FieldErrors = {};
  const parsed = modelSchema.safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const key = String(iss.path[0]);
      if (!errors[key]) errors[key] = iss.message;
    }
  }
  const dupName = others.some((o) => o.id !== value.id && o.name.trim().toLowerCase() === value.name.trim().toLowerCase());
  if (dupName && !errors.name) errors.name = "已存在同名模型，请换一个名称";
  let suggestion: string | undefined;
  if (errors.baseUrl && value.baseUrl && !/^https?:/i.test(value.baseUrl)) {
    suggestion = `试试：https://${value.baseUrl.replace(/^\/+/, "")}`;
  } else if (errors.apiKey === undefined && !value.apiKey.trim()) {
    // apiKey empty is allowed by schema but warn softly via suggestion
    suggestion = "提示：未填 API Key，测试连接将返回 401";
  }
  return toResult(errors, suggestion);
}

// ===== Tool =====
const toolSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40, "名称过长"),
  desc: z.string().trim().min(4, "功能描述至少 4 个字").max(300, "描述过长"),
  detail: z.string().trim().min(4, "安全约束至少 4 个字").max(300, "内容过长"),
});
export function validateTool(value: Tool): ValidateResult {
  const errors: FieldErrors = {};
  const parsed = toolSchema.safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const key = String(iss.path[0]);
      if (!errors[key]) errors[key] = iss.message;
    }
  }
  return toResult(errors);
}

// ===== Skill =====
const skillSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(60, "名称过长"),
  slug: z.string().trim().min(2, "slug 至少 2 个字符").max(40, "slug 过长").regex(slugRe, "只允许小写字母 / 数字 / -，且以字母数字开头"),
  desc: z.string().trim().max(300, "描述过长"),
  files: z.number().int("文件数必须为整数").min(1, "至少 1 个文件").max(999, "文件数过大"),
});
export function validateSkill(value: Skill, others: Skill[]): ValidateResult {
  const errors: FieldErrors = {};
  const parsed = skillSchema.safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const key = String(iss.path[0]);
      if (!errors[key]) errors[key] = iss.message;
    }
  }
  const dupSlug = others.some((o) => o.id !== value.id && o.slug.trim().toLowerCase() === value.slug.trim().toLowerCase());
  if (dupSlug && !errors.slug) errors.slug = "slug 已被占用";
  let suggestion: string | undefined;
  if (errors.slug && value.slug) {
    const s = value.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (s && s !== value.slug) suggestion = `建议 slug：${s}`;
  }
  return toResult(errors, suggestion);
}

// ===== Agent =====
const agentSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40, "名称过长"),
  slug: z.string().trim().min(2, "slug 至少 2 个字符").max(30, "slug 过长").regex(slugRe, "只允许小写字母 / 数字 / -，且以字母数字开头"),
  desc: z.string().trim().max(200, "简介过长"),
  systemPrompt: z.string().trim().min(10, "System Prompt 至少 10 个字").max(4000, "System Prompt 过长"),
  modelId: z.string().min(1, "请选择默认模型"),
});
export function validateAgent(value: Agent, others: Agent[], availableModelIds: string[]): ValidateResult {
  const errors: FieldErrors = {};
  const parsed = agentSchema.safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const key = String(iss.path[0]);
      if (!errors[key]) errors[key] = iss.message;
    }
  }
  if (value.modelId && !availableModelIds.includes(value.modelId)) {
    errors.modelId = "默认模型不存在，请重新选择";
  }
  if (value.toolKeys.length === 0 && value.skillIds.length === 0) {
    errors.toolKeys = "至少启用 1 个工具或 1 个 Skill";
  }
  const dupSlug = others.some((o) => o.id !== value.id && o.slug.trim().toLowerCase() === value.slug.trim().toLowerCase());
  if (dupSlug && !errors.slug) errors.slug = "slug 已被占用";
  let suggestion: string | undefined;
  if (errors.slug && value.slug) {
    const s = value.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (s && s !== value.slug) suggestion = `建议 slug：${s}`;
  } else if (errors.systemPrompt && (value.systemPrompt?.trim().length ?? 0) < 10) {
    suggestion = "至少写清楚：角色定位 + 输出要求，例如「你是资深产品经理，输出结构化 PRD」";
  }
  return toResult(errors, suggestion);
}

// ===== Connector =====
const webhookOptional = z.union([z.literal(""), z.string().regex(httpRe, "Webhook 必须以 http(s):// 开头")]);
const connectorBase = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(60, "名称过长"),
  appId: z.string().trim().min(1, "AppID / Key 不能为空").max(120, "过长"),
  appSecret: z.string().max(200, "Secret 过长"),
  agentId: z.string().max(64, "AgentId 过长").optional().or(z.literal("")),
  webhookUrl: webhookOptional.optional(),
  encryptKey: z.string().max(200, "EncryptKey 过长").optional().or(z.literal("")),
  scope: z.string().max(300, "scope 过长"),
});
const CONNECTOR_LABEL: Record<Connector["type"], string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企业微信",
  webhook: "自定义 Webhook",
};
export function validateConnector(value: Connector, others: Connector[]): ValidateResult {
  const errors: FieldErrors = {};
  const parsed = connectorBase.safeParse(value);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const key = String(iss.path[0]);
      if (!errors[key]) errors[key] = iss.message;
    }
  }
  // 类型相关的必填
  if (value.type === "wecom" && !value.agentId?.trim()) {
    errors.agentId = "企业微信自建应用必须填写 AgentId";
  }
  if (value.type === "webhook" && !value.webhookUrl?.trim()) {
    errors.webhookUrl = "自定义 Webhook 必须填写 URL";
  }
  const dupName = others.some(
    (o) => o.id !== value.id && o.name.trim().toLowerCase() === value.name.trim().toLowerCase(),
  );
  if (dupName && !errors.name) errors.name = "已存在同名连接器";
  let suggestion: string | undefined;
  if (errors.appSecret === undefined && !value.appSecret.trim() && value.type !== "webhook") {
    suggestion = `提示：未填 ${CONNECTOR_LABEL[value.type]} Secret，连通性测试将返回鉴权失败`;
  } else if (errors.webhookUrl && value.webhookUrl && !/^https?:/i.test(value.webhookUrl)) {
    suggestion = `试试：https://${value.webhookUrl.replace(/^\/+/, "")}`;
  }
  return toResult(errors, suggestion);
}

// ===== UI helper =====
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-[11px] text-destructive">{msg}</p>;
}
