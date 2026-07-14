# Mini-WorkBuddy 产品需求文档 (PRD)

> **版本**: v1.1 MVP（P0 聚焦 6 核心模块，P1 扩展记忆/压缩/协作/日志）  
> **目标用户**: 个人开发者 + 小团队  
> **开源策略**: 完全开源 MIT  
> **平台**: Web 版（桌面端优先适配）  
> **文档状态**: 需求规划阶段（已完成深度评审，安全方案强化）

---

## 一、产品背景与目标

### 1.1 产品定位

Mini-WorkBuddy 是一个**轻量级 AI 办公智能体工作台**（Web 版），灵感来源于腾讯 WorkBuddy。它让用户通过自然语言驱动 AI Agent 自主完成任务——从规划到执行再到交付结果，全程自动化。

与腾讯 WorkBuddy（闭源商业产品，月访问量 885 万，140+ 专家 Agent）不同，Mini-WorkBuddy 定位为**开源、轻量、可自部署**，聚焦个人开发者和小团队的核心办公场景。

### 1.2 核心差异化

| 对比维度 | 腾讯 WorkBuddy | Mini-WorkBuddy |
|----------|---------------|----------------|
| 部署方式 | 闭源 SaaS + 桌面客户端 | 开源 MIT，可自部署 |
| 模型策略 | 内置 11 款模型 + Auto 路由 | 用户自定义 baseUrl + apiKey |
| 技能生态 | SkillHub 7万+ 技能 | 自定义 Skills，ZIP 导入 |
| 目标用户 | 企业全员（含非技术人员） | 个人开发者 + 小团队 |
| Agent 能力 | 140+ 预置专家 Agent | 用户自定义 Agent（主 Agent + 子 Agent） |
| 连接器 | 30+ 内置（腾讯文档/TAPD 等） | P0 暂不支持，P1 规划飞书连接器 |
| 多模态 | 支持图片/文档/PPT/视频 | MVP 支持文本文件上传，图片/文档暂不支持 |

### 1.3 业务目标

- 提供一个**开箱即用**的 AI Agent 工作台，降低个人开发者使用 AI Agent 的门槛
- 通过**可自定义的 Agent + Skills + 工具**体系，让用户构建自己的 AI 工作流
- 支持**多模型供应商**（DeepSeek、阿里云百炼等），不锁定单一模型
- 具备**记忆系统**和**上下文压缩**，支持长周期复杂任务

---

## 二、用户故事

| 编号 | 角色 | 需求 | 目的 |
|------|------|------|------|
| US-01 | 个人开发者 | 配置自己的模型（DeepSeek/百炼），管理多个模型 | 灵活切换不同模型处理不同任务 |
| US-02 | 个人开发者 | 管理 Agent（主 Agent + 自定义 Agent），配置不同的系统提示词、工具和技能 | 为不同场景创建专门的 AI 助手 |
| US-03 | 小团队用户 | 通过聊天界面与 Agent 交互，Agent 能调用工具和技能完成任务 | 用自然语言驱动 AI 完成实际工作 |
| US-04 | 个人开发者 | 管理 Skills（技能），支持新增/修改/ZIP导入/扫描发现 | 扩展 Agent 的能力边界 |
| US-05 | 个人开发者 | 查看历史会话，完整还原对话和工具/技能执行过程 | 追溯和复盘 Agent 的工作过程 |
| US-06 | 个人开发者 | ��看执行日志和模型调用日志 | 调试 Agent 行为，排查问题 |
| US-07 | 个人开发者 | Agent 自动记住重要信息（长期记忆 + 短期记忆） | 跨会话保持上下文，避免重复沟通 |
| US-08 | 个人开发者 | 长对话自动压缩上下文，避免超出模型窗口限制 | 支持超长复杂任务的持续执行 |

---

## 三、功能全景

### 3.1 功能模块总览

```
Mini-WorkBuddy
├── 1. 项目基础设施
│   ├── 前后端项目脚手架
│   ├── 暖色调极简 UI 布局
│   └── workspace 数据目录
├── 2. 模型管理
│   ├── 模型 CRUD
│   ├── 多供应商支持（baseUrl + apiKey）
│   ├── 连接测试
│   └── 上下文窗口配置
├── 3. 工具管理
│   ├── 三个内置工具（读文件/写文件/命令行）
│   ├── 启用/禁用（不可增删）
│   └── 所有 Agent 默认可用
├── 4. Skills 管理
│   ├── Skills 列表 + 启用/停用
│   ├── 新增/修改/详情（层级目录展示）
│   ├── ZIP 导入 + 扫描发现
│   └── SKILL.md 文件编辑保存
├── 5. Agent 管理
│   ├── Agent CRUD（主 Agent 不可删除）
│   ├── 四栏目配置（基本信息/系统提示词/工具/Skills）
│   └── 列表页 + 详情编辑页
├── 6. 聊天交互
│   ├── 会话管理（新建/切换/历史列表/删除/重命名/搜索）
│   ├── Agent 选择 + 流式输出
│   ├── SSE 心跳与断线重连
│   ├── 文件上传（文本/代码文件）
│   ├── 工具/技能执行过程实时展示
│   ├── 输出文件面板
│   └── Markdown 渲染
├── 7. Agent 执行引擎（Agent Loop）
│   ├── 工具调用循环（最大 50 轮）
│   ├── 中间结果流式展示
│   ├── 工具失败由 Agent 决策
│   ├── 50 轮上限降级策略
│   ├── 技能调用支持
│   ├── 系统提示词动态组装
│   └── 会话 JSONL 持久化（原子写入 + 文件锁）
├── 8. 记忆系统
│   ├── 长期记忆（memory.md）
│   ├── 长期记忆上限管理（50KB + 摘要压缩）
│   ├── 短期记忆（memory/YYYY-MM-DD.md）
│   ├── 短期记忆 7 天归档
│   ├── save_memory / search_memory 内置工具
│   └── 自动注入系统提示词
├── 9. 上下文压缩
│   ├── 自动检测（75% 阈值，tiktoken 计数）
│   ├── 压缩摘要生成
│   ├── 压缩摘要质量自检
│   ├── 保留最近 10% 原始消息
│   └── 多次压缩支持
├── 10. 多 Agent 协作
│   ├── 编排者模式（主 Agent → 子 Agent）
│   ├── delegate_task 内置工具
│   ├── 权限校验
│   ├── 递归深度限制（max=1）
│   ├── 子 Agent 并行执行
│   └── 可折叠展示
├── 11. 日志系统
│   ├── 执行日志（结构化展示）
│   ├── 模型调用日志（输入/输出）
│   └── 筛选 + 刷新
└── 12. 界面美化
    ├── 暖色调极简风格
    └── 各页面 UI 优化
```

### 3.2 功能优先级矩阵

| 模块 | P0（MVP 核心） | P1（扩展） | P2（远期） |
|------|:--:|:--:|:--:|
| 项目基础设施 | ✅ | - | - |
| 模型管理 | ✅ | - | - |
| 工具管理 | ✅ | - | - |
| Skills 管理 | ✅ | - | - |
| Agent 管理 | ✅ | - | - |
| 聊天交互 | ✅ | - | - |
| Agent 执行引擎 | ✅ | - | - |
| 记忆系统 | 基础版（长期/短期记忆 + save/search） | 增强版（上限管理 + 摘要压缩 + 质量校验） | 向量检索 |
| 上下文压缩 | ✅ | - | - |
| 多 Agent 协作 | - | ✅ | - |
| 日志系统 | - | ✅ | - |
| 界面美化 | ✅ | - | - |
| 安全加固 | ✅（密钥保护 + 命令沙箱 + 路径校验） | ✅（Bearer Token 认证） | - |
| 飞书连接器 | - | - | ✅ |
| Docker 容器隔离 | - | - | ✅ |
| 多用户支持 | - | - | ✅ |

---

## 四、非功能性需求

### NA-1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首字响应时间 | < 3 秒 | 从用户发送消息到 SSE 首字输出的时间 |
| 工具执行超时 | 60 秒 | 单次工具/命令执行的最大时长 |
| Agent Loop 轮次上限 | 50 轮 | 防止无限循环 |
| 单会话最大消息数 | 1000 条 | 超过后提示用户新建会话 |
| JSONL 文件最大尺寸 | 50MB | 超过后提示归档或新建会话 |
| 并发会话数 | 10 | 单实例支持的最大并发活跃会话 |

### NA-2 可用性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| SSE 心跳间隔 | 15 秒 | 保持连接活跃 |
| 会话恢复 | JSONL 重放 | 连接断开后从 JSONL 恢复会话状态 |
| 错误恢复 | 工具失败不阻断 | 工具失败返回错误给模型，由 Agent 决策 |
| 数据持久化 | 即时写入 | 每个交互事件即时写入 JSONL |

### NA-3 安全性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| API 密钥存储 | 操作系统密钥链 | 不明文存储在文件中 |
| 命令执行 | 黑名单 + 超时 + 目录限制 | 多层防护 |
| 文件路径 | workspace 目录内 | 防止路径穿越 |
| ZIP 导入 | Zip Slip 校验 + 大小限制 | 防止解压攻击 |
| 认证（P1） | Bearer Token | P0 单用户无认证，P1 增加认证 |

### NA-4 可维护性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 代码规范 | Python: PEP 8, 前端: ESLint + Prettier | 统一代码风格 |
| 日志级别 | DEBUG/INFO/WARNING/ERROR | 后端结构化日志 |
| 配置管理 | JSON 文件 + 环境变量 | 敏感配置走环境变量 |
| 文档 | API 自动生成（FastAPI /docs） | OpenAPI 文档 |

---

## 五、详细需求描述（EARS 原则）

### 4.1 项目基础设施

#### 4.1.1 项目结构

> **[Ubiquitous]** 系统应包含三个顶层目录：`frontend/`（React + Vite 前端）、`backend/`（Python + FastAPI 后端）、`workspace/`（系统配置与工作数据）。

> **[Ubiquitous]** 后端应使用 `uv` 管理 Python 包依赖。

> **[Ubiquitous]** 所有界面文字应使用简体中文。

#### 4.1.2 UI 布局

> **[Ubiquitous]** 系统应采用左侧固定宽度垂直菜单栏 + 右侧自适应内容区域的布局。

> **[Ubiquitous]** 系统配色应采用暖色调极简风格：主背景白色，菜单背景浅灰色，强调色使用暖色系（如琥珀/暖橙）。

> **[Event-driven]** When 用户点击左侧菜单项，then 右侧主内容区应切换为对应页面。

---

### 4.2 模型管理

#### 4.2.1 模型 CRUD

> **[Event-driven]** When 用户进入模型管理页面，the system shall 展示所有已配置的模型列表（名称、供应商、baseUrl、状态）。

> **[Event-driven]** When 用户点击"添加模型"，the system shall 展示表单，包含字段：名称、供应商（下拉选择：DeepSeek/阿里云百炼/自定义）、baseUrl、apiKey、上下文窗口大小（context_window_tokens，默认 100000）。

> **[Event-driven]** When 用户提交模型配置，the system shall 保存配置到 `workspace/config/models.json`。

> **[Ubiquitous]** API 密钥不应以明文存储在 JSON 文件中。系统应将密钥存储在操作系统密钥链（macOS Keychain / Windows Credential Manager / Linux secret-service）中，`models.json` 仅保存密钥引用 ID（`api_key_ref`）。若密钥链不可用，降级为环境变量引用（`api_key_env`），密钥值通过 `.env` 文件加载。

> **[Ubiquitous]** `workspace/` 目录应包含 `.gitignore` 文件，忽略 `.env`、`config/`、`conversations/`、`memory/` 等含敏感数据的子目录，防止用户误将密钥提交到 Git。

> **[Event-driven]** When 用户点击"测试连接"，the system shall 使用配置的 baseUrl 和 apiKey 发送测试请求，返回连接是否成功及延迟信息。

> **[Event-driven]** When 用户点击编辑/删除模型，the system shall 执行对应操作。删除前需二次确认。

> **[Unwanted]** If 测试连接失败，then the system shall 显示具体错误信息（网络超时/认证失败/模型不存在等），不阻塞保存操作。

#### 4.2.2 模型配置数据结构

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

---

### 4.3 工具管理

#### 4.3.1 内置工具

> **[Ubiquitous]** 系统应内置三个工具，不可增加、不可删除：

| 工具名称 | 功能 | 参数 |
|----------|------|------|
| `read_file` | 读取指定文件内容 | `path`（文件路径） |
| `write_file` | 写入/创建文件 | `path`（文件路径）, `content`（文件内容） |
| `execute_command` | 执行命令行 | `command`（命令）, `working_dir`（工作目录，可选） |

> **[Event-driven]** When 用户进入工具管理页面，the system shall 展示三个内置工具的列表（名称、描述、启用状态）。

> **[Event-driven]** When 用户切换工具的启用/禁用状态，the system shall 更新配置并立即生效。

> **[Ubiquitous]** 禁用的工具不应出现在任何 Agent 的可用工具列表中。

> **[Ubiquitous]** `save_memory` 和 `search_memory` 是系统内置记忆工具，不在工具管理页面展示，不可禁用，所有 Agent 默认可用。

> **[Ubiquitous]** `delegate_task` 是系统内置多 Agent 协作工具，不在工具管理页面展示，不可禁用，所有 Agent 默认可用。

#### 4.3.2 工具安全限制

> **[Ubiquitous]** `read_file` 和 `write_file` 工具的路径参数必须经过路径安全校验：使用 `pathlib.resolve()` 解析后，检查路径是否在 `workspace/` 目录内，拒绝包含 `..` 的路径穿越和符号链接逃逸。

> **[Ubiquitous]** `execute_command` 工具应实现以下安全限制：
> - **命令黑名单**：禁止执行 `rm -rf`、`curl`、`wget`、`nc`、`ssh`、`scp`、`chmod 777`、`mkfs`、`dd if=/dev/zero` 等危险命令（黑名单维护在 `workspace/config/command_blocklist.json`，用户可自定义）
> - **执行超时**：默认 60 秒超时，超时后自动终止子进程
> - **工作目录限制**：`working_dir` 必须在 `workspace/` 目录内
> - **输出大小限制**：命令输出截断为最大 100KB，防止内存溢出
> - **环境变量隔离**：子进程不继承父进程的 API 密钥等敏感环境变量

> **[Event-driven]** When 命令被黑名单匹配或路径校验失败，the system shall 返回安全拦截错误信息给 Agent，不执行命令。

> **[Ubiquitous]** `write_file` 工具应限制单次写入文件大小为 10MB，防止磁盘滥用。

---

### 4.4 Skills 管理

#### 4.4.1 Skills 列表

> **[Event-driven]** When 用户进入技能管理页面，the system shall 展示所有 Skills 列表，显示名称、描述、启用状态。

> **[Event-driven]** When 用户切换技能的启用/停用状态，the system shall 更新配置并立即生效。

#### 4.4.2 Skills CRUD

> **[Event-driven]** When 用户点击"新增技能"，the system shall 展示表单，包含：名称、描述。创建时必须包含 `SKILL.md` 文件。

> **[Event-driven]** When 用户点击某个技能，the system shall 进入技能详情页，按层级目录展示该技能的所有文件（如 `SKILL.md`、脚本文件、配置等）。

> **[Event-driven]** When 用户在详情页查看某个文件，the system shall 支持编辑和保存文件内容。

> **[Event-driven]** When 用户点击"扫描技能"按钮，the system shall 扫描 `workspace/config/skills/` 目录，自动发现并加载未被注册的技能文件夹。

> **[Unwanted]** If 技能缺少 `SKILL.md` 文件，then the system shall 标记为无效技能并给出提示。

#### 4.4.3 ZIP 导入

> **[Event-driven]** When 用户点击"导入技能"并上传 ZIP 文件，the system shall 解压到 `workspace/config/skills/` 目录，并自动注册该技能。

> **[Unwanted]** If ZIP 文件解压后不包含 `SKILL.md`，then the system shall 提示导入失败并说明原因。
> **[Ubiquitous]** ZIP 解压时应进行 Zip Slip 安全校验：检查每个解压文件的路径不包含 `..`，确保解压目标路径在 `workspace/config/skills/` 目录内。
> **[Ubiquitous]** ZIP 文件大小限制为 50MB，解压后总大小限制为 200MB，防止解压炸弹攻击。
> **[Event-driven]** When ZIP 解压检测到路径穿越或大小超限，the system shall 中止解压并删除已解压的文件，返回安全错误信息。

#### 4.4.4 UI 要求

> **[Ubiquitous]** 技能列表页不应有编辑按钮，用户点击技能名称即可进入详情编辑。

> **[Ubiquitous]** 技能列表页不应有"替换文件"按钮。

> **[Ubiquitous]** 技能列表页底部的操作按钮应排列整齐。

---

### 4.5 Agent 管理

#### 4.5.1 Agent 列表

> **[Event-driven]** When 用户进入 Agent 管理页面，the system shall 展示 Agent 列表，每个 Agent 仅显示名称和描述。

> **[Ubiquitous]** 系统应默认一个主 Agent（名称："主 Agent"），该 Agent 不可删除。

> **[Event-driven]** When 用户点击 Agent，the system shall 进入该 Agent 的详情编辑页。

> **[Ubiquitous]** Agent 列表页不应有编辑按钮，点击进入详情编辑。删除按钮应放在详情页右上角。

#### 4.5.2 Agent 详情编辑（四个栏目）

**栏目一：基本信息**

> **[Event-driven]** When 用户查看基本信息栏目，the system shall 展示并允许编辑：名称、描述。

> **[Ubiquitous]** 在详情编辑页中，模型和其他基本参数不可修改（仅列表页展示的名称和描述可修改）。

**栏目二：系统提示词**

> **[Event-driven]** When 用户查看系统提示词栏目，the system shall 展示 `agent.md` 文件内容。

> **[Event-driven]** When 用户编辑并保存，the system shall 更新 `workspace/config/agents/{agent_id}/agent.md` 文件。

> **[Ubiquitous]** 每个 Agent 拥有独立的 `agent.md` 文件。

**栏目三：工具配置**

> **[Event-driven]** When 用户查看工具栏目，the system shall 展示全部可用工具（名称 + 描述），每个工具带勾选框。

> **[Event-driven]** When 用户勾选/取消工具，the system shall 更新该 Agent 的工具配置。

> **[Ubiquitous]** 内置记忆工具（save_memory/search_memory）和 delegate_task 工具不在工具栏目展示，所有 Agent 默认可用。

**栏目四：技能配置**

> **[Event-driven]** When 用户查看技能栏目，the system shall 展示全部已启用的技能（名称 + 描述），每个技能带勾选框。

> **[Event-driven]** When 用户勾选/取消技能，the system shall 更新该 Agent 的技能配置。

#### 4.5.3 Agent 配置数据结构

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

---

### 4.6 聊天页面

#### 4.6.1 布局结构

> **[Ubiquitous]** 聊天页面应分为两个区域：
> - 左侧：历史会话列表面板
> - 右侧：聊天交互区域

#### 4.6.2 会话管理

> **[Event-driven]** When 用户点击"+ 新建会话"，the system shall 创建新会话（自动生成 UUID 作为会话 ID），在左侧列表顶部显示，自动选中，右侧清空。

> **[Event-driven]** When 用户点击某个历史会话，the system shall 从 `workspace/conversations/{会话ID}/{会话ID}.jsonl` 读取全部记录，在右侧完整还原对话内容、工具/技能执行过程。

> **[Ubiquitous]** 历史会话列表应显示每个会话的标题（默认为会话创建时间，可由第一条用户消息更新）和最后更新时间。
> **[Event-driven]** When 用户右键点击历史会话或点击会话旁的操作按钮，the system shall 展示操作菜单：重命名、删除。
> **[Event-driven]** When 用户选择重命名，the system shall 展示输入框，用户输入新标题后更新会话标题。
> **[Event-driven]** When 用户选择删除，the system shall 二次确认后删除该会话的 JSONL 文件及对应的 `outputs/` 目录。
> **[Event-driven]** When 用户在会话列表上方的搜索框输入关键词，the system shall 实时过滤显示标题或内容匹配的会话。

#### 4.6.3 聊天交互

> **[Ubiquitous]** 右侧区域顶部右侧应有一个 Agent 下拉选择框，默认选中第一个 Agent。切换 Agent 后，当前会话的后续消息将使用新 Agent 回复。
> **[Ubiquitous]** 切换 Agent 时，若新 Agent 使用的模型上下文窗口小于当前会话上下文大小，the system shall 自动触发上下文压缩以适配新模型的窗口限制，并在界面提示"已切换 Agent 并压缩上下文"。
> **[Ubiquitous]** 聊天输入框应支持文件上传（文本文件、代码文件），文件内容作为上下文附加到用户消息中。单次上传文件大小限制为 5MB。

> **[Ubiquitous]** 聊天记录区采用气泡样式：用户消息靠右，Agent 消息靠左。

> **[Ubiquitous]** Agent 回复应逐字流式输出（通过 SSE）。
> **[Ubiquitous]** SSE 连接应实现心跳机制：服务端每 15 秒发送一次 `: heartbeat` 注释行，保持连接活跃。客户端断开后服务端应检测并终止对应的 Agent Loop。
> **[Unwanted]** If SSE 连接中断，then the system shall 保留已完成的交互记录（已写入 JSONL），客户端重连后可从 JSONL 恢复会话状态。Agent Loop 中断后的未完成轮次不自动恢复，由用户重新发送消息触发。

> **[Ubiquitous]** Agent 回复内容为 Markdown 格式，前端应正确渲染（标题、列表、代码块、表格等）。

> **[Ubiquitous]** 聊天记录区下方应有文本输入框和发送按钮，不支持回车发送。

> **[State-driven]** While Agent 正在思考/回复中，发送按钮应禁用，用户不可发送新消息。

#### 4.6.4 思考状态展示

> **[Event-driven]** When 用户发送消息后 Agent 尚未回复，the system shall 显示"正在思考..."的动态效果（如跳动点动画）。

#### 4.6.5 工具/技能执行过程展示

> **[Event-driven]** When Agent 发起工具或技能调用，the system shall 在聊天区实时显示系统消息卡片，包含：
> - 工具/技能名称
> - 传入参数

> **[Event-driven]** When 工具/技能执行完成，the system shall 在该消息下方显示返回结果。

> **[Ubiquitous]** 工具输出内容较多时应支持折叠/展开，聊天区域应有滚动条。

> **[Ubiquitous]** 工具调用消息和 AI 回复消息应按时间顺序正确排列，不应出现顺序混乱。

#### 4.6.6 输出文件面板

> **[Event-driven]** When 当前会话的 `outputs/` 文件夹中存在文件，the system shall 在聊天区域右侧边栏展示文件列表。

> **[Ubiquitous]** 文件列表面板应显示文件名、大小、修改时间，支持下载和预览（文本类文件可直接预览）。

> **[Event-driven]** When Agent 新增文件到 outputs 目录，the system shall 自动刷新文件列表。

> **[State-driven]** While 当前会话没有 outputs 文件夹或为空，面板应显示"暂无输出文件"。

---

### 4.7 Agent 执行引擎（Agent Loop）

#### 4.7.1 请求构造

> **[Event-driven]** When 用户发送消息，the system shall 构造请求，包含：
> - 当前 Agent 的系统提示词（`agent.md` 文件内容）
> - 当前 Agent 的工具列表（名称、描述、参数 schema）
> - 当前 Agent 的技能列表（名称、功能、触发条件、输入输出格式、调用方式）
> - 会话上下文（考虑压缩后的上下文）
> - 长期记忆内容（自动注入系统提示词）
> - Memory 使用规则提示词
> - 文件写入路径说明（自动拼接 outputs 目录绝对路径）

#### 4.7.2 模型响应处理

> **[Event-driven]** When 模型返回不包含工具/技能调用请求，the system shall 将文本内容直接流式输出给用户。

> **[Event-driven]** When 模型返回包含调用请求，the system shall：
> 1. 解析请求类型（tool 或 skill）
> 2. 对于 tool：执行对应工具函数，获得返回结果
> 3. 对于 skill：根据 skill 定义执行预定义流程
> 4. 将执行结果追加到对话中
> 5. 将原对话历史 + 调用请求 + 执行结果再次发送给模型
> 6. 模型根据结果生成最终回复，流式输出
> 7. 如果模型再次返回工具请求，重复循环

#### 4.7.3 循环限制

> **[Ubiquitous]** 工具/技能调用循环最大为 50 轮。超过 50 轮后强制终止，保存已完成的中间结果到 `outputs/` 目录，生成进度摘要（已完成步骤、未完成步骤），并在聊天界面提示用户"已达到最大循环次数，部分结果已保存"。

> **[Ubiquitous]** 对模型而言，工具和技能的调用格式应保持一致（统一使用 tool_calls 结构，通过 `type` 字段区分：`type: "tool"` 或 `type: "skill"`）。

> **[Event-driven]** When 工具或技能执行失败，the system shall 将错误信息作为工具返回结果追加到对话中，由模型决定是否重试、换方案或告知用户。系统不自动重试，由 Agent 自主决策。

> **[Event-driven]** When Agent Loop 中间轮次模型返回文本内容（非工具调用），the system shall 将中间文本作为"思考过程"流式展示给用户（可折叠），标注为"Agent 思考中..."，与最终回复视觉区分。

#### 4.7.4 会话持久化

> **[Ubiquitous]** 会话记录应存储在 `workspace/conversations/{会话ID}/{会话ID}.jsonl`，每行一个交互事件。
> **[Ubiquitous]** JSONL 文件写入应使用原子操作：先写入临时文件（`{会话ID}.jsonl.tmp`），再通过 `os.rename` 原子替换，防止写入中途崩溃导致文件损坏。
> **[Ubiquitous]** 多会话并发写入时，系统应使用文件锁（`filelock` 库）确保同一会话的 JSONL 写入串行化，不同会话可并行写入。

> **[Event-driven]** When 发生任何交互事件（用户消息/模型回复/工具调用/技能调用/文件写入），the system shall 立即追加写入对应会话的 JSONL 文件。

> **[Ubiquitous]** JSONL 事件对象应包含字段：`role`、`type`、`timestamp`、`data`、`reasoning`、`tool_call_id` 等。

---

### 4.8 记忆系统

#### 4.8.1 记忆类型

> **[Ubiquitous]** 系统应提供两类记忆：
> - 长期记忆：`workspace/memory.md`（跨会话/跨 Agent 持久）
> - 短期记忆：`workspace/memory/YYYY-MM-DD.md`（当天有效，跨 Agent 共享）
> **[Ubiquitous]** 长期记忆文件（`memory.md`）大小上限为 50KB。超过上限时，系统自动调用模型对旧记忆生成摘要，替换原始内容，保留最近 20% 的原始记忆条目。
> **[Ubiquitous]** 短期记忆文件保留 7 天，超过 7 天的文件自动归档到 `workspace/memory/archive/` 目录。

#### 4.8.2 长期记忆注入

> **[Event-driven]** When 每次向模型发送请求前，the system shall 读取 `workspace/memory.md` 并将内容注入到系统提示词中（以 "# Long-term Memory" 格式）。

> **[Unwanted]** If `workspace/memory.md` 不存在，then the system shall 按空内容处理，不报错。

#### 4.8.3 内置记忆工具

> **[Ubiquitous]** `save_memory` 和 `search_memory` 是系统内置工具，不可被用户禁用/删除/修改，所有 Agent 默认可用，不在工具管理页面展示。

#### 4.8.4 save_memory 工具

> **[Event-driven]** When Agent 调用 save_memory，the system shall：
> - 接收参数：`type`（long_term/short_term）、`content`（记忆内容）
> - long_term：写入 `workspace/memory.md`（追加模式）
> - short_term：写入 `workspace/memory/YYYY-MM-DD.md`（追加模式）
> - 自动创建不存在的文件或目录

#### 4.8.5 search_memory 工具

> **[Event-driven]** When Agent 调用 search_memory，the system shall：
> - 接收参数：`query`（检索关键词）、`type`（可选，long_term/short_term/all，默认 all）
> - 搜索对应记忆文件，返回匹配的相关记忆片段
> **[Ubiquitous]** 检索策略：P0 使用关键词匹配（基于 `query` 分词后在记忆文件中全文搜索，返回匹配行及上下文）；P1 规划引入向量检索（ChromaDB / FAISS）提升语义匹配能力。
> **[Ubiquitous]** 搜索结果应按相关度排序，单次返回最多 10 条匹配片段，避免注入过多上下文。

#### 4.8.6 Memory 使用规则注入

> **[Ubiquitous]** 系统应在每次模型请求的系统提示词中注入 Memory 使用规则（含 save_memory/search_memory 的调用时机、写入原则、检索原则等），程序实现时需将规则中的路径替换为真实路径。

---

### 4.9 上下文压缩

#### 4.9.1 触发条件

> **[Event-driven]** When 当前会话 token 数超过模型 `context_window_tokens` 的 75%，the system shall 触发上下文压缩。
> **[Ubiquitous]** Token 计数方案：使用 `tiktoken` 库（OpenAI 兼容模型的默认分词器）估算上下文 token 数。对于非 OpenAI 模型（如 DeepSeek），使用 `cl100k_base` 分词器作为近似估算，估算误差在可接受范围内（压缩阈值留有 25% 余量）。系统提示词、工具定义、记忆注入内容均纳入 token 计数。

#### 4.9.2 压缩范围

> **[Ubiquitous]** 压缩时应保留最近约 10% tokens 的原始消息（至少一轮完整对话）。

#### 4.9.3 压缩摘要

> **[Event-driven]** When 触发压缩，the system shall 调用模型生成结构化压缩摘要，包含四部分：目标、已完成进度、当前状态、下一步。
> **[Event-driven]** When 压缩摘要生成后，the system shall 进行质量自检：将摘要和原始消息一并发给模型，验证摘要是否包含关键决策、未完成任务和重要上下文。若自检不通过，重新生成摘要（最多重试 2 次）。

#### 4.9.4 压缩记录

> **[Ubiquitous]** 压缩后不删除任何原始消息，仅在 JSONL 文件中新增一条 `context_compression` 记录。

> **[Ubiquitous]** 压缩记录应包含字段：`role`（context_compression）、`type`（context_compression）、`timestamp`、`token_count_before`、`token_count_after`、`compressed_through_index`、`retained_tail_start_index`、`structured_memory`、`quality_check_passed`。

#### 4.9.5 上下文重建

> **[Event-driven]** When 后续请求构建上下文，the system shall 使用"最新压缩记录的 structured_memory + 压缩记录之后的所有原始消息"。

> **[Ubiquitous]** 如果存在多次压缩记录，始终只使用最新一条。

---

### 4.10 多 Agent 协作

#### 4.10.1 编排者模式

> **[Ubiquitous]** 多 Agent 协作应采用编排者模式：主 Agent 判断是否需要拆分任务，通过 `delegate_task` 工具创建子 Agent，子 Agent 执行后返回结果，主 Agent 汇总回复用户。

#### 4.10.2 delegate_task 工具

> **[Ubiquitous]** `delegate_task` 是系统内置工具，参数包含：`task`、`context`、`tools`、`skills`、`expected_output`。

> **[Ubiquitous]** 子 Agent 可用的工具和技能不能超过主 Agent 当前拥有的范围，系统创建子 Agent 前应做权限校验。
> **[Ubiquitous]** 子 Agent 不允许递归调用 `delegate_task`（最大嵌套深度 = 1）。子 Agent 只能执行工具和技能调用，不能再次委派任务。
> **[Ubiquitous]** 主 Agent 可在同一轮中并行创建多个子 Agent（使用 `asyncio.gather` 并发执行），每个子 Agent 独立执行后结果汇总给主 Agent。
> **[Ubiquitous]** 子 Agent 的模型固定使用主 Agent 当前配置的模型，不支持独立指定模型。
> **[Ubiquitous]** 子 Agent 的执行过程应写入主会话的 JSONL 文件，`type` 字段标记为 `sub_agent_execution`，包含子 Agent 的工具调用、技能调用和返回结果。

#### 4.10.3 子 Agent 系统提示词

> **[Ubiquitous]** 子 Agent 应使用系统内置的专用系统提示词（规定：只处理分配任务、不扩展范围、不直接回复用户、结构化返回结果等）。

#### 4.10.4 前端展示

> **[Event-driven]** When 主 Agent 调用 delegate_task，the system shall 在前端展示子 Agent 的执行过程（默认折叠摘要，点击可展开查看子 Agent 完整执行详情）。

---

### 4.11 日志系统

#### 4.11.1 执行日志

> **[Ubiquitous]** 左侧菜单栏应有"执行日志"菜单项。

> **[Event-driven]** When 用户进入执行日志页面，the system shall 展示：
> - 顶部筛选区：会话 ID 下拉选择器（动态加载）、日期范围筛选
> - 日志列表：按日期分组，事件以结构化卡片展示（时间戳、事件类型、详细数据）

> **[Ubiquitous]** 事件类型应用不同颜色/图标区分（用户消息/模型回复/工具调用/技能调用/文件写入等）。

> **[Ubiquitous]** 较长内容（模型回复/工具输出）应支持折叠/展开。

> **[Event-driven]** When 用户点击"刷新"按钮，the system shall 重新扫描 conversations 目录加载最新数据。

#### 4.11.2 模型调用日志

> **[Ubiquitous]** 左侧菜单栏应有"模型日志"菜单项。

> **[Event-driven]** When 用户进入模型日志页面，the system shall 展示每次模型调用的输入（messages 数组）和输出（response 内容），按时间倒序排列，方便排查问题。

---

### 4.12 界面美化

> **[Ubiquitous]** 整体配色应采用暖色调极简风格（主背景白、菜单浅灰、强调色暖橙/琥珀）。

> **[Ubiquitous]** Agent 管理列表页：简洁卡片式布局，仅显示名称和描述。

> **[Ubiquitous]** 技能管理列表页：操作按钮排列整齐，移除多余按钮。

> **[Ubiquitous]** 聊天页面：Markdown 渲染正确，工具输出有合理排版，消息顺序正确。

> **[Ubiquitous]** 所有页面应有统一的暖色系设计语言（圆角、阴影、间距一致）。

---

## 六、数据流与接口设计

### 5.1 后端 API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| **模型管理** |||
| GET | `/api/models` | 获取模型列表 |
| POST | `/api/models` | 添加模型 |
| PUT | `/api/models/{id}` | 修改模型 |
| DELETE | `/api/models/{id}` | 删除模型 |
| POST | `/api/models/{id}/test` | 测试连接 |
| **工具管理** |||
| GET | `/api/tools` | 获取工具列表（含启用状态） |
| PUT | `/api/tools/{name}/toggle` | 启用/禁用工具 |
| **Skills 管理** |||
| GET | `/api/skills` | 获取 Skills 列表 |
| POST | `/api/skills` | 新增 Skill |
| PUT | `/api/skills/{id}` | 修改 Skill |
| DELETE | `/api/skills/{id}` | 删除 Skill |
| GET | `/api/skills/{id}/files` | 获取 Skill 文件树 |
| GET | `/api/skills/{id}/files/{path}` | 获取 Skill 文件内容 |
| PUT | `/api/skills/{id}/files/{path}` | 保存 Skill 文件内容 |
| POST | `/api/skills/import` | ZIP 导入 Skill |
| POST | `/api/skills/scan` | 扫描新 Skill |
| **Agent 管理** |||
| GET | `/api/agents` | 获取 Agent 列表 |
| POST | `/api/agents` | 新增 Agent |
| GET | `/api/agents/{id}` | 获取 Agent 详情 |
| PUT | `/api/agents/{id}` | 修改 Agent |
| DELETE | `/api/agents/{id}` | 删除 Agent |
| GET | `/api/agents/{id}/agent-md` | 获取 agent.md 内容 |
| PUT | `/api/agents/{id}/agent-md` | 保存 agent.md 内容 |
| **聊天** |||
| GET | `/api/conversations` | 获取会话列表 |
| POST | `/api/conversations` | 创建会话 |
| GET | `/api/conversations/{id}` | 获取会话详情（JSONL 解析） |
| PUT | `/api/conversations/{id}` | 重命名会话 |
| DELETE | `/api/conversations/{id}` | 删除会话（含 JSONL 和 outputs） |
| GET | `/api/conversations/search` | 搜索会话（按标题/内容过滤） |
| POST | `/api/chat/send` | 发送消息（SSE 流式返回） |
| POST | `/api/chat/upload` | 上传文件（文本/代码文件，5MB 限制） |
| GET | `/api/conversations/{id}/outputs` | 获取输出文件列表 |
| GET | `/api/conversations/{id}/outputs/{filename}` | 下载/预览输出文件 |
| **日志** |||
| GET | `/api/logs/executions` | 获取执行日志（支持筛选） |
| GET | `/api/logs/models` | 获取模型调用日志 |
| **记忆** |||
| GET | `/api/memory/long-term` | 获取长期记忆 |
| GET | `/api/memory/short-term` | 获取短期记忆 |

### 5.2 核心数据流

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
┌─ 无工具调用 → SSE 流式输出给前端 → 写入 JSONL
└─ 有工具调用 → 执行工具/技能 → 结果写入 JSONL
                     ↓
               再次调用模型（循环直到无工具调用或达到 50 轮）
                     ↓
               SSE 流式输出最终回复 → 写入 JSONL
```

---

## 七、技术方案概要

### 6.1 后端技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| Web 框架 | FastAPI | 异步支持、SSE 流式、自动 API 文档 |
| 包管理 | uv | Python 包管理 |
| LLM 客户端 | httpx/aiohttp | 直接调用 OpenAI 兼容 API |
| 数据存储 | JSON/JSONL/Markdown 文件 | 无数据库依赖 |
| 沙箱执行 | subprocess + 命令黑名单 + 超时 + 目录限制 | P0 多层防护，P2 规划 Docker 隔离 |
| Token 计数 | tiktoken | 上下文 token 估算（cl100k_base 分词器） |
| 文件锁 | filelock | 并发写入串行化 |
| 密钥存储 | keyring | 操作系统密钥链（Keychain/Credential Manager/secret-service） |
| ZIP 安全校验 | zipfile + 路径校验 | 防止 Zip Slip 攻击 |

### 6.2 前端技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 框架 | React 18+ | 函数组件 + Hooks |
| 构建 | Vite | 快速开发构建 |
| 样式 | CSS Modules / Tailwind CSS | 暖色调极简风格 |
| Markdown | react-markdown + remark-gfm | Markdown 渲染 |
| 代码高亮 | react-syntax-highlighter | 代码块高亮 |
| SSE | EventSource / fetch streaming | 流式输出 |
| 图标 | Lucide React | 简洁图标库 |

### 6.3 关键依赖

**后端 (pyproject.toml):**
```
fastapi
uvicorn
httpx
pydantic
python-multipart
tiktoken
filelock
keyring
aiofiles
python-dateutil
```

**前端 (package.json):**
```
react, react-dom, react-router-dom
react-markdown, remark-gfm
react-syntax-highlighter
lucide-react
```

---

## 八、验收标准

### 7.1 模型管理
- [ ] 可添加/编辑/删除模型配置
- [ ] 支持 DeepSeek 和阿里云百炼的 baseUrl + apiKey 配置
- [ ] 测试连接功能正常，返回成功/失败及延迟信息
- [ ] 上下文窗口大小可配置
- [ ] API 密钥存储在 OS 密钥链中，models.json 不含明文密钥
- [ ] 连接测试校验 OpenAI 接口兼容性
- [ ] workspace/.gitignore 正确忽略敏感目录

### 7.2 工具管理
- [ ] 三个内置工具（读文件/写文件/命令行）正确展示
- [ ] 不支持添加/删除，仅支持启用/禁用
- [ ] 禁用的工具在 Agent 中不可用
- [ ] 命令黑名单拦截危险命令（rm -rf, curl, wget 等）
- [ ] 命令执行 60s 超时自动终止
- [ ] 文件路径校验拒绝 `..` 路径穿越
- [ ] write_file 限制 10MB 写入大小
- [ ] 子进程不继承敏感环境变量

### 7.3 Skills 管理
- [ ] 技能列表正确显示名称和描述
- [ ] 新增/修改/删除功能正常
- [ ] 详情页按层级目录展示文件
- [ ] SKILL.md 文件可编辑和保存
- [ ] ZIP 导入功能正常
- [ ] ZIP 导入校验 Zip Slip 路径穿越
- [ ] ZIP 文件大小限制 50MB，解压后限制 200MB
- [ ] 扫描按钮可发现新技能
- [ ] 列表页 UI 整齐，无多余按钮

### 7.4 Agent 管理
- [ ] Agent 列表仅显示名称和描述
- [ ] 主 Agent 不可删除
- [ ] 详情页四个栏目功能正常
- [ ] agent.md 可编辑保存
- [ ] 工具和技能可勾选/取消
- [ ] 删除按钮在详情页右上角

### 7.5 聊天页面
- [ ] 会话新建/切换/历史列表正常
- [ ] 会话删除（二次确认 + 删除 JSONL 和 outputs）
- [ ] 会话重命名功能正常
- [ ] 会话搜索过滤功能正常
- [ ] 文件上传（文本/代码文件，5MB 限制）正常
- [ ] Agent 选择切换正常
- [ ] 切换 Agent 时上下文窗口不匹配自动压缩
- [ ] 消息气泡样式正确（用户右/Agent 左）
- [ ] 流式输出正常
- [ ] SSE 心跳 15s 正常
- [ ] SSE 断连后重连恢复会话状态
- [ ] Markdown 渲染正确
- [ ] 思考状态动画正常
- [ ] 工具/技能执行过程实时展示
- [ ] 输出文件面板正常
- [ ] 历史会话完整还原
- [ ] 消息顺序正确

### 7.6 Agent Loop
- [ ] 工具调用循环正常（最大 50 轮）
- [ ] 达到 50 轮上限时保存中间结果到 outputs/ 并生成进度摘要
- [ ] 技能调用正常
- [ ] 工具/技能通过 type 字段区分（tool/skill）
- [ ] 工具执行失败时错误信息返回给模型
- [ ] 中间轮次模型文本作为"思考过程"流式展示
- [ ] 系统提示词动态组装正确
- [ ] 会话 JSONL 完整记录
- [ ] JSONL 原子写入（临时文件 + rename）
- [ ] 并发写入使用 filelock 串行化

### 7.7 记忆系统
- [ ] 长期记忆自动注入系统提示词
- [ ] save_memory/search_memory 工具正常
- [ ] 短期记忆按日期分文件存储
- [ ] 长期记忆超 50KB 自动摘要压缩
- [ ] 短期记忆 7 天后自动归档
- [ ] search_memory 按相关度排序，最多返回 10 条
- [ ] Memory 使用规则正确注入

### 7.8 上下文压缩
- [ ] 75% 阈值触发正常
- [ ] Token 计数使用 tiktoken 估算
- [ ] 压缩摘要包含四部分内容
- [ ] 压缩摘要质量自检通过
- [ ] 原始消息不删除
- [ ] 多次压缩正常

### 7.9 多 Agent 协作
- [ ] delegate_task 工具正常
- [ ] 子 Agent 权限校验正常
- [ ] 子 Agent 递归调用 delegate_task 被拒绝
- [ ] 多个子 Agent 并行执行正常
- [ ] 子 Agent 执行过程写入主会话 JSONL
- [ ] 子 Agent 结果正确返回给主 Agent
- [ ] 前端可折叠展示

### 7.10 日志系统
- [ ] 执行日志结构化展示
- [ ] 筛选功能正常
- [ ] 模型日志展示输入/输出

### 7.11 界面
- [ ] 暖色调极简风格统一
- [ ] 各页面 UI 美观整齐
- [ ] 所有文字简体中文

---

## 九、边界场景与异常处理

| 场景 | 处理方式 |
|------|----------|
| 模型 API 不可用 | 前端显示错误信息，不阻塞 UI |
| 模型返回格式异常 | 解析失败时降级为纯文本输出 |
| 工具执行超时（>60s） | 自动终止并返回超时信息 |
| 命令行执行危险命令 | 黑名单拦截 + 返回安全拦截错误给 Agent |
| 文件路径越界（含 `..` 和符号链接） | `pathlib.resolve()` 校验 + 前缀检查，拒绝越界路径 |
| ZIP 导入路径穿越 | Zip Slip 校验，中止解压并删除已解压文件 |
| API 密钥泄露风险 | 密钥存储在 OS 密钥链，workspace/.gitignore 忽略敏感目录 |
| SSE 连接中断 | 保留已写入 JSONL 的记录，客户端重连后恢复 |
| 长期记忆超出 50KB 上限 | 自动触发记忆摘要压缩，保留最近 20% 原始条目 |
| Agent Loop 达到 50 轮上限 | 保存中间结果到 outputs/，生成进度摘要并提示用户 |
| 压缩摘要质量自检不通过 | 重新生成摘要（最多重试 2 次），仍失败则跳过压缩 |
| 子 Agent 递归调用 delegate_task | 系统拒绝并返回错误"子 Agent 不允许委派任务" |
| 并发会话写入冲突 | filelock 文件锁确保同一会话串行写入 |
| 会话 JSONL 文件损坏 | 跳过损坏行，记录警告日志 |
| 上下文压缩时模型调用失败 | 跳过压缩，继续使用原始上下文 |
| 子 Agent 执行失败 | 返回错误信息给主 Agent，不阻塞主流程 |
| 记忆文件不存在 | 自动创建，按空内容处理 |
| 模型上下文窗口不匹配 | 切换 Agent 时自动触发上下文压缩适配 |

---

## 十、数据指标（埋点建议）

| 指标 | 说明 |
|------|------|
| 会话创建数 | 每日新建会话数量 |
| 消息发送数 | 每日用户发送消息总量 |
| Agent 调用次数 | 各 Agent 被使用频次 |
| 工具调用次数 | 各工具被调用频次 |
| 技能调用次数 | 各技能被调用频次 |
| 平均响应时间 | 从用户发消息到首字输出的时间 |
| Token 消耗量 | 每日 Token 消耗总量（按模型统计） |
| 压缩触发次数 | 上下文压缩触发频率 |
| 子 Agent 创建次数 | 多 Agent 协作使用频率 |
| 记忆读写次数 | save_memory/search_memory 调用频次 |

---

## 十一、已确认问题与遗留问题

### 已确认（本次评审解决）

1. **命令行执行的安全性边界**：已确认 P0 实现命令黑名单 + 60s 超时 + 工作目录限制 + 输出大小限制 + 环境变量隔离；P2 规划 Docker 容器隔离。
2. **多用户支持**：已确认 MVP 为单用户无认证；P1 增加 Bearer Token 认证；P2 规划多用户隔离（需重构 workspace 目录结构）。
3. **子 Agent 的模型选择**：已确认子 Agent 固定使用主 Agent 的模型，不支持独立指定，简化配置和上下文处理。

### 遗留问题（需后续讨论）

1. **Skills 系统提示词膨胀**：大量 Skills 的描述注入系统提示词可能导致上下文溢出。是否需要按需加载 Skills 描述（如仅注入名称和触发条件，详情在调用时加载）？
2. **模型 API 兼容性矩阵**：不同供应商（DeepSeek/百炼/自定义）在 tool_calls 格式上可能有细微差异，是否需要维护兼容性适配层？
3. **workspace 数据备份与迁移**：文件存储方案下，用户如何备份 workspace 数据？是否需要提供导出/导入 workspace 的功能？
4. **Skills 脚本执行权限**：Skills 中的脚本文件（如 Python/Shell）是否允许被 Agent 直接执行？如果允许，安全边界如何定义？

---

> 📌 **提醒**：
> - 本 PRD 已完成深度评审（v1.1），安全方案已强化，MVP 范围已裁剪
> - P0 开发优先级：项目基础设施 -> 模型管理 -> 工具管理（含安全限制） -> Agent 管理 -> 聊天交互 -> Agent Loop
> - P0 安全加固与功能开发同步进行，不可延后
> - 建议将功能模块拆成开发任务，分配给前端和后端开发同学
> - 测试同学可以基于验收标准开始编写测试用例
