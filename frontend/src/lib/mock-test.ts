// Mock connection / availability tests with fake latency and probabilistic outcomes.
// Each result may include per-step diagnostics: auth, permissions, reachability, etc.

export type TestStepState = "ok" | "warn" | "fail" | "skip";

export type TestStep = {
  id: string;
  label: string;
  state: TestStepState;
  latency: number; // ms
  detail?: string;
  logs?: string[];
  suggestion?: string;
  meta?: Record<string, string | number>;
};

export type MockTestResult = {
  ok: boolean;
  latency: number; // total ms
  message: string;
  ts: number;
  steps?: TestStep[];
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function rand(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min));
}
function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Build a fail result from a step so upstream banners show the first failure. */
function summarize(steps: TestStep[]): { ok: boolean; message: string; latency: number } {
  const total = steps.reduce((a, s) => a + s.latency, 0);
  const failed = steps.find((s) => s.state === "fail");
  if (failed) return { ok: false, latency: total, message: `${failed.label}失败 · ${failed.detail ?? ""}`.trim() };
  const warned = steps.find((s) => s.state === "warn");
  if (warned) return { ok: true, latency: total, message: `完成（有告警）· ${warned.label}: ${warned.detail ?? ""}` };
  const okStep = steps.filter((s) => s.state === "ok").at(-1);
  return { ok: true, latency: total, message: okStep?.detail ?? "全部检查通过" };
}

// ---------- 模型 ----------
export async function mockTestModel(input: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  modelId?: string;
}): Promise<MockTestResult> {
  const steps: TestStep[] = [];

  // 1) DNS / TLS 可达性
  const s1: TestStep = {
    id: "reach",
    label: "网络与 TLS",
    state: "ok",
    latency: rand(40, 180),
    detail: `连接 ${input.baseUrl || "(空)"} 成功`,
    logs: [
      `[${now()}] resolve ${new URL(safeUrl(input.baseUrl)).host} → 203.0.113.${rand(1, 254)}`,
      `[${now()}] TLS handshake OK · TLSv1.3 · TLS_AES_128_GCM_SHA256`,
    ],
  };
  await delay(s1.latency);
  if (!input.baseUrl?.trim()) {
    s1.state = "fail";
    s1.detail = "Base URL 为空";
    s1.logs = [`[${now()}] error: baseUrl is required`];
    s1.suggestion = "在编辑弹窗填入 Base URL，例如 https://api.openai.com";
    steps.push(s1);
    return finalize(steps);
  }
  if (Math.random() < 0.06) {
    s1.state = "fail";
    s1.detail = "ECONNREFUSED / DNS 解析失败";
    s1.logs = [
      `[${now()}] resolve ${safeHost(input.baseUrl)} → NXDOMAIN`,
      `[${now()}] error: unable to reach host`,
    ];
    s1.suggestion = "确认 Base URL 拼写；如为内网地址，检查出口白名单";
    steps.push(s1);
    return finalize(steps);
  }
  steps.push(s1);

  // 2) 鉴权
  const s2: TestStep = {
    id: "auth",
    label: "鉴权 (Authorization)",
    state: "ok",
    latency: rand(120, 340),
    detail: "Bearer 校验通过",
    logs: [
      `[${now()}] GET ${input.baseUrl}/v1/models`,
      `[${now()}] header: Authorization: Bearer sk-****${(input.apiKey ?? "").slice(-4) || "----"}`,
      `[${now()}] response 200 OK · 缓存 ETag: W/"a3b2"`,
    ],
  };
  await delay(s2.latency);
  if (!input.apiKey?.trim()) {
    s2.state = "fail";
    s2.detail = "缺少 API Key · 401 Unauthorized";
    s2.logs = [`[${now()}] response 401 Unauthorized`, `[${now()}] body: {"error":{"code":"invalid_api_key"}}`];
    s2.suggestion = "在模型配置中填入有效的 API Key（或使用环境变量）";
    steps.push(s2);
    return finalize(steps);
  }
  if (Math.random() < 0.08) {
    s2.state = "fail";
    s2.detail = "API Key 无效或已撤销 · 401";
    s2.logs = [`[${now()}] response 401 Unauthorized`, `[${now()}] body: {"error":{"message":"Invalid credentials"}}`];
    s2.suggestion = "在服务商后台重置 API Key，然后更新此配置";
    steps.push(s2);
    return finalize(steps);
  }
  steps.push(s2);

  // 3) 权限 / 模型可用性
  const s3: TestStep = {
    id: "perm",
    label: "拉取可用模型",
    state: "ok",
    latency: rand(140, 420),
    detail: `发现 ${rand(6, 42)} 个模型，包含 ${input.modelId || "gpt-4o-mini"}`,
    logs: [
      `[${now()}] GET /v1/models`,
      `[${now()}] parse: 21 items`,
      `[${now()}] match modelId="${input.modelId || "gpt-4o-mini"}" → found`,
    ],
    meta: { rateLimit: `${rand(2000, 10000)} rpm` },
  };
  await delay(s3.latency);
  if (input.modelId && Math.random() < 0.1) {
    s3.state = "fail";
    s3.detail = `未找到模型 "${input.modelId}" · 404`;
    s3.logs = [`[${now()}] match modelId="${input.modelId}" → not found`];
    s3.suggestion = "检查模型 ID 拼写；或改用列表中的可用模型";
    steps.push(s3);
    return finalize(steps);
  }
  steps.push(s3);

  // 4) 目标端可达性 · chat.completions dry-run
  const s4: TestStep = {
    id: "dryrun",
    label: "目标端可达性 (chat/completions)",
    state: "ok",
    latency: rand(180, 520),
    detail: `200 OK · 返回 1 token（dry-run）`,
    logs: [
      `[${now()}] POST /v1/chat/completions`,
      `[${now()}] body: {"model":"${input.modelId || "gpt-4o-mini"}","messages":[{"role":"user","content":"ping"}],"max_tokens":1}`,
      `[${now()}] response 200 OK · usage: {prompt_tokens:1, completion_tokens:1}`,
    ],
  };
  await delay(s4.latency);
  const roll = Math.random();
  if (roll < 0.05) {
    s4.state = "fail";
    s4.detail = "429 Too Many Requests";
    s4.logs = [`[${now()}] response 429 · Retry-After: 12s`];
    s4.suggestion = "降低并发或联系服务商提升配额";
  } else if (roll < 0.12) {
    s4.state = "warn";
    s4.detail = `响应偏慢 · ${s4.latency}ms`;
    s4.suggestion = "考虑更靠近的区域端点，或启用 keep-alive";
  }
  steps.push(s4);
  return finalize(steps);
}

// ---------- 工具 ----------
export async function mockTestTool(input: {
  key: string;
  name: string;
  enabled: boolean;
}): Promise<MockTestResult> {
  const steps: TestStep[] = [];

  const s1: TestStep = {
    id: "load",
    label: "加载工具定义",
    state: "ok",
    latency: rand(15, 60),
    detail: `工具 "${input.name}" 已注册`,
    logs: [`[${now()}] resolve tool "${input.key}"`, `[${now()}] schema: params/returns OK`],
  };
  await delay(s1.latency);
  steps.push(s1);

  const s2: TestStep = {
    id: "enabled",
    label: "状态检查",
    state: input.enabled ? "ok" : "fail",
    latency: 4,
    detail: input.enabled ? "已启用" : "工具当前处于停用状态",
    suggestion: input.enabled ? undefined : "在列表右侧开关中启用后再试",
    logs: [`[${now()}] enabled=${input.enabled}`],
  };
  steps.push(s2);
  if (!input.enabled) return finalize(steps);

  const s3: TestStep = {
    id: "sandbox",
    label: "沙箱权限",
    state: "ok",
    latency: rand(30, 90),
    detail: "沙箱可读写 · workspace 路径校验通过",
    logs: [
      `[${now()}] mount /workspace (ro/rw scoped)`,
      `[${now()}] policy: fs.read=allow, fs.write=allow(scoped), net=deny`,
    ],
  };
  await delay(s3.latency);
  if (Math.random() < 0.04) {
    s3.state = "fail";
    s3.detail = "沙箱初始化失败";
    s3.logs = [`[${now()}] error: EACCES /workspace`];
    s3.suggestion = "检查 workspace 目录权限，或在设置中重置沙箱";
    steps.push(s3);
    return finalize(steps);
  }
  steps.push(s3);

  const s4: TestStep = {
    id: "dryrun",
    label: "Dry-run 执行",
    state: "ok",
    latency: rand(40, 220),
    detail: dryRunDetail(input.key, input.name),
    logs: dryRunLogs(input.key),
  };
  await delay(s4.latency);
  if (Math.random() < 0.05) {
    s4.state = "warn";
    s4.detail = "执行成功但耗时较长";
    s4.suggestion = "检查子进程/IO 是否阻塞";
  }
  steps.push(s4);
  return finalize(steps);
}

function dryRunDetail(key: string, name: string) {
  switch (key) {
    case "read": return "读取 ./README.md (2.1KB) 成功";
    case "write": return "写入 /tmp/probe.txt · 已回滚";
    case "terminal": return "echo ok · exit 0 · 32ms";
    default: return `${name} 自检通过`;
  }
}
function dryRunLogs(key: string): string[] {
  const t = now();
  switch (key) {
    case "read": return [`[${t}] open("./README.md")`, `[${t}] read 2148 bytes`, `[${t}] close()`];
    case "write": return [`[${t}] open("/tmp/probe.txt", "w")`, `[${t}] write 12 bytes`, `[${t}] unlink (rollback)`];
    case "terminal": return [`[${t}] $ echo ok`, `[${t}] stdout: ok`, `[${t}] exit code: 0`];
    default: return [`[${t}] dry-run start`, `[${t}] dry-run ok`];
  }
}

// ---------- 连接器 ----------
export async function mockTestConnector(input: {
  type: "feishu" | "dingtalk" | "wecom" | "webhook";
  name: string;
  appId: string;
  appSecret?: string;
  agentId?: string;
  webhookUrl?: string;
  enabled: boolean;
}): Promise<MockTestResult> {
  const steps: TestStep[] = [];

  // 状态
  const s0: TestStep = {
    id: "enabled",
    label: "状态检查",
    state: input.enabled ? "ok" : "fail",
    latency: 3,
    detail: input.enabled ? "连接器已启用" : "连接器已停用",
    suggestion: input.enabled ? undefined : "在卡片右上角开关启用后再测试",
  };
  steps.push(s0);
  if (!input.enabled) return finalize(steps);

  // Webhook 分支
  if (input.type === "webhook") {
    const s1: TestStep = {
      id: "url",
      label: "URL 与 TLS",
      state: input.webhookUrl?.trim() ? "ok" : "fail",
      latency: rand(60, 220),
      detail: input.webhookUrl?.trim() ? `解析 ${safeHost(input.webhookUrl)}` : "Webhook URL 为空",
      logs: input.webhookUrl?.trim()
        ? [`[${now()}] resolve ${safeHost(input.webhookUrl)} → 203.0.113.${rand(2, 250)}`, `[${now()}] TLS OK · TLSv1.3`]
        : [`[${now()}] error: webhookUrl is required`],
      suggestion: input.webhookUrl?.trim() ? undefined : "在编辑中填入形如 https://example.com/hook 的地址",
    };
    await delay(s1.latency);
    steps.push(s1);
    if (s1.state === "fail") return finalize(steps);

    const s2: TestStep = {
      id: "ping",
      label: "目标端可达性 · POST ping",
      state: "ok",
      latency: rand(150, 480),
      detail: "200 OK · 响应 ≤ 512B",
      logs: [
        `[${now()}] POST ${input.webhookUrl} (Content-Type: application/json)`,
        `[${now()}] body: {"event":"ping","ts":${Date.now()}}`,
        `[${now()}] response 200 · body: {"ok":true}`,
      ],
    };
    await delay(s2.latency);
    if (Math.random() < 0.2) {
      const errs = ["502 Bad Gateway · 上游无响应", "网关超时（3000ms）", "证书过期", "429 Too Many Requests"];
      s2.state = "fail";
      s2.detail = errs[rand(0, errs.length)];
      s2.logs = [`[${now()}] POST ${input.webhookUrl}`, `[${now()}] ${s2.detail}`];
      s2.suggestion = "检查目标服务健康状态、证书有效期与限频配置";
    }
    steps.push(s2);
    return finalize(steps);
  }

  // 平台分支 (feishu/dingtalk/wecom)
  const codes: Record<string, string> = {
    feishu: "code 99991663 · Invalid app_secret",
    dingtalk: "errcode 40078 · invalid appSecret",
    wecom: "errcode 40001 · invalid corp secret",
  };
  const tokenPath: Record<string, string> = {
    feishu: "/open-apis/auth/v3/tenant_access_token/internal",
    dingtalk: "/gettoken",
    wecom: "/cgi-bin/gettoken",
  };
  const permPath: Record<string, string> = {
    feishu: "/open-apis/application/v6/applications/self",
    dingtalk: "/topapi/v2/user/getuserinfo",
    wecom: "/cgi-bin/agent/get",
  };

  // 1) AppID 存在性
  const s1: TestStep = {
    id: "appid",
    label: "AppID / Key 校验",
    state: input.appId?.trim() ? "ok" : "fail",
    latency: 5,
    detail: input.appId?.trim() ? `AppID=${input.appId}` : "AppID 为空",
    suggestion: input.appId?.trim() ? undefined : "在编辑中填入服务商控制台颁发的 AppID / CorpID",
  };
  steps.push(s1);
  if (s1.state === "fail") return finalize(steps);

  // 2) 鉴权
  const s2: TestStep = {
    id: "auth",
    label: "鉴权 · 获取 access_token",
    state: "ok",
    latency: rand(200, 520),
    detail: "access_token 已获取 · 有效期 7200s",
    logs: [
      `[${now()}] POST ${tokenPath[input.type]}`,
      `[${now()}] body: {"app_id":"${input.appId}","app_secret":"****${(input.appSecret ?? "").slice(-4) || "----"}"}`,
      `[${now()}] response 200 · {"code":0,"tenant_access_token":"t-****","expire":7200}`,
    ],
    meta: { expiresIn: "7200s" },
  };
  await delay(s2.latency);
  if (!input.appSecret?.trim()) {
    s2.state = "fail";
    s2.detail = codes[input.type];
    s2.logs = [`[${now()}] POST ${tokenPath[input.type]}`, `[${now()}] response 200 · ${codes[input.type]}`];
    s2.suggestion = "在编辑中填入 App Secret（服务商后台可复制）";
    steps.push(s2);
    return finalize(steps);
  }
  if (Math.random() < 0.1) {
    s2.state = "fail";
    s2.detail = codes[input.type];
    s2.logs = [`[${now()}] response 200 · ${codes[input.type]}`];
    s2.suggestion = "确认 App Secret 是否与 AppID 匹配；若最近轮换过密钥请同步更新";
    steps.push(s2);
    return finalize(steps);
  }
  steps.push(s2);

  // 3) 权限 / 应用信息
  const s3: TestStep = {
    id: "perm",
    label: "拉取权限 · 应用/成员信息",
    state: "ok",
    latency: rand(160, 380),
    detail: input.type === "wecom" ? `agentid=${input.agentId} · name="${input.name}"` : `应用 "${input.name}" 已授权`,
    logs: [
      `[${now()}] GET ${permPath[input.type]}`,
      `[${now()}] response 200 · scopes: im:message,contact:read`,
    ],
    meta: { scopes: "im:message,contact:read" },
  };
  await delay(s3.latency);
  if (input.type === "wecom" && !input.agentId?.trim()) {
    s3.state = "fail";
    s3.detail = "errcode 40056 · invalid agentid";
    s3.logs = [`[${now()}] GET /cgi-bin/agent/get`, `[${now()}] response {"errcode":40056}`];
    s3.suggestion = "在企业微信配置中填入 AgentID";
    steps.push(s3);
    return finalize(steps);
  }
  if (Math.random() < 0.08) {
    s3.state = "warn";
    s3.detail = "缺少推荐权限 · contact:read";
    s3.suggestion = "在服务商后台申请 contact:read 以启用成员信息功能";
  }
  steps.push(s3);

  // 4) 目标端可达性 · 发送 dry-run
  const s4: TestStep = {
    id: "dryrun",
    label: "目标端可达性 · dry-run 发送",
    state: "ok",
    latency: rand(180, 520),
    detail: sendDetail(input.type),
    logs: sendLogs(input.type, input.name),
  };
  await delay(s4.latency);
  if (Math.random() < 0.1) {
    const errs = ["429 Too Many Requests · 限频命中", "IP 未加入应用可信 IP 白名单", "证书过期 / TLS 握手失败", "网关超时（3000ms）"];
    s4.state = "fail";
    s4.detail = errs[rand(0, errs.length)];
    s4.suggestion = "配置 IP 白名单 / 检查网络出口 / 升级 TLS 证书";
  }
  steps.push(s4);
  return finalize(steps);
}

function sendDetail(t: string) {
  if (t === "dingtalk") return "workflow.dry-run OK · 无实际推送";
  if (t === "wecom") return "message/send · dry-run OK";
  return "im.message.send · dry-run OK";
}
function sendLogs(t: string, name: string): string[] {
  const ts = now();
  const path =
    t === "dingtalk" ? "/topapi/message/corpconversation/asyncsend_v2"
    : t === "wecom" ? "/cgi-bin/message/send"
    : "/open-apis/im/v1/messages";
  return [
    `[${ts}] POST ${path}?dry_run=1`,
    `[${ts}] body: {"msg_type":"text","content":{"text":"probe from ${name}"}}`,
    `[${ts}] response 200 · {"errcode":0}`,
  ];
}

function finalize(steps: TestStep[]): MockTestResult {
  const s = summarize(steps);
  return { ok: s.ok, latency: s.latency, message: s.message, ts: Date.now(), steps };
}

function safeUrl(u?: string): string {
  try { return new URL(u ?? "").toString(); }
  catch { return "http://localhost"; }
}
function safeHost(u?: string): string {
  try { return new URL(u ?? "").host; }
  catch { return "localhost"; }
}

export function formatSince(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  return `${Math.floor(diff / 3_600_000)}h 前`;
}
