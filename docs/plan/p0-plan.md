# Mini-WorkBuddy P0 开发计划

> **来源**: `docs/prd/mini-workbuddy-PRD.md` v1.1  
> **范围**: P0 — 6 核心模块  
> **开发优先级**: 项目基础设施 → 模型管理 → 工具管理（含安全限制）→ Agent 管理 → 聊天交互 → Agent Loop  
> **原则**: 安全加固与功能开发同步进行，不可延后  
> **技术栈**: FastAPI + React 18 + Vite，文件存储（JSON/JSONL/Markdown），无数据库

---

## 模块总览

| 序号 | 模块 | 关键交付 | 前置依赖 |
|------|------|----------|----------|
| 1 | 项目基础设施 | 前后端脚手架、workspace 目录、暖色调 UI 框架 | 无 |
| 2 | 模型管理 | 模型 CRUD、连接测试、密钥链存储 | 模块 1 |
| 3 | 工具管理 | 3 内置工具、启用/禁用、安全限制 | 模块 1 |
| 4 | Agent 管理 | Agent CRUD、四栏目配置、agent.md 编辑 | 模块 2、3 |
| 5 | 聊天交互 | 会话管理、SSE 流式、文件上传、工具过程展示 | 模块 4 |
| 6 | Agent Loop | 工具调用循环（max 50）、JSONL 持久化、系统提示词组装 | 模块 5 |

---

## 模块 1：项目基础设施

### 需求概述

搭建前后端项目脚手架、暖色调极简 UI 布局、workspace 数据目录结构，为后续所有功能模块提供运行基础。

### 验收标准

- [ ] 前端 `npm run dev` 正常启动
- [ ] 后端 `uvicorn` 正常启动，`/docs` 可访问
- [ ] workspace 目录结构正确创建
- [ ] `workspace/.gitignore` 正确忽略敏感目录
- [ ] 暖色调极简 UI 框架搭建完成（左侧菜单 + 右侧内容区）
- [ ] 左侧菜单包含：聊天、Agent 管理、模型管理、工具管理、技能管理、执行日志、模型日志
- [ ] 所有页面文字为简体中文
- [ ] 前后端可联调（CORS 配置正确）

### workspace 目录结构

```
workspace/
├── config/
│   ├── models.json
│   ├── agents/
│   ├── skills/
│   └── command_blocklist.json
├── conversations/
├── memory/
│   └── archive/
└── .gitignore
```

### 技术栈

| 层 | 选型 |
|----|------|
| 后端框架 | FastAPI + uvicorn |
| 包管理 | uv |
| LLM 客户端 | httpx / aiohttp |
| 数据存储 | JSON / JSONL / Markdown 文件 |
| Token 计数 | tiktoken（cl100k_base） |
| 文件锁 | filelock |
| 密钥存储 | keyring |
| 前端框架 | React 18+ + Vite |
| 样式 | CSS Modules / Tailwind CSS |
| Markdown | react-markdown + remark-gfm |
| 代码高亮 | react-syntax-highlighter |
| SSE | EventSource / fetch streaming |
| 图标 | Lucide React |

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-01 | 初始化 FastAPI 项目脚手架，创建 `app/` 目录结构 |
| B-02 | 配置 pyproject.toml 依赖（fastapi, uvicorn, httpx, pydantic, python-multipart, tiktoken, filelock, keyring, aiofiles, python-dateutil） |
| B-03 | 创建 workspace 目录结构 |
| B-04 | 创建 `workspace/.gitignore`，忽略敏感目录 |
| B-05 | 初始化 `command_blocklist.json`，预置危险命令黑名单 |
| B-06 | 配置 CORS 中间件 |
| B-07 | 创建基础路由骨架，预留 API 模块占位 |
| B-08 | 配置 uvicorn 启动脚本（开发热重载） |

**前端**

| 编号 | 任务 |
|------|------|
| F-01 | 初始化 Vite + React 项目 |
| F-02 | 配置 Tailwind CSS / CSS Modules，暖色调主题变量 |
| F-03 | 搭建整体布局（左侧菜单 + 右侧内容区） |
| F-04 | 创建左侧菜单组件（聊天/Agent/模型/工具/技能/日志入口） |
| F-05 | 配置 react-router-dom 路由 |
| F-06 | 定义暖色调设计系统（色彩、圆角、阴影、间距） |
| F-07 | 封装 API 请求工具（baseURL 配置） |
| F-08 | 封装 SSE 流式请求工具 |

---

## 模块 2：模型管理

### 需求概述

用户可配置多个模型供应商（DeepSeek、阿里云百炼、自定义），通过 baseUrl + apiKey 连接，支持连接测试和上下文窗口配置。API 密钥存储在 OS 密钥链中，不落盘明文。

### 验收标准

- [ ] 可添加/编辑/删除模型配置
- [ ] 支持 DeepSeek 和阿里云百炼的 baseUrl + apiKey 配置
- [ ] 测试连接功能正常，返回成功/失败及延迟信息
- [ ] 上下文窗口大小可配置
- [ ] API 密钥存储在 OS 密钥链中，models.json 不含明文密钥
- [ ] 连接测试校验 OpenAI 接口兼容性
- [ ] `workspace/.gitignore` 正确忽略敏感目录

### 数据结构

```json
{
  "id": "uuid",
  "name": "DeepSeek V3",
  "provider": "deepseek",
  "base_url": "https://api.deepseek.com/v1",
  "api_key_ref": "keychain://deepseek-v3",
  "api_key_env": null,
  "context_window_tokens": 100000,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 获取模型列表 |
| POST | `/api/models` | 添加模型 |
| PUT | `/api/models/{id}` | 修改模型 |
| DELETE | `/api/models/{id}` | 删除模型 |
| POST | `/api/models/{id}/test` | 测试连接 |

### 关键行为

- 连接测试失败时显示具体错误（网络超时/认证失败/模型不存在），不阻塞保存
- 删除前需二次确认
- 密钥使用 keyring 存储到 OS 密钥链，`models.json` 仅存 `api_key_ref` 引用
- 连接测试校验 OpenAI 接口兼容性（`/v1/chat/completions` 格式）

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-09 | 实现模型 CRUD API（读写 `workspace/config/models.json`） |
| B-10 | 实现 keyring 密钥存储/读取逻辑 |
| B-11 | 实现连接测试 API（httpx 调用 `/v1/models` 或轻量 chat 请求） |
| B-12 | 模型数据校验（base_url 格式、context_window 正整数） |

**前端**

| 编号 | 任务 |
|------|------|
| F-09 | 模型列表页（卡片式展示名称、provider、上下文窗口） |
| F-10 | 模型新增/编辑表单（名称、provider、baseUrl、apiKey、context_window） |
| F-11 | 连接测试按钮 + 结果反馈（成功/失败 + 延迟） |
| F-12 | 删除二次确认弹窗 |

---

## 模块 3：工具管理

### 需求概述

系统内置三个工具（read_file / write_file / execute_command），不可增加、不可删除，仅支持启用/禁用。所有 Agent 默认可用禁用的工具。内置记忆工具和多 Agent 协作工具不在工具管理页面展示。安全限制与功能开发同步。

### 验收标准

- [ ] 三个内置工具（读文件/写文件/命令行）正确展示
- [ ] 不支持添加/删除，仅支持启用/禁用
- [ ] 禁用的工具在 Agent 中不可用
- [ ] 命令黑名单拦截危险命令（rm -rf, curl, wget, nc, ssh, scp, chmod 777, mkfs, dd if=/dev/zero 等）
- [ ] 命令执行 60s 超时自动终止
- [ ] 文件路径校验拒绝 `..` 路径穿越和符号链接逃逸
- [ ] write_file 限制 10MB 写入大小
- [ ] 子进程不继承敏感环境变量
- [ ] 命令输出截断为最大 100KB
- [ ] working_dir 必须在 workspace/ 目录内

### 内置工具定义

| 工具名称 | 功能 | 参数 |
|----------|------|------|
| `read_file` | 读取指定文件内容 | `path` |
| `write_file` | 写入/创建文件 | `path`, `content` |
| `execute_command` | 执行命令行 | `command`, `working_dir`（可选） |

### 安全限制（P0 必须实现）

**read_file / write_file 路径安全：**
- `pathlib.resolve()` 解析后检查路径是否在 `workspace/` 内
- 拒绝包含 `..` 的路径穿越
- 拒绝符号链接逃逸

**execute_command 安全：**
- 命令黑名单：维护在 `workspace/config/command_blocklist.json`，用户可自定义
- 执行超时：默认 60s，超时自动终止子进程
- 工作目录限制：`working_dir` 必须在 `workspace/` 内
- 输出大小限制：截断为最大 100KB
- 环境变量隔离：子进程不继承 API 密钥等敏感环境变量

**write_file 大小限制：**
- 单次写入限制 10MB

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tools` | 获取工具列表（含启用状态） |
| PUT | `/api/tools/{name}/toggle` | 启用/禁用工具 |

### 关键行为

- 禁用的工具不出现在任何 Agent 的可用工具列表中
- `save_memory` / `search_memory` / `delegate_task` 是系统内置工具，不在工具管理页面展示，不可禁用
- 命令被黑名单匹配或路径校验失败时，返回安全拦截错误给 Agent，不执行

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-13 | 实现工具列表 API（读取启用状态） |
| B-14 | 实现工具启用/禁用 API |
| B-15 | 实现 `read_file` 工具函数（含路径安全校验） |
| B-16 | 实现 `write_file` 工具函数（含路径校验 + 10MB 限制） |
| B-17 | 实现 `execute_command` 工具函数（含黑名单、超时、目录限制、输出截断、环境隔离） |
| B-18 | 实现路径安全校验工具函数（`pathlib.resolve()` + 前缀检查 + 符号链接检测） |

**前端**

| 编号 | 任务 |
|------|------|
| F-13 | 工具管理列表页（名称、描述、启用状态开关） |
| F-14 | 禁用添加/删除，仅展示三个内置工具 |

---

## 模块 4：Agent 管理

### 需求概述

用户可管理 Agent（主 Agent + 自定义 Agent），配置系统提示词、工具和技能。主 Agent 不可删除。每个 Agent 拥有独立的 `agent.md` 文件。详情编辑页分四个栏目。

### 验收标准

- [ ] Agent 列表仅显示名称和描述
- [ ] 主 Agent 不可删除
- [ ] 详情页四个栏目功能正常（基本信息/系统提示词/工具/技能）
- [ ] agent.md 可编辑保存
- [ ] 工具和技能可勾选/取消
- [ ] 删除按钮在详情页右上角
- [ ] 列表页无编辑按钮，点击进入详情编辑
- [ ] 模型和其他基本参数在详情页不可修改（仅名称和描述可改）

### 数据结构

```json
{
  "id": "uuid",
  "name": "主 Agent",
  "description": "默认主 Agent",
  "is_default": true,
  "model_id": "uuid-of-model",
  "tools": ["read_file", "write_file"],
  "skills": ["skill-uuid-1"],
  "agent_md_path": "workspace/config/agents/{agent_id}/agent.md",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### 四栏目配置

**栏目一：基本信息** — 名称、描述（可编辑）；模型和其他参数不可修改

**栏目二：系统提示词** — 展示并编辑 `agent.md` 文件内容，保存到 `workspace/config/agents/{agent_id}/agent.md`

**栏目三：工具配置** — 展示全部可用工具（名称 + 描述），带勾选框；内置记忆工具和 delegate_task 不展示

**栏目四：技能配置** — 展示全部已启用技能（名称 + 描述），带勾选框

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 获取 Agent 列表 |
| POST | `/api/agents` | 新增 Agent |
| GET | `/api/agents/{id}` | 获取 Agent 详情 |
| PUT | `/api/agents/{id}` | 修改 Agent |
| DELETE | `/api/agents/{id}` | 删除 Agent |
| GET | `/api/agents/{id}/agent-md` | 获取 agent.md 内容 |
| PUT | `/api/agents/{id}/agent-md` | 保存 agent.md 内容 |

### 关键行为

- 系统默认创建主 Agent（名称"主 Agent"），不可删除
- 新建 Agent 时自动创建 `workspace/config/agents/{agent_id}/agent.md`
- 列表页点击 Agent 名称进入详情编辑
- 删除按钮放在详情页右上角

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-19 | 实现 Agent CRUD API |
| B-20 | 实现 agent.md 读取/保存 API |
| B-21 | 初始化主 Agent（系统启动时确保存在） |
| B-22 | Agent 数据校验（名称非空、model_id 有效） |

**前端**

| 编号 | 任务 |
|------|------|
| F-15 | Agent 列表页（简洁卡片式，仅名称 + 描述） |
| F-16 | Agent 详情编辑页（四栏目 Tab 切换） |
| F-17 | 基本信息栏目（名称、描述编辑） |
| F-18 | 系统提示词栏目（agent.md 编辑器 + 保存） |
| F-19 | 工具配置栏目（勾选列表） |
| F-20 | 技能配置栏目（勾选列表） |
| F-21 | 删除按钮（详情页右上角 + 二次确认） |

---

## 模块 5：聊天交互

### 需求概述

用户通过聊天界面与 Agent 交互，支持会话管理、SSE 流式输出、文件上传、工具/技能执行过程实时展示、输出文件面板、Markdown 渲染。聊天页面分左侧历史会话列表 + 右侧聊天交互区域。

### 验收标准

- [ ] 会话新建/切换/历史列表正常
- [ ] 会话删除（二次确认 + 删除 JSONL 和 outputs）
- [ ] 会话重命名功能正常
- [ ] 会话搜索过滤功能正常
- [ ] 文件上传（文本/代码文件，5MB 限制）正常
- [ ] Agent 选择切换正常
- [ ] 切换 Agent 时上下文窗口不匹配自动压缩
- [ ] 消息气泡样式正确（用户右 / Agent 左）
- [ ] 流式输出正常
- [ ] SSE 心跳 15s 正常
- [ ] SSE 断连后重连恢复会话状态
- [ ] Markdown 渲染正确
- [ ] 思考状态动画正常
- [ ] 工具/技能执行过程实时展示
- [ ] 输出文件面板正常
- [ ] 历史会话完整还原
- [ ] 消息顺序正确

### 布局结构

- **左侧**：历史会话列表面板
- **右侧**：聊天交互区域

### 会话管理

- 新建会话：自动生成 UUID，左侧列表顶部显示，自动选中
- 切换会话：从 `workspace/conversations/{会话ID}/{会话ID}.jsonl` 读取全部记录，完整还原
- 历史列表：显示标题（默认创建时间，可由第一条用户消息更新）+ 最后更新时间
- 操作菜单：右键或按钮 → 重命名、删除
- 删除：二次确认后删除 JSONL 文件及 `outputs/` 目录
- 搜索：实时过滤标题或内容匹配的会话

### 聊天交互

- 右侧顶部：Agent 下拉选择框，默认选中第一个 Agent
- 切换 Agent 时若新模型上下文窗口 < 当前会话上下文，自动触发压缩并提示
- 文件上传：文本/代码文件，内容作为上下文附加到用户消息，单次 5MB 限制
- 消息气泡：用户靠右，Agent 靠左
- 流式输出：SSE 逐字输出
- SSE 心跳：服务端每 15s 发送 `: heartbeat` 注释行
- SSE 断连：保留已写入 JSONL 的记录，重连后恢复；未完成轮次不自动恢复
- Markdown 渲染：标题、列表、代码块、表格等
- 输入框：文本输入框 + 发送按钮，不支持回车发送
- 思考中状态：发送按钮禁用，显示"正在思考..."动画

### 工具/技能执行过程展示

- Agent 发起调用时，实时显示系统消息卡片（名称 + 传入参数）
- 执行完成后在消息下方显示返回结果
- 内容较多时支持折叠/展开
- 按时间顺序正确排列

### 输出文件面板

- 存在文件时在右侧边栏展示列表（文件名、大小、修改时间）
- 支持下载和预览（文本类可直接预览）
- Agent 新增文件时自动刷新
- 空时显示"暂无输出文件"

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/conversations` | 获取会话列表 |
| POST | `/api/conversations` | 创建会话 |
| GET | `/api/conversations/{id}` | 获取会话详情（JSONL 解析） |
| PUT | `/api/conversations/{id}` | 重命名会话 |
| DELETE | `/api/conversations/{id}` | 删除会话（含 JSONL 和 outputs） |
| GET | `/api/conversations/search` | 搜索会话 |
| POST | `/api/chat/send` | 发送消息（SSE 流式返回） |
| POST | `/api/chat/upload` | 上传文件（5MB 限制） |
| GET | `/api/conversations/{id}/outputs` | 获取输出文件列表 |
| GET | `/api/conversations/{id}/outputs/{filename}` | 下载/预览输出文件 |

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-23 | 实现会话 CRUD API |
| B-24 | 实现会话搜索 API |
| B-25 | 实现文件上传 API（5MB 限制） |
| B-26 | 实现输出文件列表/下载 API |
| B-27 | 实现 SSE 发送消息端点（流式 + 心跳 15s） |
| B-28 | 实现 SSE 断连检测与 Agent Loop 终止 |

**前端**

| 编号 | 任务 |
|------|------|
| F-22 | 历史会话列表面板（标题、更新时间） |
| F-23 | 新建/切换/删除/重命名会话交互 |
| F-24 | 会话搜索框 |
| F-25 | Agent 下拉选择器 |
| F-26 | 聊天消息区（气泡样式 + Markdown 渲染） |
| F-27 | SSE 流式接收 + 逐字输出 |
| F-28 | 思考中动画状态 |
| F-29 | 工具/技能执行过程消息卡片（折叠/展开） |
| F-30 | 文件上传组件 |
| F-31 | 输出文件面板（列表 + 下载/预览） |
| F-32 | 发送按钮禁用逻辑（思考中不可发送） |

---

## 模块 6：Agent 执行引擎（Agent Loop）

### 需求概述

核心执行引擎，处理用户消息 → 组装系统提示词 → 调用模型 → 工具/技能循环 → 流式输出 → JSONL 持久化。最大 50 轮循环，超限降级保存中间结果。安全加固与功能开发同步。

### 验收标准

- [ ] 工具调用循环正常（最大 50 轮）
- [ ] 达到 50 轮上限时保存中间结果到 `outputs/` 并生成进度摘要
- [ ] 技能调用正常
- [ ] 工具/技能通过 `type` 字段区分（tool/skill）
- [ ] 工具执行失败时错误信息返回给模型
- [ ] 中间轮次模型文本作为"思考过程"流式展示
- [ ] 系统提示词动态组装正确
- [ ] 会话 JSONL 完整记录
- [ ] JSONL 原子写入（临时文件 + rename）
- [ ] 并发写入使用 filelock 串行化

### 请求构造

发送消息时构造请求，包含：
- 当前 Agent 的系统提示词（`agent.md` 内容）
- 当前 Agent 的工具列表（名称、描述、参数 schema）
- 当前 Agent 的技能列表（名称、功能、触发条件、输入输出格式、调用方式）
- 会话上下文（考虑压缩后的上下文）
- 长期记忆内容（自动注入系统提示词）
- Memory 使用规则提示词
- 文件写入路径说明（自动拼接 outputs 目录绝对路径）

### 模型响应处理

- **无工具调用** → 文本内容直接流式输出 → 写入 JSONL
- **有工具调用** → 解析请求类型（tool/skill）→ 执行 → 结果追加到对话 → 再次调用模型 → 循环直到无工具调用或达到 50 轮

### 循环限制与降级

- 最大 50 轮，超过后强制终止
- 保存已完成中间结果到 `outputs/`
- 生成进度摘要（已完成步骤、未完成步骤）
- 聊天界面提示"已达到最大循环次数，部分结果已保存"
- 工具和技能统一使用 `tool_calls` 结构，`type` 字段区分 `tool` / `skill`
- 工具/技能执行失败时，错误信息作为工具返回结果追加到对话，由模型决策（系统不自动重试）
- 中间轮次模型返回的文本作为"思考过程"流式展示（可折叠，标注"Agent 思考中..."）

### 会话持久化

- 存储路径：`workspace/conversations/{会话ID}/{会话ID}.jsonl`，每行一个交互事件
- 原子写入：先写 `{会话ID}.jsonl.tmp`，再 `os.rename` 原子替换
- 并发控制：`filelock` 确保同一会话串行写入，不同会话可并行
- 事件触发：任何交互事件（用户消息/模型回复/工具调用/技能调用/文件写入）立即追加
- JSONL 事件字段：`role`、`type`、`timestamp`、`data`、`reasoning`、`tool_call_id`

### 核心数据流

```
用户发送消息
    ↓
读取 Agent 配置（agent.md + tools + skills）
    ↓
读取长期记忆（memory.md）
    ↓
组装系统提示词（agent.md + 长期记忆 + Memory规则 + 文件路径说明）
    ↓
构建上下文（压缩摘要 + 最近原始消息）
    ↓
发送请求给模型（baseUrl + apiKey）
    ↓
模型返回响应
    ↓
┌─ 无工具调用 → SSE 流式输出 → 写入 JSONL
└─ 有工具调用 → 执行工具/技能 → 结果写入 JSONL
                     ↓
               再次调用模型（循环直到无工具调用或达到 50 轮）
                     ↓
               SSE 流式输出最终回复 → 写入 JSONL
```

### 异常处理

| 场景 | 处理方式 |
|------|----------|
| 模型 API 不可用 | 前端显示错误信息，不阻塞 UI |
| 模型返回格式异常 | 解析失败时降级为纯文本输出 |
| 工具执行超时（>60s） | 自动终止并返回超时信息 |
| Agent Loop 达到 50 轮上限 | 保存中间结果到 outputs/，生成进度摘要 |
| SSE 连接中断 | 保留已写入 JSONL 的记录，重连后恢复 |
| 并发会话写入冲突 | filelock 文件锁确保串行写入 |
| JSONL 文件损坏 | 跳过损坏行，记录警告日志 |

### 任务拆解

**后端**

| 编号 | 任务 |
|------|------|
| B-29 | 实现系统提示词动态组装（agent.md + 长期记忆 + Memory 规则 + 路径说明） |
| B-30 | 实现工具定义 schema 生成（tool_calls 格式，type 区分 tool/skill） |
| B-31 | 实现 Agent Loop 主循环（max 50 轮） |
| B-32 | 实现 50 轮上限降级（保存 outputs/ + 进度摘要） |
| B-33 | 实现工具执行分发（tool / skill 类型路由） |
| B-34 | 实现中间轮次"思考过程"流式输出 |
| B-35 | 实现最终回复流式输出 |
| B-36 | 实现 JSONL 原子写入（临时文件 + rename） |
| B-37 | 实现文件锁并发控制（filelock） |
| B-38 | 实现工具执行失败错误处理（返回给模型） |
| B-39 | 实现长期记忆自动注入 |

**前端**

| 编号 | 任务 |
|------|------|
| F-33 | SSE 流式解析与渲染（最终回复 + 思考过程区分） |
| F-34 | 思考过程可折叠展示（标注"Agent 思考中..."） |
| F-35 | 50 轮上限提示 UI |
| F-36 | 工具/技能调用消息按时间顺序排列 |

---

## 边界场景与异常处理（P0 涉及）

| 场景 | 处理方式 |
|------|----------|
| 模型 API 不可用 | 前端显示错误信息，不阻塞 UI |
| 模型返回格式异常 | 解析失败时降级为纯文本输出 |
| 工具执行超时（>60s） | 自动终止并返回超时信息 |
| 命令行执行危险命令 | 黑名单拦截 + 返回安全拦截错误给 Agent |
| 文件路径越界（含 `..` 和符号链接） | `pathlib.resolve()` 校验 + 前缀检查，拒绝越界路径 |
| API 密钥泄露风险 | 密钥存储在 OS 密钥链，`.gitignore` 忽略敏感目录 |
| SSE 连接中断 | 保留已写入 JSONL 的记录，客户端重连后恢复 |
| Agent Loop 达到 50 轮上限 | 保存中间结果到 outputs/，生成进度摘要并提示用户 |
| 并发会话写入冲突 | filelock 文件锁确保同一会话串行写入 |
| 会话 JSONL 文件损坏 | 跳过损坏行，记录警告日志 |
| 记忆文件不存在 | 自动创建，按空内容处理 |
| 模型上下文窗口不匹配 | 切换 Agent 时自动触发上下文压缩适配 |

---

## 开发顺序与依赖

```
模块1 项目基础设施
    ├──→ 模块2 模型管理
    ├──→ 模块3 工具管理
    │        ├──→ 模块4 Agent 管理（依赖 2+3）
    │        │        ├──→ 模块5 聊天交互（依赖 4）
    │        │        │        ├──→ 模块6 Agent Loop（依赖 5）
    │        │        │        │
    └────────────────────────────────────→ 安全加固（贯穿全部模块）
```

> **提醒**: P0 安全加固与功能开发同步进行，不可延后。测试同学可基于验收标准编写测试用例。
