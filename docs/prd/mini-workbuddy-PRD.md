# Mini-WorkBuddy 产品需求文档 (PRD)

> **版本**: v1.2（对齐 Lovable 前端页面实现）  
> **目标用户**: 个人开发者 + 小团队  
> **开源策略**: 完全开源 MIT  
> **平台**: Web 版（桌面端优先适配）  
> **文档状态**: 已根据当前 `frontend/` 页面实现修订；后端/Agent Loop 能力保持 P0 目标，前端部分页面仍为 mock 数据驱动

---

## 修订说明（v1.1 → v1.2）

| 变更点 | v1.1 | v1.2（当前前端） |
|--------|------|------------------|
| 前端技术栈 | React 18 + Vite + react-router-dom + 暖色 Tailwind | TanStack Start + TanStack Router + shadcn/ui + Design Tokens + 浅/深色主题 |
| 信息架构 | 聊天 / Agent / 模型 / 工具 / 技能 / 执行日志 / 模型日志 | **工作台**：对话、Agent、模型、工具、Skills、连接器；**洞察**：记忆、历史、日志、Tokens、设置 |
| 连接器 | P2 远期 | **前端页面已落地**（飞书 / 钉钉 / 企业微信 / Webhook），后端对接仍待补齐 |
| 配置治理 | 未单独成页 | 新增 **变更历史**（回滚）与 **设置**（主题 / 强调色 / 备份恢复 / 安全） |
| 日志 | 执行日志 + 模型日志双入口 | 统一 **日志** 页（多类型 Tab + 筛选 + 详情 + ZIP 导出） |
| 设计系统 | 暖色极简约定 | 设计令牌体系 + **Tokens 预览页** + 主题/强调色可配置 |
| 数据层现状 | 前后端直连目标 | 当前前端以 `mock-store` / `mock-test` 驱动交互原型；后端 FastAPI 仍承担真实持久化与 Agent Loop |

> 原则：本 PRD 以**当前前端可见能力**校正信息架构、页面需求与验收标准；后端安全、Agent Loop、JSONL 持久化等核心能力不降级。

---

## 一、产品背景与目标

### 1.1 产品定位

Mini-WorkBuddy 是一个**轻量级 AI 办公智能体工作台**（Web 版），灵感来源于腾讯 WorkBuddy。用户通过自然语言驱动 AI Agent 自主完成任务——从规划到执行再到交付结果，全程自动化。

定位：**开源 MIT、轻量、可自部署**，聚焦个人开发者和小团队的核心办公场景。当前前端已形成“工作台 + 洞察”双分区控制台形态。

### 1.2 核心差异化

| 对比维度 | 腾讯 WorkBuddy | Mini-WorkBuddy |
|----------|---------------|----------------|
| 部署方式 | 闭源 SaaS + 桌面客户端 | 开源 MIT，可自部署 |
| 模型策略 | 内置模型 + Auto 路由 | 用户自定义 baseUrl + apiKey + Model ID |
| 技能生态 | SkillHub 海量技能 | 自定义 Skills，ZIP 导入 / 扫描发现 |
| 目标用户 | 企业全员 | 个人开发者 + 小团队 |
| Agent 能力 | 预置专家 Agent | 用户自定义 Agent（主 Agent + 自定义 Agent） |
| 连接器 | 多平台内置 | 飞书 / 钉钉 / 企业微信 / 自定义 Webhook（UI 已落地） |
| 配置治理 | 平台侧托管 | 本地 workspace + 配置变更历史回滚 + 备份恢复 |
| 多模态 | 图片/文档/PPT/视频 | MVP 支持文本/代码附件，图片/富文档后续扩展 |

### 1.3 业务目标

- 提供开箱即用的 AI Agent 工作台，降低个人开发者使用门槛
- 通过可自定义的 **Agent + Skills + 工具 + 连接器** 体系构建本地 AI 工作流
- 支持多模型供应商（DeepSeek、阿里云百炼、自定义 OpenAI 兼容服务）
- 具备记忆系统、上下文压缩、配置历史与可观测日志，支撑长周期任务与问题排查

### 1.4 当前实现分层

| 层 | 状态 | 说明 |
|----|------|------|
| 前端 UI / IA | 已按 v1.2 页面落地 | 路由、交互、空态、筛选、详情抽屉/对话框齐备 |
| 前端数据 | 多为本地 mock store | `localStorage` + mock 测试，便于 UI 验收 |
| 后端 API / Agent Loop | P0 能力目标 | FastAPI、workspace 文件存储、SSE、安全限制 |
| 前后端联调 | 部分完成 / 待收敛 | 新前端需逐步替换 mock，对齐真实 API |

---

## 二、用户故事

| 编号 | 角色 | 需求 | 目的 |
|------|------|------|------|
| US-01 | 个人开发者 | 配置多模型（含默认模型、连接测试、健康状态） | 灵活切换不同模型处理任务 |
| US-02 | 个人开发者 | 管理 Agent（系统提示词、工具、Skills、默认模型、标签） | 为不同场景创建专门助手 |
| US-03 | 小团队用户 | 在对话页与 Agent 交互，选择 Skills/工具并上传附件 | 用自然语言驱动实际工作 |
| US-04 | 个人开发者 | 管理 Skills（新增/编辑/导入/扫描/启停） | 扩展 Agent 能力边界 |
| US-05 | 个人开发者 | 管理内置工具启停、自检与连接器绑定 | 控制执行能力与外部系统触达 |
| US-06 | 个人开发者 | 配置飞书/钉钉/企微/Webhook 连接器并做连通性与事件预览 | 把工作台接入团队协作通道 |
| US-07 | 个人开发者 | 查看记忆占用、长期/短期记忆内容 | 理解跨会话上下文状态 |
| US-08 | 个人开发者 | 查看配置变更历史并一键回滚 | 安全试错，快速恢复错误配置 |
| US-09 | 个人开发者 | 统一查看执行/模型/工具/技能日志并导出 | 调试 Agent 行为与链路问题 |
| US-10 | 个人开发者 | 在设置中切换主题/强调色、备份恢复配置 | 个性化工作台并保护本地配置 |
| US-11 | 个人开发者 | 预览 Design Tokens | 保证设计一致性与协作可读性 |

---

## 三、功能全景

### 3.1 信息架构（对齐侧边栏）

```
Mini-WorkBuddy 工作流控制台
├── 工作台
│   ├── 对话          /
│   ├── Agent         /agents
│   ├── 模型          /models
│   ├── 工具          /tools
│   ├── Skills        /skills
│   └── 连接器        /connectors
└── 洞察
    ├── 记忆          /memory
    ├── 历史          /history
    ├── 日志          /logs
    ├── Tokens        /tokens
    └── 设置          /settings
```

### 3.2 功能模块总览

```
Mini-WorkBuddy
├── 1. 项目基础设施
│   ├── 后端 FastAPI + workspace 自初始化
│   ├── 前端 TanStack Start 控制台布局
│   ├── 侧边栏双分区（工作台 / 洞察）
│   └── 设计令牌 + 浅/深色 + 强调色
├── 2. 对话（聊天交互）
│   ├── 会话列表（新建 / 搜索 / 切换）
│   ├── Agent 选择
│   ├── 流式输出 + 思考态
│   ├── 附件上传（文本/代码）
│   ├── Skills / 工具选择器（发送前限定本轮可用能力）
│   ├── 工具/技能执行过程展示
│   └── 输出文件面板（目标能力）
├── 3. Agent 管理
│   ├── 列表：搜索 / 排序 / 复制 / 删除（主 Agent 不可删）
│   ├── 新建/编辑对话框
│   ├── 字段：名称、slug、描述、系统提示词、默认模型、标签
│   └── 工具勾选 + Skills 勾选
├── 4. 模型管理
│   ├── CRUD + 默认模型
│   ├── 连接测试 / 一键批量测试
│   ├── 健康统计（总数 / 健康 / 异常）
│   ├── 筛选：全部 / 正常 / 异常 / 未测试 / 默认
│   └── 字段：名称、供应商、Base URL、Model ID、API Key、上下文长度
├── 5. 工具管理
│   ├── 三个内置工具（不可新增删除）
│   ├── 启用/停用 + 编辑名称/描述
│   ├── 一键自检 / 批量自检
│   ├── 连接器绑定
│   └── 搜索 / 筛选 / 排序
├── 6. Skills 管理
│   ├── 列表 + 启停 + 编辑 + 删除
│   ├── 新增 / ZIP 导入 / workspace 扫描
│   ├── 筛选：全部 / 已启用 / 内置 / 自建 / 导入
│   └── 连接器绑定
├── 7. 连接器
│   ├── 类型：飞书 / 钉钉 / 企业微信 / 自定义 Webhook
│   ├── CRUD + 启停 + 连通性测试
│   ├── 健康巡检（轮询 / 状态变化通知 / 静音）
│   ├── Webhook 事件接收与预览（签名模式模拟 / 重放 / 导出）
│   └── 导入导出（全部或当前筛选；合并 / 追加 / 替换）
├── 8. 记忆
│   ├── 长期记忆概览与占用
│   ├── 短期记忆按天列表
│   └── 压缩阈值可视化（75% 触发）
├── 9. 变更历史
│   ├── 记录 models / tools / skills / agents 配置变更
│   ├── 最多保留最近 30 条
│   └── 一键回滚 / 清空历史
├── 10. 日志
│   ├── 统一入口：Agent 执行 / 模型调用 / 工具 / 技能
│   ├── 筛选：关键词 / 时间范围 / 级别 / 状态
│   ├── 详情侧栏：输入输出复制下载
│   └── ZIP 导出
├── 11. Tokens 预览
│   └── 颜色 / 圆角 / 阴影 / 字体令牌浏览与复制
├── 12. 设置
│   ├── 外观主题（浅 / 深 / 跟随系统）
│   ├── 强调色 / 品牌色
│   ├── 配置备份与恢复（合并 / 替换）
│   ├── Workspace 目录说明
│   └── 安全开关展示（命令沙箱 / 路径校验 / Bearer Token(P1)）
├── 13. Agent 执行引擎（后端核心）
│   ├── 工具调用循环（最大 50 轮）
│   ├── SSE 流式 + 心跳
│   ├── 技能调用
│   └── 会话 JSONL 持久化
├── 14. 记忆与压缩（后端核心）
│   ├── 长期 / 短期记忆 + save/search 工具
│   └── 75% 阈值上下文压缩
└── 15. 安全
    ├── 密钥链存储
    ├── 命令黑名单 + 超时 + 目录限制
    └── 路径校验 + ZIP Slip 防护
```

### 3.3 功能优先级矩阵

| 模块 | P0（MVP 核心） | P1（扩展） | P2（远期） |
|------|:--:|:--:|:--:|
| 项目基础设施 / 控制台 IA | ✅ | - | - |
| 对话交互 | ✅ | 富文本附件 / 多模态 | - |
| Agent 管理 | ✅ | - | - |
| 模型管理 | ✅ | 供应商预设模板 | - |
| 工具管理 | ✅ | 自定义工具 | - |
| Skills 管理 | ✅ | Skill 市场 | - |
| 连接器 | ✅ UI / 🔄 后端对接 | 事件驱动任务触发 | 更多 SaaS 连接器 |
| 记忆系统 | ✅ 基础版 | 摘要压缩增强 + 向量检索 | - |
| 上下文压缩 | ✅ | - | - |
| 变更历史 / 备份恢复 | ✅ UI | 后端版本库 | workspace 整包迁移 |
| 统一日志 | ✅ UI | 真实链路落盘联调 | 分布式追踪 |
| Design Tokens / 主题 | ✅ | 多品牌预设 | - |
| 多 Agent 协作 | - | ✅ | - |
| 安全加固 | ✅ 密钥/沙箱/路径 | ✅ Bearer Token | Docker 隔离 / 多用户 |
| 前后端 mock 替换 | ✅ | - | - |

---

## 四、非功能性需求

### NA-1 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首字响应时间 | < 3 秒 | 用户发送消息到 SSE 首字输出 |
| 工具执行超时 | 60 秒 | 单次工具/命令最大时长 |
| Agent Loop 轮次上限 | 50 轮 | 防止无限循环 |
| 单会话最大消息数 | 1000 条 | 超过后提示新建会话 |
| JSONL 文件最大尺寸 | 50MB | 超过后提示归档或新建 |
| 并发会话数 | 10 | 单实例最大活跃会话 |
| 前端列表首屏 | < 1 秒 | mock / 本地数据场景下可交互 |

### NA-2 可用性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| SSE 心跳间隔 | 15 秒 | 保持连接活跃 |
| 会话恢复 | JSONL 重放 | 断线后恢复已完成交互 |
| 错误恢复 | 工具失败不阻断 | 错误回传模型，由 Agent 决策 |
| 配置误操作恢复 | 历史回滚 + 备份导入 | 最多 30 条配置历史 |
| 数据持久化 | 即时写入 | 交互事件即时 JSONL 追加 |

### NA-3 安全性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| API 密钥存储 | OS 密钥链 | 不明文落盘；前端不导出明文密钥 |
| 命令执行 | 黑名单 + 超时 + 目录限制 | 多层防护 |
| 文件路径 | workspace 内 | 防路径穿越 |
| ZIP 导入 | Zip Slip + 大小限制 | 防解压攻击 |
| 连接器凭证 | 本地 workspace | 脱敏导出，替换导入前二次确认 |
| 认证 | P0 单用户；P1 Bearer Token | 对外暴露时启用 |

### NA-4 可维护性

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 代码规范 | Python PEP 8；前端 ESLint + Prettier | 统一风格 |
| 设计系统 | tokens.css + 主题变量 | 禁止硬编码散落色值 |
| 日志级别 | DEBUG/INFO/WARNING/ERROR | 后端结构化日志 |
| 配置管理 | JSON 文件 + 环境变量 | 敏感配置走密钥链/环境变量 |
| 文档 | FastAPI /docs + 本 PRD | 需求与接口可追溯 |

---

## 五、详细需求描述（EARS 原则）

### 5.1 项目基础设施与控制台壳层

> **[Ubiquitous]** 系统应包含三个顶层目录：`frontend/`、`backend/`、`workspace/`。

> **[Ubiquitous]** 前端应基于 TanStack Start / TanStack Router，采用左侧可折叠侧边栏 + 右侧内容区布局。

> **[Ubiquitous]** 侧边栏应分为「工作台」与「洞察」两组，菜单项与路由如下：
> - 工作台：对话 `/`、Agent `/agents`、模型 `/models`、工具 `/tools`、Skills `/skills`、连接器 `/connectors`
> - 洞察：记忆 `/memory`、历史 `/history`、日志 `/logs`、Tokens `/tokens`、设置 `/settings`

> **[Ubiquitous]** 所有界面文字应使用简体中文。

> **[Ubiquitous]** 视觉体系应基于 Design Tokens（颜色、圆角、阴影、字体），支持浅色 / 深色 / 跟随系统，并支持强调色（品牌色）全局生效。

> **[Event-driven]** When 用户点击左侧菜单，then 右侧主内容区切换到对应页面，并保持当前激活态高亮。

> **[Ubiquitous]** 连接器存在异常健康状态时，侧边栏「连接器」菜单应展示异常角标/红点提示。

---

### 5.2 对话页 `/`

#### 5.2.1 布局

> **[Ubiquitous]** 对话页应包含：
> - 左侧：历史会话列表面板（搜索 + 新建）
> - 右侧：消息区 + 输入区（Agent 选择、附件、Skills/工具选择、发送）

#### 5.2.2 会话管理

> **[Event-driven]** When 用户点击新建对话，the system shall 创建会话并置于列表顶部，自动选中，消息区清空。

> **[Event-driven]** When 用户在搜索框输入关键词，the system shall 过滤会话标题。

> **[Event-driven]** When 用户切换历史会话，the system shall 还原该会话消息与执行过程（后端联调后从 JSONL 读取）。

> **[Event-driven]** When 用户删除会话，the system shall 二次确认后删除会话记录及其 outputs（后端联调后同步删除文件）。

#### 5.2.3 发送与交互

> **[Ubiquitous]** 输入区支持多行文本；`Shift+Enter` 换行，主按钮发送。

> **[Ubiquitous]** 发送前允许选择本轮启用的 Skills 与工具（仅展示已启用项）。

> **[Ubiquitous]** 支持文本/代码附件上传；单文件限制 5MB（前端先校验，后端再校验）。

> **[Ubiquitous]** 用户消息右对齐，Agent 消息左对齐；Agent 回复支持 Markdown 渲染。

> **[Ubiquitous]** Agent 回复应 SSE 流式输出；服务端 15s 心跳；断线后保留已落盘内容。

> **[State-driven]** While Agent 正在回复，发送应禁用或进入排队策略（P0：禁用）。

> **[Event-driven]** When Agent 调用工具/技能，the system shall 以可折叠卡片展示名称、参数与结果。

---

### 5.3 Agent 管理 `/agents`

> **[Event-driven]** When 用户进入页面，the system shall 展示 Agent 列表（名称、描述、标签、工具数、Skills 数、模型）。

> **[Ubiquitous]** 系统内置「主 Agent」，不可删除；支持复制（clone）生成新 Agent。

> **[Event-driven]** When 用户新建/编辑 Agent，the system shall 打开对话框，字段包括：
> - 名称、slug、描述
> - 系统提示词
> - 默认模型
> - 标签
> - 可用工具（多选）
> - 启用 Skills（多选）

> **[Event-driven]** When 保存失败（校验不通过），the system shall 展示字段级错误与修复建议。

> **[Event-driven]** When 用户删除非系统 Agent，the system shall 二次确认后删除，并写入变更历史。

---

### 5.4 模型管理 `/models`

> **[Event-driven]** When 用户进入页面，the system shall 展示模型列表与统计卡片（总数 / 健康 / 异常）。

> **[Ubiquitous]** 支持筛选：全部、正常、异常、未测试、默认；支持搜索名称 / 供应商 / model id；支持排序。

> **[Event-driven]** When 用户新增/编辑模型，表单字段应包含：
> - 显示名称
> - 供应商
> - Base URL（OpenAI 兼容，建议 `https://`）
> - Model ID
> - API Key（仅本地保存，不随普通配置明文导出）
> - 上下文长度

> **[Event-driven]** When 用户点击测试连接 / 一键测试，the system shall 返回成功/失败、延迟与详情，并更新健康状态。

> **[Event-driven]** When 用户设为默认，the system shall 保证仅一个默认模型，并记录变更历史。

> **[Ubiquitous]** 后端持久化时，API 密钥写入 OS 密钥链，`models.json` 仅存引用；密钥链不可用时降级为环境变量引用。

---

### 5.5 工具管理 `/tools`

> **[Ubiquitous]** 系统内置且仅包含三个工具，不可新增/删除：
> - `read_file`：读取文件
> - `write_file`：写入/创建文件
> - `execute_command`：执行命令行

> **[Event-driven]** When 用户进入页面，the system shall 展示工具列表、启用状态、描述与连接器绑定信息。

> **[Event-driven]** When 用户切换启用状态，the system shall 立即生效；禁用工具不得出现在 Agent 可勾选列表与对话发送前选择器中。

> **[Event-driven]** When 用户编辑工具，the system shall 允许修改显示名称与描述（key 不变）。

> **[Event-driven]** When 用户执行自检 / 一键测试，the system shall 反馈延迟与结果详情。

> **[Ubiquitous]** 工具可绑定连接器，用于标识外部系统依赖（展示徽标，供后续执行路由使用）。

> **[Ubiquitous]** `save_memory` / `search_memory` / `delegate_task` 为系统内置能力，不在工具页展示，不可禁用。

#### 安全限制（后端强制）

> **[Ubiquitous]** 文件类工具路径必须 `resolve` 后位于 `workspace/` 内，拒绝 `..` 与符号链接逃逸。

> **[Ubiquitous]** `execute_command` 应具备：命令黑名单、60s 超时、工作目录限制、输出 100KB 截断、敏感环境变量隔离。

> **[Ubiquitous]** `write_file` 单次写入上限 10MB。

---

### 5.6 Skills 管理 `/skills`

> **[Event-driven]** When 用户进入页面，the system shall 展示 Skills 列表（名称、描述、来源、文件数、启用状态）。

> **[Ubiquitous]** 筛选维度：全部 / 已启用 / 内置 / 自建 / 导入；支持搜索与排序。

> **[Event-driven]** When 用户新增/编辑 Skill，表单应包含名称、slug、描述、默认启用，并可配置连接器绑定。

> **[Event-driven]** When 用户 ZIP 导入，the system shall 校验扩展名与大小；前端交互按单包不超过 20MB 提示，后端仍执行 Zip Slip 与解压总量限制（建议保持 50MB / 解压 200MB 防护阈值，前后端口径在实现时统一）。

> **[Event-driven]** When 用户点击扫描，the system shall 扫描 `workspace/config/skills/` 发现未注册技能包。

> **[Unwanted]** If 技能缺少 `SKILL.md`，then 标记无效并提示。

---

### 5.7 连接器 `/connectors`

> **[Ubiquitous]** 支持四类连接器：
> - 飞书（Lark）
> - 钉钉（DingTalk）
> - 企业微信（WeCom）
> - 自定义 Webhook

> **[Event-driven]** When 用户新建/编辑连接器，the system shall 按类型展示差异化字段（AppId/AppSecret、AgentId、Webhook URL、加签、scope 等）。

> **[Event-driven]** When 用户执行连通性测试，the system shall 返回分步结果与延迟，并更新健康状态（连通 / 待验证 / 异常 / 未测试）。

> **[Ubiquitous]** 应支持健康巡检：轮询间隔、状态变化通知、单连接器静音 30 分钟。

> **[Event-driven]** When 用户打开 Webhook 事件预览，the system shall 支持：
> - 签名模式模拟（有效 / 篡改 / 缺失 / 过期）
> - 请求体编辑与发送
> - 历史重放
> - JSON / Markdown 导出

> **[Event-driven]** When 用户导出/导入连接器，the system shall 支持范围（全部 / 当前筛选）与模式（合并 / 追加 / 替换）；替换需二次确认；脱敏字段避免覆盖本地密钥。

> **[Ubiquitous]** 凭证仅保存在本地 workspace，列表中密钥默认脱敏展示。

---

### 5.8 记忆 `/memory`

> **[Ubiquitous]** 记忆页应展示：
> - 长期记忆摘要列表与占用进度
> - 短期记忆按天条目
> - 压缩阈值提示（窗口 75% 触发；保留最近约 10% 原始消息）

> **[Event-driven]** When 用户点击编辑长期记忆，the system shall 进入可编辑态（后端联调后读写 `workspace/memory.md`）。

> **[Ubiquitous]** 后端规则保持：
> - 长期记忆：`workspace/memory.md`，上限 50KB，超额摘要压缩
> - 短期记忆：`workspace/memory/YYYY-MM-DD.md`，7 天后归档到 `archive/`
> - `save_memory` / `search_memory` 全 Agent 可用

---

### 5.9 变更历史 `/history`

> **[Ubiquitous]** 历史页按实体 Tab 展示：模型 / 工具 / Skills / Agent。

> **[Ubiquitous]** 每条记录包含时间、操作标签、摘要；最多保留最近 30 条。

> **[Event-driven]** When 用户点击回滚，the system shall 恢复到对应快照，并新增一条回滚历史。

> **[Event-driven]** When 用户清空历史，the system shall 在确认后清空对应实体历史。

> **[Ubiquitous]** 配置类写操作（新增/编辑/删除/启停/设默认/测试结论等）应尽量写入历史，保证可追溯。

---

### 5.10 日志 `/logs`

> **[Ubiquitous]** 日志为统一入口，不再拆分“执行日志 / 模型日志”两个一级菜单。

> **[Ubiquitous]** 支持按类型查看 Agent 执行、模型调用、工具、技能等结构化事件。

> **[Ubiquitous]** 筛选维度至少包括：关键词、时间范围（15m/1h/6h/24h/7d）、级别（info/warn/error）、状态（成功/失败）。

> **[Event-driven]** When 用户点击日志行，the system shall 打开详情侧栏，展示时间、Agent、耗时、输入、输出，并支持复制与单段下载。

> **[Event-driven]** When 用户导出，the system shall 将当前筛选结果打包为 ZIP。

> **[Event-driven]** When 用户刷新，the system shall 重新加载最新日志数据。

---

### 5.11 Tokens 预览 `/tokens`

> **[Ubiquitous]** Tokens 页用于预览 `tokens.css` 中的颜色、圆角、阴影、字体等设计令牌。

> **[Event-driven]** When 用户点击令牌，the system shall 支持复制变量名或取值，便于设计与开发协作。

> **[Ubiquitous]** 页面应跟随当前主题（浅/深）实时刷新展示。

---

### 5.12 设置 `/settings`

> **[Ubiquitous]** 设置页至少包含以下区块：
> 1. 外观主题（浅色 / 深色 / 跟随系统）
> 2. 强调色 / 品牌色（预设 + 自定义 HEX）
> 3. 备份与恢复（导出 JSON；导入支持合并 / 替换）
> 4. Workspace 目录说明
> 5. 安全开关说明（命令沙箱、路径越权校验、Bearer Token(P1)）
> 6. API 密钥存储说明
> 7. 源代码 / License 信息

> **[Event-driven]** When 用户恢复备份，the system shall 先预览再确认；替换模式需明确风险提示。

---

### 5.13 Agent 执行引擎（后端）

> **[Event-driven]** When 用户发送消息，the system shall 组装：Agent 系统提示词、工具 schema、Skills 描述、记忆、压缩后上下文，并请求模型。

> **[Event-driven]** When 模型返回 tool/skill 调用，the system shall 执行后把结果回灌模型，循环直至无调用或达到 50 轮。

> **[Ubiquitous]** 超过 50 轮应保存中间结果到 outputs，生成进度摘要并提示用户。

> **[Ubiquitous]** 会话写入 `workspace/conversations/{id}/{id}.jsonl`，原子写入 + filelock。

> **[Ubiquitous]** SSE 心跳 15 秒；工具失败不自动重试，错误回传 Agent 决策。

---

### 5.14 上下文压缩（后端）

> **[Event-driven]** When 会话 token 超过模型上下文窗口 75%，the system shall 触发压缩。

> **[Ubiquitous]** 使用 tiktoken（`cl100k_base`）估算；保留最近约 10% 原始消息；摘要含目标/进度/状态/下一步；质量自检最多重试 2 次。

> **[Ubiquitous]** 原始消息不删除，仅追加 `context_compression` 记录；后续仅使用最新压缩点之后上下文。

---

### 5.15 多 Agent 协作（P1）

> **[Ubiquitous]** 通过 `delegate_task` 编排子 Agent；子 Agent 权限不超过父 Agent；禁止递归委派（max depth = 1）；可并行执行；前端可折叠展示。

---

## 六、数据流与接口设计

### 6.1 后端 API 路由（目标）

| 方法 | 路径 | 说明 |
|------|------|------|
| **模型** |||
| GET | `/api/models` | 模型列表 |
| POST | `/api/models` | 新增模型 |
| PUT | `/api/models/{id}` | 修改模型 |
| DELETE | `/api/models/{id}` | 删除模型 |
| POST | `/api/models/{id}/test` | 连接测试 |
| PUT | `/api/models/{id}/default` | 设为默认 |
| **工具** |||
| GET | `/api/tools` | 工具列表 |
| PUT | `/api/tools/{name}` | 更新显示名/描述/绑定 |
| PUT | `/api/tools/{name}/toggle` | 启停 |
| POST | `/api/tools/{name}/test` | 自检 |
| **Skills** |||
| GET/POST | `/api/skills` | 列表 / 新增 |
| PUT/DELETE | `/api/skills/{id}` | 修改 / 删除 |
| POST | `/api/skills/import` | ZIP 导入 |
| POST | `/api/skills/scan` | 扫描发现 |
| **Agent** |||
| GET/POST | `/api/agents` | 列表 / 新增 |
| GET/PUT/DELETE | `/api/agents/{id}` | 详情 / 修改 / 删除 |
| POST | `/api/agents/{id}/clone` | 复制 |
| **连接器** |||
| GET/POST | `/api/connectors` | 列表 / 新增 |
| PUT/DELETE | `/api/connectors/{id}` | 修改 / 删除 |
| POST | `/api/connectors/{id}/test` | 连通性测试 |
| GET | `/api/connectors/health` | 健康状态 |
| POST | `/api/connectors/import` | 导入 |
| GET | `/api/connectors/export` | 导出 |
| **对话** |||
| GET/POST | `/api/conversations` | 列表 / 创建 |
| GET/PUT/DELETE | `/api/conversations/{id}` | 详情 / 重命名 / 删除 |
| GET | `/api/conversations/search` | 搜索 |
| POST | `/api/chat/send` | SSE 发送消息 |
| POST | `/api/chat/upload` | 上传附件 |
| GET | `/api/conversations/{id}/outputs` | 输出文件 |
| **记忆** |||
| GET/PUT | `/api/memory/long-term` | 长期记忆读写 |
| GET | `/api/memory/short-term` | 短期记忆 |
| **历史** |||
| GET | `/api/history/{entity}` | 配置历史 |
| POST | `/api/history/{entity}/rollback` | 回滚 |
| DELETE | `/api/history/{entity}` | 清空 |
| **日志** |||
| GET | `/api/logs` | 统一日志查询 |
| GET | `/api/logs/export` | 导出 |
| **设置 / 备份** |||
| GET/POST | `/api/backup` | 导出 / 恢复配置 |

### 6.2 核心对话数据流

```
用户在对话页发送消息（可选 Skills/工具/附件）
    ↓
读取 Agent 配置（系统提示词 + 工具 + Skills + 默认模型）
    ↓
读取长期记忆 + 组装 Memory 规则
    ↓
构建上下文（最新压缩摘要 + 后续原始消息）
    ↓
调用模型（baseUrl + apiKey + modelId）
    ↓
┌─ 无工具调用 → SSE 流式输出 → 写 JSONL → 写日志
└─ 有工具/技能调用 → 执行 → 写 JSONL/日志 → 回灌模型（≤50 轮）
    ↓
最终回复落盘；输出文件刷新；可观测日志可查
```

### 6.3 前端状态流（当前）

```
React 页面
  → mock-store / mock-test / localStorage（UI 原型）
  → 逐步迁移到 lib/api + Vite/TanStack 代理
  → FastAPI /api/*
  → workspace 文件存储
```

---

## 七、技术方案概要

### 7.1 后端技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| Web 框架 | FastAPI + uvicorn | 异步、SSE、OpenAPI |
| 包管理 | uv | Python 依赖 |
| LLM 客户端 | httpx | OpenAI 兼容 API |
| 存储 | JSON / JSONL / Markdown | 无数据库 |
| Token 计数 | tiktoken | cl100k_base |
| 并发控制 | filelock | 会话写入串行化 |
| 密钥 | keyring | OS 密钥链 |
| 安全 | 黑名单 + 路径校验 + Zip Slip | P0 强制 |

### 7.2 前端技术栈（对齐当前实现）

| 组件 | 选型 | 说明 |
|------|------|------|
| 框架 | React 19 + TanStack Start | 文件路由 / SSR 能力 |
| 路由 | TanStack Router | `src/routes/*` |
| 构建 | Vite 8 | 开发与构建 |
| UI | shadcn/ui + Radix | 组件体系 |
| 样式 | Tailwind CSS 4 + tokens.css | 设计令牌 |
| 图标 | lucide-react | 统一图标 |
| 状态 | 本地 store（过渡）→ 服务端 API | 先 UI 后联调 |
| 反馈 | sonner | Toast |
| 导出 | jszip 等 | 日志/备份导出 |

### 7.3 关键页面文件映射

| 页面 | 路由文件 |
|------|----------|
| 对话 | `frontend/src/routes/index.tsx` |
| Agent | `frontend/src/routes/agents.tsx` |
| 模型 | `frontend/src/routes/models.tsx` |
| 工具 | `frontend/src/routes/tools.tsx` |
| Skills | `frontend/src/routes/skills.tsx` |
| 连接器 | `frontend/src/routes/connectors.tsx` |
| 记忆 | `frontend/src/routes/memory.tsx` |
| 历史 | `frontend/src/routes/history.tsx` |
| 日志 | `frontend/src/routes/logs.tsx` |
| Tokens | `frontend/src/routes/tokens.tsx` |
| 设置 | `frontend/src/routes/settings.tsx` |
| 壳层布局 | `frontend/src/routes/__root.tsx` + `components/app-sidebar.tsx` |

---

## 八、验收标准

### 8.1 控制台壳层
- [ ] 侧边栏工作台/洞察分组正确
- [ ] 11 个路由均可访问且激活态正确
- [ ] 浅/深色与强调色切换生效
- [ ] 全部可见文案为简体中文

### 8.2 对话
- [ ] 新建/切换/搜索会话正常
- [ ] Agent 切换正常
- [ ] 附件上传校验正常
- [ ] Skills/工具选择器仅展示已启用项
- [ ] 流式输出、思考态、工具卡片展示正常（联调后）

### 8.3 Agent
- [ ] 列表搜索/排序正常
- [ ] 新建/编辑对话框字段完整
- [ ] 主 Agent 不可删除，复制可用
- [ ] 工具与 Skills 勾选生效

### 8.4 模型
- [ ] CRUD 正常
- [ ] 默认模型唯一
- [ ] 连接测试与批量测试有结果反馈
- [ ] 筛选（正常/异常/未测试/默认）正确
- [ ] 密钥不落明文配置文件（后端）

### 8.5 工具
- [ ] 仅三工具且不可增删
- [ ] 启停、编辑、自检、连接器绑定可用
- [ ] 后端安全限制生效

### 8.6 Skills
- [ ] 新增/编辑/删除/启停正常
- [ ] ZIP 导入与扫描可用
- [ ] 来源筛选正确
- [ ] 无效技能（缺 SKILL.md）有提示

### 8.7 连接器
- [ ] 四类型创建与编辑正常
- [ ] 连通性测试与健康状态展示正常
- [ ] Webhook 事件预览/重放/导出可用
- [ ] 导入导出模式正确，密钥脱敏

### 8.8 记忆 / 历史 / 日志 / 设置
- [ ] 记忆页展示长期/短期与占用
- [ ] 历史可回滚且最多 30 条
- [ ] 日志筛选、详情、导出可用
- [ ] 设置可备份恢复主题与配置

### 8.9 后端核心
- [ ] Agent Loop ≤ 50 轮
- [ ] SSE 心跳与断线恢复
- [ ] JSONL 原子写入 + filelock
- [ ] 上下文 75% 压缩
- [ ] 记忆注入与 save/search 工具

---

## 九、边界场景与异常处理

| 场景 | 处理方式 |
|------|----------|
| 模型 API 不可用 | 页面展示错误，不阻塞其它配置操作 |
| 连接测试失败 | 标记异常状态，允许继续编辑保存 |
| 工具执行超时 | 60s 终止并回传超时错误 |
| 危险命令 | 黑名单拦截 |
| 路径穿越 | resolve + workspace 前缀校验 |
| ZIP 导入超限/路径穿越 | 中止并清理 |
| 删除主 Agent | 拒绝并提示 |
| 配置误改 | 历史回滚或备份恢复 |
| 连接器密钥导出 | 脱敏；合并导入保留本地密钥 |
| SSE 中断 | 已落盘数据可恢复，未完成轮次不自动续跑 |
| 达到 50 轮 | 保存中间产物并提示 |
| mock 与真实 API 不一致 | 联调阶段以后端契约为准，逐步替换 mock |

---

## 十、数据指标（建议）

| 指标 | 说明 |
|------|------|
| 会话创建数 / 消息数 | 使用活跃度 |
| Agent / 模型 / 工具 / Skill 调用次数 | 能力使用分布 |
| 连接器测试成功率 | 集成健康度 |
| 平均首字时延 | 体验指标 |
| Token 消耗 | 成本 |
| 压缩触发次数 | 长任务占比 |
| 配置回滚次数 | 误操作与可恢复性 |
| 日志导出次数 | 排障行为 |

---

## 十一、已确认问题与遗留问题

### 已确认

1. **前端 IA 以当前 Lovable 导出为准**：连接器、历史、设置、Tokens、统一日志进入正式需求，不再视为“纯远期脑暴”。
2. **P0 安全能力不降级**：密钥链、命令沙箱、路径校验、Zip Slip 仍是上线前提。
3. **主 Agent 不可删除**；工具集固定三元组。
4. **当前前端允许 mock 驱动 UI 验收**，但发布前需完成关键路径的真实 API 替换。

### 遗留问题

1. **Skills 描述注入膨胀**：是否改为按需加载（仅名称/触发条件，调用时再拉详情）？
2. **ZIP 大小前后端口径**：UI 当前按 20MB 提示，后端原 PRD 为 50MB/200MB，需统一产品阈值。
3. **连接器事件如何驱动 Agent**：Webhook 入站后是仅可观测，还是自动创建对话/任务？
4. **变更历史持久化位置**：仅浏览器 localStorage，还是写入 workspace 供多端一致？
5. **对话页输出文件面板**：后端已有 outputs 设计，前端需在联调时补齐可视化优先级。
6. **多用户与鉴权**：P1 Bearer Token 的密钥分发与轮换策略待定。

---

## 十二、实施建议（基于现状）

1. **先冻结 IA 与页面验收标准**（本 PRD v1.2）  
2. **按页面替换 mock → API**：模型 / 工具 / Skills / Agent → 对话 SSE → 日志/记忆/历史 → 连接器  
3. **连接器后端补齐**与前端健康巡检、导入导出协议对齐  
4. **补 E2E**：侧边栏导航、模型测试、对话发送、配置回滚、日志导出  
5. **安全回归**：密钥、命令黑名单、路径穿越、ZIP 导入

---

> 📌 **提醒**
> - 本文档 v1.2 已按当前 `frontend/src/routes/*` 实现校正
> - Ralph 历史 `prd.json`（US-001~US-023）仍可作为 P0 后端故事归档；新的前端增量需求应以本文档为准拆分迭代
> - UI 已领先于部分后端接口时，开发顺序应为“契约先行 + 分页面置换 mock”，避免双轨逻辑长期分叉
