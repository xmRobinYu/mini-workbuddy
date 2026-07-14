# AGENTS.md

该文件用于在 AI 编码代理（Codex / Claude Code / Ralph）处理此仓库中的代码时提供指导。

---

## 项目概览

Mini-WorkBuddy 是一个**轻量级 AI 办公智能体工作台**（Web 版），灵感来源于腾讯 WorkBuddy。用户通过自然语言驱动 AI Agent 自主完成任务——从规划到执行再到交付结果，全程自动化。定位为**开源 MIT、轻量、可自部署**，聚焦个人开发者和小团队的核心办公场景。

P0 范围覆盖 6 核心模块：项目基础设施 → 模型管理 → 工具管理 → Agent 管理 → 聊天交互 → Agent Loop。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| FastAPI + uvicorn | 后端 Web 框架（异步、SSE 流式、自动 API 文档） |
| uv | Python 包管理 |
| httpx | LLM API 客户端（OpenAI 兼容） |
| Pydantic v2 | 数据校验与序列化 |
| tiktoken | Token 计数（cl100k_base 分词器） |
| filelock | 文件锁（并发写入串行化） |
| keyring | OS 密钥链（API 密钥安全存储） |
| aiofiles | 异步文件操作 |
| JSON / JSONL / Markdown | 数据存储（无数据库） |
| React 18 + TypeScript | 前端框架（函数组件 + Hooks） |
| Vite | 前端构建工具 |
| Tailwind CSS | 暖色调极简样式 |
| react-markdown + remark-gfm | Markdown 渲染 |
| react-syntax-highlighter | 代码块高亮 |
| Lucide React | 图标库 |
| pytest + pytest-asyncio | 后端测试 |
| mypy | 后端类型检查 |
| ESLint + tsc | 前端 lint 与类型检查 |

---

## 命令

```bash
# ── 后端 ──
cd backend
uv run uvicorn app.main:app --reload --port 8000   # 开发启动
uv run pytest                                         # 运行测试
uv run mypy app                                       # 类型检查

# ── 前端 ──
cd frontend
npm run dev          # 开发启动（localhost:5173）
npm run build        # 构建（tsc -b && vite build）
npm run typecheck    # 类型检查（tsc -b --noEmit）
npm run lint         # ESLint 检查

# ── Ralph 自主 Agent ──
cd scripts/ralph
python3 ralph.py codex                    # 启动 Ralph（默认 codex agent）
python3 ralph.py codex --detach           # 后台模式
python3 ralph.py codex --story-id US-001  # 只处理指定 story
python3 ralph.py --status                 # 查看运行状态
python3 ralph.py --stop                   # 停止 Ralph
python3 -m pytest test_prd_tool.py -v     # 运行 prd_tool 测试

# ── PRD 工具 ──
cd scripts/ralph
python3 prd_tool.py get-work-package US-001           # 获取 story 工作包
python3 prd_tool.py get-story US-001                  # 获取单个 story
python3 prd_tool.py update-story US-001 --set passes=true  # 更新 story 状态
```

---

## 项目结构

```
mini-workbuddy/
├── AGENTS.md              # 本文件 — 全局开发规则
├── prd.json               # Ralph 格式 PRD（根目录副本）
├── .gitignore
├── .agents/               # Agent 技能与命令定义
│   ├── AGENTS-template.md
│   ├── commands/          # Slash 命令定义
│   ├── plans/             # 已有计划文档
│   └── skills/            # 技能定义（prd / ralph / agent-browser）
├── backend/               # FastAPI 后端
│   ├── app/
│   │   ├── main.py        # 应用入口（create_app 工厂）
│   │   ├── api/           # API 路由层
│   │   │   ├── router.py  # 聚合路由
│   │   │   └── models.py  # 模型管理 CRUD 端点
│   │   ├── core/          # 核心配置
│   │   │   ├── config.py  # 路径常量、CORS 配置
│   │   │   └── workspace.py  # workspace 目录自初始化
│   │   ├── schemas/       # Pydantic 模型（请求/响应校验）
│   │   └── services/      # 业务逻辑层
│   │       ├── models_store.py    # models.json 文件读写（filelock）
│   │       └── keyring_service.py # OS 密钥链操作
│   ├── tests/             # pytest 测试
│   ├── pyproject.toml     # 依赖与工具配置
│   └── uv.lock
├── frontend/              # React + Vite 前端
│   ├── src/
│   │   ├── App.tsx        # 路由配置
│   │   ├── main.tsx       # 入口
│   │   ├── components/    # 通用组件（Layout 等）
│   │   ├── pages/         # 页面组件（Chat/Agents/Models/Tools/Skills/Logs）
│   │   ├── lib/api.ts     # API 请求工具封装
│   │   └── index.css      # 全局样式
│   ├── vite.config.ts     # Vite 配置（代理 /api → localhost:8000）
│   ├── tailwind.config.js # 暖色调主题
│   ├── tsconfig.json
│   └── package.json
├── scripts/ralph/         # Ralph 自主 Agent 系统
│   ├── ralph.py           # 主循环执行器
│   ├── prd_tool.py        # PRD 查询与状态更新工具
│   ├── state_store.py     # SQLite 状态存储
│   ├── config.py          # 路径解析
│   ├── dashboard.py       # 监控面板
│   ├── CLAUDE.md          # Developer Agent 指令
│   ├── VALIDATOR.md       # Validator Agent 指令
│   ├── prd.json           # Ralph PRD（23 个 user stories）
│   └── progress.txt       # 进度日志
├── docs/
│   ├── prd/               # 原始 PRD 文档
│   └── plan/              # 开发计划
└── workspace/             # 运行时数据目录（gitignore，不自初始化时由后端创建）
    ├── config/
    │   ├── models.json          # 模型配置（不含明文密钥）
    │   ├── command_blocklist.json
    │   ├── agents/              # Agent 配置目录
    │   └── skills/              # Skills 目录
    ├── conversations/           # 会话 JSONL 文件
    └── memory/                  # 记忆文件
        └── archive/
```

---

## 架构

### 分层结构

后端采用经典三层分离：

```
API 路由层 (app/api/)     →  接收 HTTP 请求，参数校验，返回响应
    ↓
业务逻辑层 (app/services/)  →  文件读写、密钥操作、工具执行
    ↓
数据存储层 (workspace/)     →  JSON / JSONL / Markdown 文件（无数据库）
```

### 前端数据流

```
React 组件 → lib/api.ts (fetch 封装) → Vite proxy /api → FastAPI 后端
```

- 开发环境通过 Vite proxy 代理 `/api` 到 `localhost:8000`，避免 CORS
- 后端同时配置 CORS 白名单（`localhost:5173`）作为双保险
- 前端 API 封装位于 `frontend/src/lib/api.ts`，统一 baseURL 为 `/api`

### Ralph 自主执行流程

```
ralph.py 主循环
    ↓
读取 prd.json → 选择最高优先级未完成 story
    ↓
调用 codex exec --dangerously-bypass-approvals-and-sandbox（传入 CLAUDE.md 指令）
    ↓
Codex 实例开发 story → 提交代码 → 追加 progress.txt
    ↓
调用 Codex 实例（传入 VALIDATOR.md 指令）→ 验证验收标准
    ↓
prd_tool.py 更新 story 状态（passes/blocked/notes/retryCount）
    ↓
循环直到所有 story 完成
```

### 密钥安全架构

- API 密钥通过 `keyring` 存储到 OS 密钥链（macOS Keychain / Windows Credential Manager / Linux secret-service）
- `models.json` 仅存储 `keychain://<id>` 引用，**永不落盘明文**
- keychain 不可用时降级为 `api_key_env`（环境变量名引用）
- `workspace/.gitignore` 忽略 `config/models.json` 等敏感文件

---

## 代码模式

### 命名约定

- **后端**：Python 模块用 `snake_case`；Pydantic 模型用 `PascalCase`（如 `ModelCreate`、`ModelRead`）；函数用 `snake_case`；常量用 `UPPER_SNAKE_CASE`
- **前端**：React 组件文件用 `PascalCase.tsx`（如 `ModelsPage.tsx`）；工具函数用 `camelCase`；CSS 类名使用 Tailwind 暖色调自定义类（`warm-*` 前缀）
- **API 路径**：RESTful 风格，统一 `/api` 前缀，资源名复数（`/api/models`、`/api/agents`）
- **文件命名**：kebab-case 用于文档（`p0-plan.md`），PascalCase 用于前端组件，snake_case 用于 Python 模块

### 文件组织

- 后端按功能模块组织：每个功能模块在 `api/`、`schemas/`、`services/` 各有一层
- 新增功能模块时三处同步添加：`api/<feature>.py`（路由）+ `schemas/<feature>.py`（校验）+ `services/<feature>_store.py`（存储）
- 路由在 `api/router.py` 中聚合注册
- 前端每个页面一个文件，放在 `pages/` 下；通用组件放 `components/`

### 错误处理

- 后端使用 FastAPI `HTTPException`，返回中文错误信息（如 `"模型不存在"`）
- 前端 `api.ts` 捕获非 2xx 响应，抛出含状态码和响应体的 `Error`
- 文件操作使用 `filelock` 串行化，防止并发损坏
- JSONL 写入使用原子操作（临时文件 + rename）
- 工具执行失败时错误信息返回给模型，由 Agent 自主决策（系统不自动重试）

### 安全模式（P0 必须遵守）

- **路径安全**：所有文件操作工具使用 `pathlib.resolve()` 校验路径在 `workspace/` 内，拒绝 `..` 穿越和符号链接逃逸
- **命令执行**：黑名单拦截（`command_blocklist.json`）+ 60s 超时 + 工作目录限制 + 输出截断 100KB + 环境变量隔离
- **ZIP 导入**：Zip Slip 校验 + 文件大小限制（50MB / 解压 200MB）
- **密钥存储**：永不落盘明文，使用 keyring 或 env 引用

---

## 测试

- **后端测试**：`cd backend && uv run pytest`
  - 测试位置：`backend/tests/`
  - 使用 `TestClient`（同步）测试 API 端点
  - keyring 测试使用内存 backend（`_MemoryKeyring`），不依赖真实密钥链
  - 文件存储测试使用 `reset_for_test()` 重置状态
  - `asyncio_mode = "auto"`，异步测试无需 `@pytest.mark.asyncio`

- **Ralph 测试**：`cd scripts/ralph && python3 -m pytest test_prd_tool.py -v`
  - 测试 `prd_tool.py` 的字段白名单、scope 校验、workflowMode 验证、CLI 接口

- **前端验证**：UI 变更使用 agent-browser 进行浏览器验证
  - 启动 dev server：`cd frontend && npm run dev`
  - 确保后端同时运行：`cd backend && uv run uvicorn app.main:app --reload`

---

## 验证

提交前需要执行的命令：

```bash
# 后端
cd backend && uv run pytest && uv run mypy app

# 前端
cd frontend && npm run typecheck && npm run lint

# Ralph
cd scripts/ralph && python3 -m pytest test_prd_tool.py
```

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `backend/app/main.py` | FastAPI 应用入口，`create_app()` 工厂函数 |
| `backend/app/core/config.py` | 所有路径常量（PROJECT_ROOT → WORKSPACE_DIR → 子目录）和 CORS 配置 |
| `backend/app/core/workspace.py` | workspace 目录自初始化逻辑 |
| `backend/app/api/router.py` | API 路由聚合，新增模块在此注册 |
| `backend/app/api/models.py` | 模型管理 CRUD API（模型管理模块参考实现） |
| `backend/app/schemas/model.py` | Pydantic 校验模型（Create/Update/Read 三件套模式） |
| `backend/app/services/models_store.py` | JSON 文件存储 + filelock 并发控制（存储层参考实现） |
| `backend/app/services/keyring_service.py` | OS 密钥链操作 |
| `frontend/src/lib/api.ts` | 前端 API 请求封装（所有页面复用） |
| `frontend/src/components/Layout.tsx` | 左侧菜单 + 右侧内容区布局 |
| `frontend/tailwind.config.js` | 暖色调主题定义（`warm-*` 色系） |
| `frontend/vite.config.ts` | Vite 配置（路径别名 `@/` + 后端代理） |
| `scripts/ralph/ralph.py` | Ralph 主循环执行器 |
| `scripts/ralph/prd_tool.py` | PRD 查询与 story 状态更新工具 |
| `scripts/ralph/CLAUDE.md` | Developer Agent 指令（Ralph 每次迭代传入） |
| `scripts/ralph/VALIDATOR.md` | Validator Agent 指令 |
| `scripts/ralph/prd.json` | Ralph PRD（23 个 P0 user stories） |
| `docs/prd/mini-workbuddy-PRD.md` | 原始产品需求文档 |
| `docs/plan/p0-plan.md` | P0 开发计划（6 模块任务拆解） |

---

## 按需上下文

| 主题 | 文件 |
|------|------|
| 完整 PRD（功能需求、验收标准、数据结构、API 路由） | `docs/prd/mini-workbuddy-PRD.md` |
| P0 开发计划（模块拆解、任务列表、依赖关系） | `docs/plan/p0-plan.md` |
| Ralph PRD 格式规范与转换规则 | `.agents/skills/ralph/SKILL.md` |
| PRD 生成技能 | `.agents/skills/prd/SKILL.md` |
| Ralph Developer Agent 指令 | `scripts/ralph/CLAUDE.md` |
| Ralph Validator Agent 指令 | `scripts/ralph/VALIDATOR.md` |

---

## 备注

- **安全加固与功能开发同步进行，不可延后**：P0 的所有安全限制（路径校验、命令黑名单、密钥链存储等）必须与功能同步实现
- **所有 UI 文字为简体中文**：前端所有可见文字必须使用简体中文
- **暖色调极简设计语言**：主背景白、菜单浅灰、强调色暖橙（#EA580C）/琥珀（#F59E0B），统一圆角 6px、阴影 `warm`
- **无数据库**：所有数据存储为 JSON / JSONL / Markdown 文件，位于 `workspace/` 目录
- **workspace/ 不提交 git**：运行时数据目录，由后端 `ensure_workspace()` 自初始化
- **Ralph 禁止手工编辑 prd.json / prd.runtime.json / ralph_state.db**：必须通过 `prd_tool.py` CLI 或 Python API 更新
- **Ralph 每次迭代只处理一个 story**：Codex 实例无跨迭代记忆，story 必须小到一次 context window 内完成
- **Git commit 消息格式**：`feat: [Story ID] - [Story Title]`（Ralph 开发时）或 `fix: <描述>` / `feat: <描述>`（手动开发时）
- **前端路径别名**：`@/` 映射到 `src/`，在 `vite.config.ts` 和 `tsconfig.app.json` 中同步配置
- **后端 Python 版本**：>=3.11，mypy 检查 `python_version = "3.11"`
