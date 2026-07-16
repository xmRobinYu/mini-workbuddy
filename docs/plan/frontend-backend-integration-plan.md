# Mini-WorkBuddy 前后端串通计划

> **目标**: 让业务真正跑通，而不是前端 mock 演示  
> **依据**: 当前 `frontend/`（Lovable 导出 UI）+ `backend/`（P0 API / Agent Loop）+ PRD v1.2  
> **原则**: 契约先行 → 垂直切片 → 分页面置换 mock → 端到端验收  
> **非目标（本阶段）**: 连接器真实 IM 平台对接、多用户鉴权、向量检索

---

## 0. 现状判断

### 0.1 后端已有能力（可复用）

| 模块 | 状态 | 关键路径 |
|------|------|----------|
| 模型 CRUD + 连接测试 + 密钥链 | ✅ | `/api/models`, `/api/models/{id}/test` |
| 工具列表 + 启停 | ✅ | `/api/tools`, `/api/tools/{name}/toggle` |
| Agent CRUD + agent.md | ✅ | `/api/agents`, `/api/agents/{id}/agent-md` |
| 会话 CRUD / 搜索 / outputs | ✅ | `/api/conversations*` |
| 聊天上传 + SSE 发送 + Agent Loop | ✅ | `/api/chat/upload`, `/api/chat/send` |
| 记忆读写（工具层） | ✅ store | `memory_store.save/search`（无 REST） |
| Skills 执行（Loop 内） | ⚠️ 半成品 | 读 `workspace/config/skills/{id}/SKILL.md`，**无管理 API** |
| 连接器 / 配置历史 / 统一日志 / 备份 | ❌ | 前端 mock only |

### 0.2 前端现状（阻塞真实业务）

| 问题 | 影响 |
|------|------|
| 数据全部走 `mock-store` / `mock-test` / localStorage | 刷新可演示，但不落 workspace |
| 无统一 API client（旧 `lib/api.ts` 已被替换掉） | 页面无法调后端 |
| Vite/TanStack 配置无 `/api` 代理 | 浏览器跨域/联调不稳 |
| 字段模型与后端不一致 | 直接对接会 422 / 行为错乱 |
| 对话页发送是 `setTimeout` mock | 不触发 Agent Loop |
| 工具 key 用 `run_command`，后端是 `execute_command` | Agent 勾选工具会失效 |

### 0.3 关键契约冲突（必须先对齐）

| 领域 | 前端（当前） | 后端（当前） | 处理策略 |
|------|--------------|--------------|----------|
| 命名风格 | camelCase（`baseUrl`） | snake_case（`base_url`） | 前端 DTO 适配层统一转换 |
| 模型字段 | `modelId`（供应商模型名，如 deepseek-chat）, `context:"128k"`, `status`, `default`, 明文 `apiKey` | 配置主键叫 `id`；路径参数名虽是 `model_id` 但语义是配置 UUID；**没有供应商模型名字段**；Loop 当前把 `name` 当 chat `model` 参数；无 status/default；密钥链引用 | **后端新增供应商字段 `model`（或 `provider_model`）+ `is_default`**；禁止再拿展示名当模型名；context 双向换算；status 由 test 结果派生；apiKey 只写不读 |
| 工具标识 | `key: run_command` | `name: execute_command` | **前端统一改为 execute_command**；展示名仍可叫「命令行」 |
| 工具编辑 | 可改 name/desc/detail/binding | 仅 toggle enabled | P0 先只接启停；展示文案前端静态映射 |
| Agent 字段 | `toolKeys/skillIds/systemPrompt/system/slug/tags` | `tools/skills` + 独立 agent-md + `is_default` | 适配层映射；slug/tags 可先本地或后端扩展 |
| Skills | 完整 CRUD UI | 无 API | **补 Skills 管理 API**（P0 必需，否则 Agent.skills 空转） |
| 会话消息 | 前端自建 parts 结构 | JSONL events + SSE event 流 | 前端做 event→UI parts 映射 |
| 连接器 | 重 UI | 无后端 | **P1**：不阻塞主业务闭环 |

---

## 1. 成功标准（Definition of Done）

完成下列「真实路径」即视为串通成功：

1. 前端启动后，模型/工具/Agent/会话数据来自后端 workspace，而不是 localStorage 种子数据  
2. 在模型页新增真实 API Key，连接测试返回真实延迟/错误  
3. 在对话页选择 Agent，发送消息，收到 SSE 流式回复  
4. Agent 可真实调用 `read_file` / `write_file` / `execute_command`，结果在聊天区展示  
5. 工具执行产物可在 outputs 面板看到并可下载  
6. Skills 至少可列表/启停/导入，并被 Agent 勾选后进入 Loop  
7. 刷新浏览器后，会话与配置仍在  
8. 关键路径有自动化测试（后端 API + 1 条前端联调/E2E 冒烟）

**明确不阻塞 DoD 的项**：连接器真实发消息、Webhook 签名验真、Tokens 页、主题/强调色（可继续本地）。

---

## 2. 总体策略

```
Phase A  契约与管线（1 天内）
   ↓
Phase B  垂直切片：模型 → 工具 → Agent → 会话/聊天 SSE（核心闭环）
   ↓
Phase C  Skills 管理 API + 对话/Agent 接 Skills
   ↓
Phase D  记忆 / 日志只读 API（洞察页去 mock）
   ↓
Phase E  配置历史 + 备份恢复（治理能力）
   ↓
Phase F  连接器后端（可并行，不挡主闭环）
```

核心思想：

- **先打穿一条主路径**：配置模型 → 配 Agent → 新建会话 → 发消息 → 工具调用 → 落盘  
- **页面置换 mock 要整页切换**，禁止同一页面一半 mock 一半 API  
- **适配层集中在 `frontend/src/lib/api/`**，页面不直接散落 fetch  
- **后端缺字段就补字段**，不要在前端伪造业务真相（如健康状态、默认模型）

---

## 3. 分阶段计划

### Phase A — 契约与工程管线（前置，必须先做）

#### A1. 冻结 OpenAPI 契约

- 以运行中的 `http://localhost:8000/openapi.json` 为基线导出  
- 新增文档：`docs/plan/api-contract-v1.md`（或直接维护 openapi 快照）  
- 明确每个资源的：
  - 请求/响应字段
  - 错误码与中文 `detail`
  - 前端展示字段映射

#### A2. 前端基础设施

新建：

```text
frontend/src/lib/api/
  client.ts          # baseURL=/api, 错误处理, JSON
  types.ts           # 后端 snake_case 类型
  mappers.ts         # snake ↔ camel, context 换算
  models.ts
  tools.ts
  agents.ts
  conversations.ts
  chat.ts            # upload + SSE
  skills.ts
  memory.ts
  logs.ts
  history.ts
  backup.ts
```

要求：

- `client.ts` 统一处理非 2xx，抛出可读中文错误  
- SSE 用 `fetch` 流式读取（便于带 JSON body 的 POST `/chat/send`）  
- 提供 `queryKeys` 方便后续接 React Query（可先不用，但 key 先定）

#### A3. 开发代理

在 `frontend/vite.config.ts`（或 TanStack Start server 中间层）增加：

```ts
// 目标行为
proxy: {
  "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
}
```

验收：浏览器访问 `http://127.0.0.1:5173/api/ping` 返回 `{ pong: "ok" }`。

#### A4. 字段对齐清单（本阶段落地规则）

| 规则 | 说明 |
|------|------|
| 工具名 | 全栈统一 `read_file` / `write_file` / `execute_command` |
| 模型上下文 | UI 可显示 `128k`，API 传 `131072`（或约定 `128000`）；mapper 负责 |
| 模型密钥 | 创建/更新可传 `api_key`；读取永不回明文，UI 显示「已配置/未配置」 |
| Agent 提示词 | 列表不传全文；编辑时读/写 `/agent-md` |
| 供应商模型名 | 后端字段名用 `model`；前端 ViewModel 仍可用 `modelId`，由 mapper 转换 |
| 默认模型 | 后端增加 `is_default`；设置默认走专用接口 |

**交付物**

- [ ] `/api` 代理通  
- [ ] `lib/api/*` 骨架可调用 ping/models/tools  
- [ ] 契约冲突表评审通过  

**预估**: 0.5–1 天

---

### Phase B — 主业务垂直切片（最高优先级）

目标：不靠 mock，完成「能聊天、能调工具」。

#### B1. 模型页真实化

**命名澄清（极易踩坑）**

| 概念 | 前端当前 | 后端当前 | 决议 |
|------|----------|----------|------|
| 配置记录主键 | `id` | `id`（路径参数写作 `{model_id}`） | 继续用 UUID `id`；前端 mapper 不混淆 |
| 供应商模型名 | `modelId`（如 `deepseek-chat`） | **缺失**；Loop 误用 `name` | 后端新增字段 **`model`**（OpenAI `model` 参数）；前端 `modelId ↔ model` |
| 展示名 | `name` | `name` | 仅 UI 展示，不进 chat completion |
| 默认模型 | `default` | 无 | 后端加 `is_default` + 设默认接口 |

**后端补齐**

- `Model` 增加：
  - `model: str`（调用 chat/completions 的供应商模型名；兼容别名可读 `provider_model` 不推荐）
  - `is_default: bool`
- `POST /api/models` / `PUT` 支持上述字段  
- `PUT /api/models/{id}/default`：把指定模型设默认，其余取消  
- （可选）`last_test_status` / `last_test_at` / `last_test_error` 持久化，供列表筛选
- 模型连接测试请求体同步使用 `model` 字段，不再用展示名

**Agent Loop 同步**

- 调模型时使用 `model["model"]`（供应商模型名），**禁止**再用展示 `name`

**前端**

- `models.tsx` 去掉 `modelsStore` 写路径  
- 列表/新增/编辑/删除/测试/设默认全部走 API  
- 测试详情继续用现有 `TestDetailDialog`，数据来自真实 test 响应

**验收**

- [ ] 新建 DeepSeek/百炼模型并测试成功  
- [ ] 刷新后模型仍在  
- [ ] `models.json` 无明文 key  

#### B2. 工具页真实化（最小集）

**后端**

- 保持三工具不可增删  
- 现有 toggle API 足够 P0  
- （可选）`POST /api/tools/{name}/test`：对 `read_file` 读一个探针文件、对 `execute_command` 跑 `echo ok` 等只读自检

**前端**

- 列表/启停接 API  
- 名称/描述/icon 用前端静态元数据映射（key→文案）  
- 连接器绑定 UI 可先只读隐藏或 local-only，不进主路径

**验收**

- [ ] 禁用 `execute_command` 后，Agent 不再暴露该工具  
- [ ] 启停状态刷新后保持  

#### B3. Agent 页真实化

**后端**

- 校验 `model_id` 存在  
- 校验 `tools ⊆ 内置工具`  
- 校验 `skills` 引用存在（依赖 Phase C；C 完成前允许空 skills）  
- （建议）增加 `POST /api/agents/{id}/clone`  
- （可选）`slug` / `tags` 字段；没有的话前端暂不持久化标签

**前端映射**

```text
toolKeys  ↔ tools
skillIds  ↔ skills
system    ↔ is_default
systemPrompt ↔ GET/PUT /agent-md
```

**验收**

- [ ] 主 Agent 不可删  
- [ ] 编辑工具勾选后，聊天真实生效  
- [ ] agent.md 保存后下次组装系统提示词可读到  

#### B4. 会话 + 对话页真实化（闭环关键）

**前端改造点（`routes/index.tsx`）**

1. 会话列表：`GET /api/conversations` + search  
2. 新建会话：`POST /api/conversations`  
3. 切换会话：`GET /api/conversations/{id}` → 事件映射为消息 UI  
4. 重命名/删除接 API  
5. 发送：
   - 若有附件 → `POST /api/chat/upload`  
   - `POST /api/chat/send`（SSE）  
6. 消费 SSE 事件：
   - `thinking` → 思考态  
   - `content` → 追加 assistant text  
   - `tool_call` / `tool_result` → parts 卡片  
   - `done` / `error` → 结束态  
7. outputs 面板：`GET /api/conversations/{id}/outputs` + 下载

**事件映射建议**

| SSE / JSONL | UI |
|-------------|----|
| user message event | 用户气泡 |
| thinking | 可折叠“思考中” |
| content delta | assistant 文本流式 |
| tool_call | tool card running |
| tool_result | tool card done/error |
| skill 同类事件 | skill card |
| done | streaming=false |

**后端确认/小补**

- 确保 send 前 conversation/agent/model 缺失时返回明确 4xx  
- 若前端要做“本轮临时禁用某些工具”，需扩展 `ChatSendRequest`：
  - 方案 1（推荐 P0 不做）：本轮选择仅 UI 提示，实际以 Agent 配置为准  
  - 方案 2：增加 `tool_allowlist` / `skill_allowlist` 可选字段  
- P0 建议采用方案 1，避免范围膨胀；UI 文案改为“默认使用 Agent 已配置能力”

**验收（核心 Demo 脚本）**

1. 配置可用模型并设默认  
2. 确认主 Agent 绑定该模型与三工具  
3. 新建对话，发送：`请用 read_file 读取 workspace 下任意说明，并写一个 hello.txt 到 outputs`  
4. 看到流式回复 + 工具卡片  
5. outputs 出现文件且可下载  
6. 刷新页面会话仍在  

**预估**: 2–4 天（含联调）

---

### Phase C — Skills 管理 API（P0 必需补齐）

没有 Skills API，前端 Skills 页与 Agent 勾选都是假的；Loop 虽能读 `SKILL.md`，但无法管理。

#### C1. 后端

新增模块：

```text
backend/app/api/skills.py
backend/app/schemas/skill.py
backend/app/services/skills_store.py
```

建议 API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列表 |
| POST | `/api/skills` | 新增（写目录 + SKILL.md） |
| GET | `/api/skills/{id}` | 详情 |
| PUT | `/api/skills/{id}` | 更新元数据/启停 |
| DELETE | `/api/skills/{id}` | 删除（内置可禁删） |
| POST | `/api/skills/import` | ZIP 导入 |
| POST | `/api/skills/scan` | 扫描未注册目录 |
| GET | `/api/skills/{id}/files` | 文件树（可 P1） |
| GET/PUT | `/api/skills/{id}/files/{path}` | 读/写文件（可 P1） |

数据建议：

- 目录：`workspace/config/skills/{id}/`  
- 元数据：`workspace/config/skills.json` 或每技能 `meta.json`  
- 字段：`id, name, slug, description, enabled, source, file_count, created_at, updated_at`

安全：

- Zip Slip  
- 大小限制（统一：上传 20MB 或 50MB，前后端同一常量）  
- 路径限制在 skills 根目录  

#### C2. 前端

- `skills.tsx` 全量换 API  
- Agent 编辑弹窗的 skill 多选自真实列表  
- 仅 `enabled=true` 的 skill 可被 Agent 勾选 / Loop 装载  

**验收**

- [ ] 导入一个含 SKILL.md 的 zip，Agent 勾选后发送消息可触发 skill 调用卡片  

**预估**: 1–2 天

---

### Phase D — 洞察页只读真实化（记忆 / 日志）

#### D1. 记忆 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/memory/long-term` | 读长期记忆 |
| PUT | `/api/memory/long-term` | 编辑保存 |
| GET | `/api/memory/short-term` | 按天列表 |
| GET | `/api/memory/stats` | 占用、阈值进度 |

前端 `memory.tsx` 去静态文案，改为真实文件内容。

#### D2. 日志 API（先做“会话事件投影”）

P0 不必上独立日志库，直接从 conversations JSONL 投影：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/logs` | query: type/level/status/q/from/to/limit |
| GET | `/api/logs/export` | 导出 zip/jsonl |

映射：

- 模型调用、工具调用、技能调用、错误事件 → 日志行  
- 详情侧栏展示 input/output  

前端 `logs.tsx` 接 API；筛选先支持子集也可。

**预估**: 1–2 天

---

### Phase E — 配置治理（历史 / 备份）

#### E1. 变更历史

写操作时由后端记录快照（models/tools/skills/agents）：

- `GET /api/history/{entity}`  
- `POST /api/history/{entity}/rollback`  
- `DELETE /api/history/{entity}`  
- 保留最近 30 条  

前端 `history.tsx` 去 localStorage。

#### E2. 备份恢复

- `GET /api/backup` 导出配置包（不含明文密钥）  
- `POST /api/backup/restore?mode=merge|replace`  

前端设置页备份区切换到 API。主题/强调色可继续本地。

**预估**: 1–2 天

---

### Phase F — 连接器（并行，不挡主闭环）

分两层：

1. **配置仓储层（先做）**  
   - connectors CRUD + 启停 + 脱敏导出导入  
   - secret 走 keyring / 加密文件  
2. **运行时集成层（后做）**  
   - 连通性测试（token 获取）  
   - Webhook 入站校验  
   - 健康巡检 worker  

前端连接器 UI 已很重，后端先支持“可保存、可测试、可导入导出”，再接真 IM API。

**预估**: 配置层 1–2 天；真集成另开迭代

---

## 4. 推荐实施顺序（按天）

| 天数 | 事项 | 退出标准 |
|------|------|----------|
| Day 1 | Phase A：代理、api client、mapper、工具名对齐 | `/api/ping` 通；models list 可在浏览器控制台拉取 |
| Day 2 | B1 模型 API 字段补齐 + 模型页去 mock | 真实 test 连接成功 |
| Day 3 | B2 工具页 + B3 Agent 页去 mock | Agent 绑定模型/工具成功 |
| Day 4–5 | B4 会话/对话 SSE 全接通 | 主路径 Demo 脚本通过 |
| Day 6 | Phase C Skills API + 页面对接 | 技能可导入并被调用 |
| Day 7 | Phase D 记忆/日志只读 | 洞察页有真实数据 |
| Day 8 | Phase E 历史/备份 + 回归 | 配置可回滚/恢复 |
| 之后 | Phase F 连接器 | 不阻塞发版主闭环 |

若资源有限，**Day 1–5 是最小可发布串通范围**。

---

## 5. 页面置换清单（Do / Don't）

| 页面 | 目标数据源 | 阶段 | 备注 |
|------|------------|------|------|
| 模型 | API | B | 必须 |
| 工具 | API | B | 必须 |
| Agent | API | B | 必须 |
| 对话 | API + SSE | B | 必须 |
| Skills | API | C | 必须（主闭环增强） |
| 记忆 | API | D | 高优先级 |
| 日志 | API | D | 高优先级 |
| 历史 | API | E | 中 |
| 设置-备份 | API | E | 中 |
| 设置-主题/强调色 | local | - | 可保留本地 |
| Tokens | 本地 CSS | - | 无需后端 |
| 连接器 | API | F | 可后置 |

**Don't**

- 不要继续在 `mock-store` 里加业务逻辑  
- 不要让聊天页“先假发送再后台静默同步”  
- 不要前端持久化 API Key 到 localStorage  
- 不要前后端各维护一套工具名  

---

## 6. 后端待补接口总表

### P0（主闭环）

| 模块 | 接口 | 优先级 |
|------|------|--------|
| models | 字段补供应商 `model`/`is_default`；`PUT /{id}/default`；Loop/test 改用 `model` | P0 |
| skills | 完整管理 API + import/scan | P0 |
| chat | （可选）allowlist；错误信息可观测性增强 | P0/P0.5 |
| tools | （可选）`POST /{name}/test` | P0.5 |

### P1（洞察与治理）

| 模块 | 接口 | 优先级 |
|------|------|--------|
| memory | GET/PUT long-term, GET short-term/stats | P1 |
| logs | GET list/export（JSONL 投影） | P1 |
| history | list/rollback/clear | P1 |
| backup | export/restore | P1 |
| agents | clone | P1 |

### P2（连接器）

| 模块 | 接口 | 优先级 |
|------|------|--------|
| connectors | CRUD/test/health/import/export/webhook | P2 |

---

## 7. 前端改造总表

1. **新增** `src/lib/api/*`，删除业务页对 `mock-store` 的写入依赖  
2. **保留** `mock-store` 仅用于 Story/视觉基线（或改名 `dev-fixtures`）  
3. **对话页重写数据层**（UI 可少动，handleSend/session 全换）  
4. **Agent/Model/Tool/Skill 四页** 统一：loading / empty / error / toast  
5. **类型单源**：`types.ts`（后端）+ `mappers.ts` → 页面 ViewModel  
6. **代理与环境变量**：`VITE_API_BASE=/api`  

---

## 8. 测试与验收计划

### 8.1 后端

- 现有 pytest 保持绿灯  
- 新增：
  - skills API 测试（CRUD/import/slip）  
  - models default / model_id 测试  
  - chat send 在 mock LLM 下的 SSE 事件序（可用 httpx mock）  

### 8.2 前端

- 组件级：mapper 单测（context 换算、工具名映射）  
- 冒烟 E2E（Playwright/agent-browser）：
  1. 打开模型页看到后端数据  
  2. 新建会话并发送“回复 OK”  
  3. 页面出现 assistant 文本  

### 8.3 手工 Demo（发布前必过）

见 Phase B4 验收脚本。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 前后端字段继续漂移 | 联调反复 422 | 先定契约与 mapper，禁止页面直拼 payload |
| SSE + TanStack Start SSR 环境差异 | 浏览器流式异常 | 聊天请求仅在 client 执行；注意 polyfill/代理缓冲 |
| 无真实 LLM Key | 无法验证闭环 | 提供 fake provider / 录制回放模式供 CI |
| Skills 缺失导致 Agent 页假可用 | 用户误判 | Skills 进入 P0，不做完不宣称闭环完成 |
| 连接器范围过大 | 拖死主路径 | 严格 P2，UI 可显示“后端待接入” |
| 旧 frontend-bak / mock 残留 | 改错目录 | 只改 `frontend/`，bak 不进主线 |

---

## 10. 里程碑

| 里程碑 | 标志 | 业务价值 |
|--------|------|----------|
| M1 管线通 | 前端经代理打到后端 | 可联调 |
| M2 配置真源 | 模型/工具/Agent 全走 API | 配置不再是演示数据 |
| M3 对话真跑 | SSE + 工具调用 + outputs | **业务真正跑起来** |
| M4 技能可用 | Skills 管理 + 调用 | 能力可扩展 |
| M5 可观测 | 记忆/日志真实化 | 能排障 |
| M6 可治理 | 历史回滚/备份 | 敢改配置 |
| M7 可集成 | 连接器后端 | 接入外部协作面 |

---

## 11. 立即执行的第一批任务（从今天就可开工）

1. **A3** 给前端补 `/api` 代理，验证 ping  
2. **A2** 落地 `lib/api/client.ts` + `models.ts`  
3. **B1** 后端 `Model` 增加供应商字段 `model`、`is_default`，并改 Agent Loop / test 使用 `model`（不是展示名，也不是配置 UUID）  
4. **前端工具名** `run_command` → `execute_command`  
5. **B4 骨架** 对话页先接「会话列表 + 新建 + 空发送 SSE」，再做工具卡片映射  
6. **C1** 开工 Skills store/API（与 B 后半并行）  

---

## 12. 结论

当前并不是“后端空白”，而是：

- **后端主链路已有 60–70%**（模型/工具/Agent/会话/聊天/Loop）  
- **前端 100% mock**，且契约不一致  
- **真正缺口**集中在：前端 API 层、字段对齐、Skills 管理 API、对话页 SSE 置换，以及洞察/治理类接口

按本计划推进，**最短路径（约 1 周）**可以达到：

> 真实配置 + 真实对话 + 真实工具调用 + 刷新可恢复  

这才是“业务跑起来”的最小闭环；连接器与高级治理放到闭环之后迭代。
