# Mini-WorkBuddy 前后端真实串通实施计划

> **文件**: `docs/plan/plan-frontend-backend-integration.md`  
> **版本**: v1.0  
> **日期**: 2026-07-16  
> **依据**: `docs/prd/mini-workbuddy-PRD.md` v1.2 + `docs/plan/frontend-backend-integration-plan.md`  
> **目标**: 把 Lovable 前端从 `mock-store` 切到真实 FastAPI，业务主路径真正跑通  
> **Ralph 分支**: `ralph/frontend-backend-integration`  
> **非目标**: 真实 IM 连接器对接、多用户鉴权、向量检索、多 Agent 协作

---

## 1. 背景与问题

当前仓库状态：

| 层 | 状态 | 说明 |
|----|------|------|
| 后端 | 主链路已具备 | models / tools / agents / conversations / chat SSE / Agent Loop |
| 前端 | UI 已落地 | Lovable 导出，侧边栏 IA 完整 |
| 数据 | 前端 mock | `mock-store` + localStorage，不落 workspace |
| 契约 | 不一致 | camelCase vs snake_case；工具名 `run_command` vs `execute_command`；模型缺供应商字段 |

结果：页面可演示，但刷新后不是后端真相，对话不触发 Agent Loop，工具调用无法真实执行。

---

## 2. 成功标准（DoD）

1. 模型 / 工具 / Agent / Skills / 会话数据来自后端 workspace，不是 localStorage 种子。
2. 模型页可新增真实 API Key，连接测试返回真实延迟/错误；密钥不落盘明文、不进 localStorage。
3. 对话页发送消息后收到真实 SSE 流（thinking/content/tool_call/tool_result/done/error）。
4. Agent 可真实调用 `read_file` / `write_file` / `execute_command`，聊天区展示过程卡片。
5. outputs 面板可列出并下载产物；刷新后会话与配置仍在。
6. Skills 可列表/启停/导入，并被 Agent 勾选后进入 Loop。
7. 前后端 typecheck / 相关测试通过；至少 1 条浏览器冒烟覆盖主路径。

**明确不阻塞 DoD**：连接器真发消息、Webhook 验签、Tokens 页、主题/强调色（可继续本地）。

---

## 3. 关键契约决议

| 冲突 | 决议 |
|------|------|
| camelCase / snake_case | 前端 `src/lib/api/mappers.ts` 统一转换 |
| 前端 `modelId`（供应商模型名） | 后端新增字段 `model`；配置主键仍为 `id` |
| Agent Loop 当前用展示名 `name` 调模型 | 改为使用 `model["model"]` |
| 默认模型 | 后端 `is_default` + `PUT /api/models/{id}/default` |
| 工具名 | 全栈统一 `read_file` / `write_file` / `execute_command` |
| Agent `toolKeys/skillIds/systemPrompt` | 映射 `tools` / `skills` + `/agent-md` |
| API Key | 创建/更新可写；读取永不回明文 |
| Skills | 补管理 API；Loop 只装载 `enabled=true` 且路径安全的 skill |
| 连接器 | P2，不挡主闭环 |

---

## 4. 实施阶段

### Phase A — 契约与工程管线
- 前端 `/api` 代理到 `127.0.0.1:8000`
- 新建 `frontend/src/lib/api/*` client / types / mappers
- 工具名与字段映射冻结

### Phase B — 配置真源
- 模型：补 `model` / `is_default`，test/Loop 使用供应商模型名
- 工具：列表 + toggle 接 API
- Agent：CRUD + agent.md 接 API

### Phase C — 对话真跑
- 会话 CRUD/search/outputs 接 API
- 聊天 upload + SSE send
- event → UI parts 映射

### Phase D — Skills 管理
- skills store/API + import/scan
- Skills 页与 Agent 勾选接真实数据

### Phase E — 洞察与治理（可后置）
- memory / logs 只读
- history / backup

### Phase F — 连接器（P2）
- 配置仓储层先做，真 IM 后做

---

## 5. User Stories（供 Ralph 执行）

> 每个 story 必须可在单次 context window 完成；依赖顺序：管线 → 模型 → 工具 → Agent → 会话/SSE → Skills → 闭环。

### US-001: 前端开发代理与 API client 骨架
**描述：** 作为开发者，我想让前端通过 `/api` 代理访问后端，并有统一 client，以便后续页面替换 mock。  
**范围：** `frontend/vite.config.ts`、`frontend/src/lib/api/client.ts`、`types.ts`、`mappers.ts` 基础文件。  
**验收：**
- 浏览器访问 `http://127.0.0.1:5173/api/ping` 返回后端 pong
- `client.ts` 对非 2xx 抛出可读错误
- 不修改业务页面数据源
- Typecheck passes

### US-002: 后端模型补供应商 model 与默认模型
**描述：** 作为系统，我需要在模型配置中保存供应商模型名与默认标记，以便聊天真正打到正确模型。  
**范围：** `schemas/model.py`、`api/models.py`、`models_store.py`、`model_tester.py`、`agent_loop.py`。  
**验收：**
- Model 含 `model: str` 与 `is_default: bool`
- `PUT /api/models/{id}/default` 保证唯一默认
- test 与 Agent Loop 使用 `model` 字段，不再用展示名
- 既有 models API 测试更新并通过
- Typecheck passes
- Tests pass

### US-003: 模型页切换到真实 API
**描述：** 作为用户，我想在模型页管理真实模型配置，以便后续对话可用。  
**范围：** `frontend/src/routes/models.tsx` + `lib/api/models.ts`。  
**验收：**
- 列表/新增/编辑/删除/测试/设默认走 `/api/models*`
- 不再写入 `modelsStore` 业务数据
- API Key 不写入 localStorage
- 请求真实到达后端（开发代理）
- Typecheck passes
- Use agent-browser to open `/models` and confirm list/create flow hits `/api/models` instead of only localStorage mock seed

### US-004: 工具名对齐并接真实 toggle API
**描述：** 作为用户，我想工具页与 Agent 使用后端真实工具标识，以便启停影响 Loop。  
**范围：** mock 默认数据、validators、tools 页、api/tools client。  
**验收：**
- 全前端 `run_command` 改为 `execute_command`
- 工具列表与启停走 `/api/tools` 与 toggle
- 刷新后启用状态保持
- Typecheck passes
- Use agent-browser to open `/tools`, toggle a tool, refresh, and see the same enabled state from API

### US-005: Agent 页切换到真实 API 与 agent.md
**描述：** 作为用户，我想创建/编辑 Agent 并保存到后端，以便对话使用真实配置。  
**范围：** `routes/agents.tsx` + `lib/api/agents.ts`。  
**验收：**
- 列表/新建/编辑/删除走 `/api/agents`
- 系统提示词读写 `/api/agents/{id}/agent-md`
- `toolKeys/skillIds/modelId/system` 正确映射到后端字段
- 主 Agent（is_default）不可删
- Typecheck passes
- Use agent-browser to open `/agents`, edit an agent tool selection, save, refresh and confirm it persisted from API

### US-006: 会话列表与详情接真实 API
**描述：** 作为用户，我想新建/切换/重命名/删除会话并刷新仍在，以便对话有持久上下文。  
**范围：** 对话页会话侧栏 + `lib/api/conversations.ts`。  
**验收：**
- 会话 CRUD/search 走 `/api/conversations*`
- 切换会话加载后端 events 并渲染历史
- 不再用 localStorage 会话真相源
- Typecheck passes
- Use agent-browser to create a conversation, rename it, refresh, and see it remain

### US-007: 对话页接入真实 SSE 发送
**描述：** 作为用户，我想发送消息后看到真实流式回复，以便业务真正执行。  
**范围：** `routes/index.tsx` 发送路径 + `lib/api/chat.ts`。  
**验收：**
- 发送调用 `POST /api/chat/send` SSE，不再 setTimeout mock
- 消费 content/thinking/done/error 事件并更新 UI
- 发送期间输入禁用；断流/错误有可见提示
- 请求经 `/api` 代理真实到达后端
- Typecheck passes
- Use agent-browser to open `/`, send a short message with configured model/agent, and observe the assistant area leave the mock timeout path

### US-008: 工具调用卡片与 outputs 面板真实化
**描述：** 作为用户，我想看到工具执行过程并下载产物，以便确认 Agent 真的做了事。  
**范围：** 对话消息 parts 映射 + outputs API。  
**验收：**
- SSE `tool_call`/`tool_result` 渲染为过程卡片
- outputs 列表与下载走 `/api/conversations/{id}/outputs*`
- 附件上传走 `/api/chat/upload`
- Typecheck passes
- Tests pass for any mapper helpers added

### US-009: Skills 管理后端 API
**描述：** 作为开发者，我需要 Skills CRUD/import/scan API，以便前端与 Agent 勾选不再空转。  
**范围：** `api/skills.py`、`schemas/skill.py`、`services/skills_store.py`、router 注册。  
**验收：**
- 支持 list/create/get/update/delete/import/scan
- 目录限制在 `workspace/config/skills/`
- ZIP 导入防 Zip Slip，大小限制生效
- 仅 enabled skill 可被后续装载
- Tests pass
- Typecheck passes

### US-010: Skills 页与 Agent 勾选接真实 API
**描述：** 作为用户，我想管理 Skills 并在 Agent 中勾选，以便扩展能力。  
**范围：** `routes/skills.tsx`、Agent 编辑弹窗 skill 多选。  
**验收：**
- Skills 页 CRUD/启停/导入走 API
- Agent 编辑仅展示 enabled skills
- 刷新后配置保持
- Typecheck passes
- Use agent-browser to open `/skills`, create or import a skill, enable it, then see it available in the Agent editor options

### US-011: 闭环集成验证
**描述：** 作为用户，我想走通“配置模型 → 配 Agent → 发消息 → 工具调用 → 落盘 → 刷新恢复”，以便确认业务真跑起来。  
**范围：** 端到端手工/自动冒烟，不新增大功能。  
**验收：**
- 后端 pytest 相关子集通过
- 前端 typecheck/lint 通过
- 主路径：模型可用 + Agent 绑三工具 + 发送触发工具 + outputs 可见 + 刷新会话仍在
- Use agent-browser to execute the main path and confirm assistant/tool UI is driven by backend events, not mock timeout text alone
- Typecheck passes

### US-012: 记忆只读 API 与页面接线（P1，可选）
**描述：** 作为用户，我想在记忆页看到真实长期/短期记忆，以便排障上下文。  
**验收：**
- GET/PUT long-term、GET short-term/stats 可用
- memory 页去静态假文案
- Typecheck passes

### US-013: 日志投影 API 与页面接线（P1，可选）
**描述：** 作为用户，我想从统一日志页查看会话事件投影，以便调试执行链路。  
**验收：**
- `GET /api/logs` 可按 type/q 过滤
- logs 页接 API
- Typecheck passes

---

## 6. 推荐执行顺序

| Priority | Story | 依赖 |
|----------|-------|------|
| 1 | US-001 代理 + API client | 无 |
| 2 | US-002 模型字段与 Loop 修正 | 无 |
| 3 | US-003 模型页真实化 | US-001, US-002 |
| 4 | US-004 工具真实化 | US-001 |
| 5 | US-005 Agent 真实化 | US-001, US-002, US-004 |
| 6 | US-006 会话真实化 | US-001 |
| 7 | US-007 SSE 发送 | US-005, US-006 |
| 8 | US-008 工具卡片/outputs | US-007 |
| 9 | US-009 Skills API | 无（可与 6–8 并行后合并） |
| 10 | US-010 Skills 前端 | US-005, US-009 |
| 11 | US-011 闭环验证 | US-001…US-010 |
| 12–13 | 记忆/日志 | 主闭环后 |

---

## 7. 非目标与风险

**非目标**
- 连接器真实平台 API
- 配置历史/备份完整治理（可后置）
- 多用户登录
- 重做 UI 视觉

**风险**
- SSE 在 TanStack Start 下的代理缓冲 → 聊天仅 client 发请求，确认 dev proxy 不缓冲
- 无真实 LLM Key → 提供本地 mock provider 做 CI/冒烟
- 字段继续漂移 → mapper 单源，禁止页面直拼 payload
- 改错 `frontend-bak/` → 只改 `frontend/`

---

## 8. 产出与同步

| 产物 | 路径 |
|------|------|
| 本计划 | `docs/plan/plan-frontend-backend-integration.md` |
| 详细串通方案 | `docs/plan/frontend-backend-integration-plan.md` |
| 产品 PRD | `docs/prd/mini-workbuddy-PRD.md` |
| Ralph 执行清单 | `prd.json` + `scripts/ralph/prd.json` |
| 旧 P0 归档 | `archive/2026-07-16-mini-workbuddy-p0/` |

---

## 9. 结论

本计划只做一件事：**让现有后端能力被前端真实消费**。  
最短可发布闭环是 US-001 → US-011；记忆/日志/连接器不挡主路径。
