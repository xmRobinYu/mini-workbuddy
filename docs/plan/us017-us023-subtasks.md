# US-017 ~ US-023 细化拆分文档（面向初级开发，30 分钟级小闭环）

> 本文档把 `prd.json` 中剩余 7 个 story（US-017 ~ US-023）拆成更细的 sub-task。
> 每条 sub-task 满足：**30 分钟左右可完成 / 独立小闭环 / 明确验收标准**。
> Ralph 仍按 `prd.json` 中的父 story（US-017 ~ US-023）调度；本文档供人工 / agent 逐条执行。

> 交付物约定：
> - 后端代码改动后必须通过：`cd backend && uv run mypy app && uv run pytest`
> - 前端代码改动后必须通过：`cd frontend && npm run typecheck && npm run lint`
> - 涉及 UI 行为的 sub-task 用 agent-browser 实操验证（复用已在运行的 5181 前端 + 8000 后端）
> - 工作目录：`/home/ubuntu/code-work/mini-workbuddy`
> - 现状基线（已确认）：US-001~US-016 通过；`agent_loop.py` / `conversations_store.py` / `sse_events.py` / 前端 `ChatPage.tsx`+`api.ts` 已实现 US-016 的 SSE 端点与前端流式接收骨架。

---

## 关键现状速查（动代码前必读）

| 关注点 | 现状 | 文件:行 |
|--------|------|---------|
| Agent Loop 主循环 | 已实现：流式调用模型、工具 delta 合并、3 个内置工具分发、50 轮计数、事件落 JSONL | `backend/app/services/agent_loop.py:268` `run_agent_loop` |
| `thinking` 事件 | `sse_events.thinking_event` 已定义，但 `agent_loop` **从不发射** | `sse_events.py:45` / `agent_loop.py:405`(只发 content) |
| 系统提示词组装 | 仅 `agent.md + outputs 路径说明`，无 memory 注入，`{conversation_id}` 占位未替换 | `agent_loop.py:222` `_system_prompt` |
| JSONL 写入 | filelock 已有；**非原子**（直接 append，无 tmp+rename）；事件无 `reasoning` 字段 | `conversations_store.py:254` `append_event` |
| 50 轮降级 | 只发 `done(note)`，**不存 outputs/、不生成进度摘要** | `agent_loop.py:367-373` |
| 记忆工具 | **完全缺失**，无 `memory.md`、无 save/search_memory、无注入 | — |
| 前端 SSE 接收 | `api.ts:streamSse` + `ChatPage.handleSseEvent` 已处理 6 类事件；`sse.ts` 是**未使用的死代码**；`done.note` 未展示给用户 | `api.ts:89` / `ChatPage.tsx:806` / `sse.ts` |
| 技能(skill) | `skills/` 目录空、无 skills API、`agent.skills` 恒为 `[]`；US-009/010 仅有占位 Tab | — |
| 工具启用态陷阱 | `workspace/config/tools.json` 不被测试 reset 清理，测试须显式 `tools_store.reset_for_test()` | progress.txt Codebase Patterns |

---

## 拆分总览

| 父 Story | Sub-task 数 | 主题 |
|----------|------------|------|
| US-017 前端 SSE 接收与工具过程展示 | 4 | 死代码清理 / thinking 渲染闭环 / done.note 提示 / agent-browser 实测 |
| US-018 系统提示词动态组装 | 3 | outputs 路径修复 / memory.md 注入 / memory 规则注入 |
| US-019 JSONL 原子写入与并发控制 | 3 | 原子 append / reasoning 字段 / 并发测试 |
| US-020 Agent Loop 主循环与工具调用分发 | 4 | thinking 事件发射 / 工具失败回传测试 / 技能分发骨架 / 循环单测 |
| US-021 50 轮上限降级策略 | 3 | outputs 中间结果保存 / 进度摘要生成 / 降级 UI 提示 |
| US-022 长期记忆内置工具与自动注入 | 4 | save_memory / search_memory / 隐藏+不可禁用 / 自动注入接通 |
| US-023 P0 闭环集成验证 | 2 | mock 模型端到端 / agent-browser 真实闭环 |

执行顺序建议：US-019 → US-018 → US-022 → US-020 → US-021 → US-017 → US-023（后端先行，前端最后接通验证）。

---

# US-017 前端 SSE 流式接收与工具执行过程展示

> 父 story AC（prd.json）：前端接收 SSE、content 逐字流式、thinking 可折叠、tool_call 卡片含参数、tool_result 在卡片下方、长结果折叠/展开、消息按时间顺序、断连从 JSONL 恢复、agent-browser 实测。

## US-017-A 清理重复的 SSE 实现（死代码移除）
**目标**：工作树里 `frontend/src/lib/sse.ts`（`streamChatEvents`）与 `frontend/src/lib/api.ts`（`streamSse`）是两套等价实现，`ChatPage` 实际只用 `api.ts` 的。删除未使用的 `sse.ts`，消除歧义。
**改文件**：删除 `frontend/src/lib/sse.ts`。
**验收标准**：
1. `frontend/src/lib/sse.ts` 文件不存在。
2. 全仓搜索无 `from '@/lib/sse'` 或 `from './sse'` 引用（`grep -rn "lib/sse" frontend/src` 无输出）。
3. `cd frontend && npm run typecheck` 通过、`npm run lint` 通过。
4. `cd frontend && npm run build` 成功。
**闭环**：一次删除 + 类型检查，无需启动服务。

## US-017-B 前端 thinking 渲染历史恢复闭环
**目标**：前端流式区已能渲染实时 `thinking`；但历史会话从 JSONL 还原时（`loadDetail` → `detail.events` 渲染分支），persisted `thinking` 事件没有渲染分支。补齐历史 thinking 渲染，使刷新后仍可见中间思考（与最终回复视觉区分）。
**改文件**：`frontend/src/pages/ChatPage.tsx` 历史事件渲染块（约 `1090-1199`）：新增对 `event.role === 'assistant' && event.type === 'thinking'`（或后端 US-020-B 约定的 thinking 持久事件 shape）的渲染分支，用 `CollapsibleBlock` 展示。
**前置依赖**：后端 US-020-B 已把中间轮文本持久化为 thinking 事件（否则无数据可恢复）。
**验收标准**：
1. 历史渲染路径能识别并渲染 persisted thinking 事件为可折叠区，标题"Agent 思考中…"。
2. `cd frontend && npm run typecheck && npm run lint` 通过。
3. agent-browser：发一条会触发工具调用的消息 → 等流结束 → 刷新页面 → 点回该会话 → 可见 thinking 折叠区与最终回复气泡同时存在。
**闭环**：前端单文件渲染分支 + 浏览器实测。

## US-017-C done 事件 note 提示给用户
**目标**：后端 `done_event(note)` 携带的 `note`（如 50 轮降级提示）目前前端 `done` 分支是 no-op，用户看不到。把 `note` 以非阻塞提示展示。
**改文件**：`frontend/src/pages/ChatPage.tsx` `handleSseEvent` 的 `case 'done'`：读取 `data.note`，非空则以暖色 info 横幅（区别于红色 error）展示。
**验收标准**：
1. `done` 事件携带 `note` 时，聊天区出现暖色提示横幅（不是红色错误条）。
2. `done` 无 `note` 时不出现任何横幅（回归不破坏正常流）。
3. `cd frontend && npm run typecheck && npm run lint` 通过。
4. agent-browser：手动触发降级（或 mock 一个带 note 的 done）→ 确认横幅出现。
**闭环**：前端单分支 + 浏览器实测。

## US-017-D agent-browser 实测：流式输出 + 工具卡片 + 断连恢复
**目标**：覆盖父 story 剩余 AC——逐字流式、tool_call 卡片含参数、tool_result 在卡片下方、长结果折叠、断连从 JSONL 恢复。
**前置依赖**：US-017-A/B/C 完成，且有一个可用的模型（真实或 mock）能产生工具调用。
**验收标准（agent-browser 实操，每步截图到 `screenshots/`）**：
1. 打开 `http://localhost:5181/chat`，选会话 + 选一个启用了 read_file 的 Agent。
2. 发送"请读取 workspace/note.md"→ 确认 content 逐字流式出现在 Agent 气泡。
3. 确认出现 tool_call 卡片，显示工具名 `read_file` 与参数 `{"path":"..."}`。
4. 确认 tool_result 显示在卡片下方（含文件内容）。
5. 触发一个长结果（读一个大文件）→ 确认结果区可折叠/展开。
6. 发送中途刷新页面（模拟断连）→ 点回该会话 → 确认对话（含工具卡片+结果）从 JSONL 完整恢复。
7. `cd frontend && npm run typecheck && npm run lint` 通过。
**闭环**：纯验证条，无新代码（除非发现 bug 回补）。

---

# US-018 系统提示词动态组装

> 父 story AC：组装含 agent.md + 长期记忆(memory.md) + Memory 使用规则 + 文件写入路径说明；记忆以 `# Long-term Memory` 注入；memory.md 不存在按空处理不报错；规则含 save/search_memory 调用时机与写入/检索原则；规则中路径替换为真实 workspace 绝对路径；outputs 路径自动拼接绝对路径；单测覆盖（含记忆/无记忆/空文件）。

## US-018-A 修复 outputs 路径占位 + 落到独立 prompt_builder 模块
**目标**：当前 `_system_prompt` 把 `{conversation_id}` 当字面量留在提示词里，模型看到的是占位符。新建 `backend/app/services/prompt_builder.py`，把系统提示词组装抽出来，并把真实 `conversation_id` 代入 outputs 路径。
**改文件**：
- 新建 `backend/app/services/prompt_builder.py`，函数 `build_system_prompt(agent_md: str, conversation_id: str) -> str`，内部组装 `agent.md` + 文件写入路径说明（outputs 绝对路径用真实 conversation_id）。
- `backend/app/services/agent_loop.py`：删除 `_system_prompt`，改 import 调用 `build_system_prompt(agent_md, conversation_id)`。
**验收标准**：
1. `build_system_prompt` 返回的字符串中 outputs 路径为真实 `workspace/conversations/<真实id>/outputs` 绝对路径，不再出现 `{conversation_id}` 字面量。
2. 新建 `backend/tests/test_prompt_builder.py`：断言 outputs 路径含传入的 conversation_id、断言 agent.md 内容被包含。
3. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：纯后端 + 单测，不依赖模型。

## US-018-B 注入长期记忆 memory.md（含空/缺失容错）
**目标**：每次组装系统提示词时读取 `workspace/memory.md`，以 `# Long-term Memory` 段注入；文件不存在或为空按空处理不报错。
**改文件**：`backend/app/services/prompt_builder.py` 增 `load_long_term_memory() -> str`（读 `MEMORY_DIR / "memory.md"`，不存在/空返回 ""）；`build_system_prompt` 在 agent.md 之后、路径说明之前插入记忆段（空则不插该段）。
**验收标准**：
1. memory.md 存在且有内容时，系统提示词含 `# Long-term Memory` 标题及其内容。
2. memory.md 不存在时不报错，提示词中无该段。
3. memory.md 为空文件时同上（不报错、无该段）。
4. `test_prompt_builder.py` 新增 3 个用例覆盖上述三种情况（用 tmp_path 注入 MEMORY_DIR 或 monkeypatch）。
5. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端单文件 + 单测。

## US-018-C 注入 Memory 使用规则（路径替换为真实绝对路径）
**目标**：系统提示词注入 Memory 使用规则文本（save_memory/search_memory 调用时机、写入原则、检索原则），规则中出现的 `memory.md` / `memory/YYYY-MM-DD.md` 等路径替换为真实 workspace 绝对路径。
**改文件**：`prompt_builder.py` 增 `MEMORY_RULES_TEMPLATE`（含调用时机/写入/检索原则，路径用占位符），`build_system_prompt` 拼接时用 `MEMORY_DIR` 真实绝对路径替换占位。
**验收标准**：
1. 系统提示词含"Memory 使用规则"段，含 save_memory / search_memory 调用时机与写入/检索原则描述。
2. 规则文本中的记忆文件路径为真实 workspace 绝对路径（断言字符串含 `str(MEMORY_DIR / "memory.md")`）。
3. `test_prompt_builder.py` 新增用例断言规则段存在且路径为绝对路径。
4. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端单文件 + 单测。

---

# US-019 JSONL 原子写入与文件锁并发控制

> 父 story AC：原子写入（先写 `.tmp` 再 `os.rename`）；filelock 同会话串行、不同会话并行；任何交互事件立即追加；事件字段含 `role/type/timestamp/data/reasoning/tool_call_id`；单测覆盖原子写入/并发/多事件追加。

## US-019-A append_event 改为原子写入（tmp + rename）
**目标**：当前 `append_event` 直接 append 一行，崩溃可能产生半行。改为：在 filelock 内读取现有全部行 → 追加新事件行 → 写到 `{id}.jsonl.tmp` → `os.replace` 原子替换原文件。
**改文件**：`backend/app/services/conversations_store.py` `append_event`：在已有 filelock 块内，把"append 模式写一行"改为"读全部→拼接新行→写 tmp→os.replace"。
**验收标准**：
1. `append_event` 写入路径出现 `{id}.jsonl.tmp` 临时文件并最终 `os.replace` 替换（代码审查 + 单测断言 `.tmp` 不残留）。
2. 连续 append 多条后，JSONL 文件每行仍是完整 JSON、行数正确。
3. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
4. 既有"损坏行跳过"读取逻辑（`_read_events`）不受影响（新增 1 个用例：写一半损坏行仍被跳过）。
**闭环**：后端单函数 + 单测。注意：保留 filelock；不同会话并行性不因读改写而破坏（仍按会话各持各锁）。

## US-019-B 事件对象补 reasoning 字段
**目标**：父 AC 要求事件含 `reasoning` 字段。统一在 `append_event` 写入时保证字段齐全：对未携带 `reasoning` 的事件补 `reasoning: ""`（或 None），并让 agent_loop 在写 thinking 类事件时填入 reasoning 文本。
**改文件**：
- `conversations_store.append_event`：写入前若事件无 `reasoning` 键则补 `""`。
- `agent_loop.py`：写 assistant 中间轮（thinking）事件时填 `reasoning` 字段（配合 US-020-B）。
**验收标准**：
1. 任意 append 的事件 JSON 行含 `reasoning` 键。
2. `test_conversations_store`（或新增）断言 user/assistant/tool 事件落盘后均含 `reasoning` 字段。
3. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端 + 单测。

## US-019-C 并发写入单测（同会话串行 / 不同会话并行）
**目标**：用线程模拟并发，证明同一会话的多次 append 串行不丢行、不交错损坏；不同会话并发互不阻塞（用计时或并行完成判定）。
**改文件**：`backend/tests/test_conversations_store.py`（或新建）新增并发用例：用 `concurrent.futures.ThreadPoolExecutor` 对同一会话并发 append N 条 → 断言文件恰有 N 行且每行合法 JSON；对两个不同会话并发 append → 断言各自独立完整。
**验收标准**：
1. 同会话并发 append 100 条后，JSONL 恰 100 行、全部可解析、无交错半行。
2. 不同会话并发不互相阻塞（两会话各自写入完整）。
3. `cd backend && uv run pytest` 全绿。
**闭环**：纯测试条（前提 US-019-A 完成）。

---

# US-020 Agent Loop 主循环与工具调用分发

> 父 story AC：最大 50 轮循环；无工具调用→文本流式输出+落 JSONL；有工具调用→解析 tool/skill→执行→结果追加→再调模型；工具技能统一 tool_calls 结构、type 区分 tool/skill；失败错误作为工具结果回传模型不自动重试；中间轮文本作为"思考过程"流式展示（标注 Agent 思考中…）；禁用工具不出现在可用列表；单测覆盖循环/分发/失败。
> 现状：主循环、3 内置工具分发、禁用工具排除、失败回传已实现。缺：thinking 发射、skill 分发、type 区分、循环单测。

## US-020-A 中间轮 thinking 事件发射与持久化
**目标**：中间轮（有工具调用的轮）模型返回的文本作为 `thinking` 事件流式发射并落 JSONL（type=thinking / reasoning 字段），与最终轮 `content` 区分。
**改文件**：`backend/app/services/agent_loop.py`：当轮 `tool_calls_acc` 非空时，文本 delta 发 `thinking_event` 并在轮末把 thinking 文本以 `type:"thinking"` 事件 `append_event`（带 `reasoning`）；当轮无 tool_calls 时仍发 `content_event` 并落 `type:"message"`。
**验收标准**：
1. 两轮 mock（先 tool_call 后纯文本）→ SSE 先 thinking 后 content；JSONL 含一条 thinking 事件与一条最终 message。
2. `backend/tests/test_chat_send_api.py` 新增用例断言事件顺序与 JSONL thinking 记录。
3. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端 + 单测（与 US-017-B 前端渲染配对）。

## US-020-B 技能(skill)分发骨架与 type 区分
**目标**：让 Agent Loop 能识别并执行 skill 调用，`type` 字段区分 tool/skill。P0 范围：skills 来源为 `workspace/config/skills/<id>/SKILL.md`（最小 skill 注册：名称+描述+触发+一个可执行入口）；agent.skills 列表里的 skill id 进入可用列表。
**改文件**：
- 新建 `backend/app/services/skills_store.py`：`list_skills()` 扫描 `SKILLS_CONFIG_DIR` 读 `SKILL.md`；`get_skill(id)`；`is_skill_enabled`。
- 新建 `backend/app/api/skills.py` + 挂 router：最小 `GET /api/skills`（列表）、`POST /api/skills`（新建含 SKILL.md）、`PUT /api/skills/{id}/toggle`。
- `agent_loop._build_tool_definitions`：把 agent.skills 也注入 tools 数组（用 skill 描述）；`_execute_tool` 增加 skill 分支（按 type/name 路由到 skill 执行入口）。
- skill 执行：P0 最小实现为"读取 SKILL.md 中声明的命令并在 workspace 内执行"或"返回 SKILL.md 内容作为能力说明"——选其一并在 sub-task 描述里写死，避免歧义。
**验收标准**：
1. 新建一个 skill（含 SKILL.md）→ `GET /api/skills` 返回它；给某 agent 勾选该 skill → Agent Loop 请求的 tools 数组含该 skill。
2. mock 模型返回 skill 调用 → Agent Loop 按 type=skill 路由执行 → 返回结果回传模型。
3. `type` 字段在 tool_call/tool_result 事件中区分 tool/skill。
4. 新增 `test_skills_*` 与 agent_loop skill 分发单测。
5. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端新模块 + 单测。**注意**：此条工作量偏大，可再拆成 skills_store / skills API / agent_loop 接入 三个 30 分钟条；若时间紧，先做 skills_store+API 占位、agent_loop 仅识别 type 但 skill 执行返回"未实现"提示，保证 type 区分 AC 先过。

## US-020-C 工具失败回传 + 禁用工具排除 单测补全
**目标**：父 AC 要求"失败错误作为工具结果回传模型不自动重试""禁用工具不出现在可用列表"——代码已实现但需补足单测固化。
**改文件**：`backend/tests/test_chat_send_api.py` 补/确认用例：(1) 工具抛 SecurityBlockedError → tool_result ok=false 且错误信息回传、循环不再自动重试该工具；(2) 禁用某工具 → 请求 payload 的 tools 数组不含它。
**验收标准**：
1. 上述两用例存在并通过（注意测试 setup 显式 `tools_store.reset_for_test()`）。
2. `cd backend && uv run pytest` 全绿。
**闭环**：纯测试条。

## US-020-D 循环逻辑单测（无工具/有工具/多轮）
**目标**：父 AC"单测覆盖循环逻辑、工具分发、失败处理"。
**改文件**：`test_chat_send_api.py` 新增：无工具调用一轮即 done；单工具调用一轮后模型给最终文本即 done；多工具连续两轮后 done。
**验收标准**：
1. 三种循环路径单测存在并通过。
2. `cd backend && uv run pytest` 全绿。
**闭环**：纯测试条。

---

# US-021 Agent Loop 50 轮上限降级策略

> 父 story AC：达 50 轮强制终止；保存已完成中间结果到 outputs/；生成进度摘要（已完成/未完成步骤）；聊天界面提示"已达到最大循环次数，部分结果已保存"；SSE done 事件含降级提示；单测覆盖上限触发与降级。
> 现状：仅发 done(note)，不存 outputs、不生成摘要。

## US-021-A 达上限时保存中间结果到 outputs/
**目标**：达到 50 轮上限时，把当前会话已产生的关键中间结果（如已 write_file 的产出已自然在 outputs/；另把累积的 text_buf / tool 调用摘要）写入 `workspace/conversations/{id}/outputs/_degradation_summary.md`。
**改文件**：`backend/app/services/agent_loop.py` 50 轮分支：在发 done(note) 前，调 `file_io_store` 或直接写一个 `_degradation_summary.md` 到 outputs 目录，内容为"已完成步骤/未完成步骤"文本。
**验收标准**：
1. 触发 50 轮上限后，`workspace/conversations/{id}/outputs/` 下存在 `_degradation_summary.md`。
2. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端单分支 + 单测（用 mock 让模型每轮都返回 tool_call 凑满 50 轮，或调低 MAX_TOOL_ROUNDS 常量供测试）。

## US-021-B 进度摘要生成（已完成/未完成步骤）
**目标**：降级摘要内容结构化：列出已完成步骤（按 JSONL 中的 tool_call 序列）与未完成步骤（当前未结束的轮）。
**改文件**：`agent_loop.py` 50 轮分支：从 `messages`/已落 JSONL 事件汇总已完成 tool 调用列表，写入摘要文件。
**验收标准**：
1. `_degradation_summary.md` 含"已完成步骤"与"未完成步骤"两段，已完成步骤数 = 已落盘 tool_call 事件数。
2. 新增单测断言摘要文件内容结构。
3. `cd backend && uv run pytest` 全绿。
**闭环**：后端 + 单测（依赖 US-021-A）。

## US-021-C 降级提示 UI 可见（接通 US-017-C）
**目标**：done 事件 note（"已达到最大循环次数，部分结果已保存"）通过 US-017-C 的暖色横幅展示给用户。
**改文件**：依赖 US-017-C 的 done.note 渲染；本条仅验证端到端。
**验收标准**：
1. 触发降级后前端出现暖色提示横幅，文案含"已达到最大循环次数"。
2. agent-browser 实测（或 mock done note）确认横幅。
3. `cd frontend && npm run typecheck && npm run lint` 通过。
**闭环**：验证条（依赖 017-C + 021-A/B）。

---

# US-022 长期记忆内置工具与自动注入

> 父 story AC：save_memory(type,content) long_term→追加 memory.md、short_term→追加 memory/YYYY-MM-DD.md；search_memory(query,type?) 关键词匹配、按相关度排序、最多 10 条；两工具不可禁用/删除/修改、不在工具管理页展示；每次模型请求前自动读 memory.md 注入系统提示词；memory.md 不存在自动创建按空处理；单测覆盖 save/search/注入。
> 现状：完全缺失。memory.md 注入骨架在 US-018-B 已建；本 story 重点是两个工具 + 隐藏 + 自动注入接通。

## US-022-A 实现 save_memory 工具
**目标**：`save_memory(type, content)`：long_term 追加 `workspace/memory.md`，short_term 追加 `workspace/memory/YYYY-MM-DD.md`；自动创建文件/目录。
**改文件**：新建 `backend/app/services/memory_store.py`：`save_memory(type, content) -> str`（filelock 守护追加）；在 `agent_loop._execute_tool` 注册 `save_memory` 分支；在 `_build_tool_definitions` 把 save_memory 加入可用工具（不受 tools.json 启用态控制）。
**验收标准**：
1. 调 save_memory(long_term, "X") → `workspace/memory.md` 追加一行 "X"。
2. 调 save_memory(short_term, "Y") → `workspace/memory/<今天>.md` 追加 "Y"。
3. 文件/目录不存在时自动创建不报错。
4. 新增 `test_memory_store.py` 覆盖 long/short/自动创建。
5. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端新模块 + 单测。

## US-022-B 实现 search_memory 工具
**目标**：`search_memory(query, type='all')`：关键词匹配搜索记忆文件，按相关度排序，最多返回 10 条匹配片段。
**改文件**：`memory_store.py`：`search_memory(query, type) -> str`（按 query 分词在 memory.md + memory/*.md 全文搜，返回匹配行+上下文，排序限 10）；agent_loop 注册分发。
**验收标准**：
1. 写入若干记忆后 search_memory(关键词) 返回匹配片段，最多 10 条。
2. type=long_term 仅搜 memory.md；short_term 仅搜 memory/YYYY-MM-DD.md；all 搜全部。
3. 无匹配返回空结果不报错。
4. `test_memory_store.py` 新增 search 用例。
5. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端 + 单测（依赖 US-022-A）。

## US-022-C 记忆工具隐藏 + 不可禁用
**目标**：save_memory/search_memory 不在工具管理页展示、不可禁用/删除/修改，所有 Agent 默认可用。
**改文件**：
- `backend/app/schemas/tool.py`：新增 `INTERNAL_TOOL_NAMES = ("save_memory","search_memory")`，与 `BUILTIN_TOOL_NAMES` 区分。
- `backend/app/api/tools.py` GET 列表只返回 `BUILTIN_TOOL_NAMES`（不含 internal）。
- `tools_store.is_tool_enabled/set_tool_enabled` 拒绝 internal 工具（直接 True / 不可改）。
- `agent_loop._build_tool_definitions`：internal 工具始终注入（不受 agent.tools 与 tools.json 控制）。
**验收标准**：
1. `GET /api/tools` 不含 save_memory/search_memory。
2. `PUT /api/tools/save_memory/toggle` 不生效（返回不可修改或 400）。
3. 即使 agent.tools 不含记忆工具、tools.json 未列它们，Agent Loop 请求的 tools 数组仍含 save_memory/search_memory。
4. 新增单测覆盖以上。
5. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端 + 单测。

## US-022-D 自动注入接通（每次模型请求前读 memory.md）
**目标**：父 AC"每次模型请求前自动读取 memory.md 并注入系统提示词"——US-018-B 已实现注入逻辑；本条确认 `run_agent_loop` 每轮都用最新 memory.md 重组系统提示词（而非仅首轮）。
**改文件**：`agent_loop.py`：把 `build_system_prompt` 调用移到循环内每轮重建（或至少每轮重读 memory.md 更新 system 消息），保证 save_memory 写入后下一轮即可见。
**验收标准**：
1. 第一轮模型调 save_memory 写入 memory.md → 第二轮系统提示词含刚写入的内容。
2. 新增单测：mock 两轮，第一轮 tool_call=save_memory，第二轮断言 messages[0] system 含新记忆。
3. memory.md 不存在时自动创建按空处理（不报错）。
4. `cd backend && uv run pytest` 全绿、`uv run mypy app` 通过。
**闭环**：后端 + 单测（依赖 018-B + 022-A）。

---

# US-023 P0 闭环集成验证

> 父 story AC：配置有效/mock 模型 + Agent 启用 read_file；agent-browser 发消息让 Agent 读文件；验证 thinking 折叠、tool_call 卡片含 path 参数、tool_result 在卡片下、最终回复流式 Markdown、会话进历史、刷新后从 JSONL 完整恢复（含工具调用）、SSE 心跳保活。

## US-023-A mock 模型端到端后端集成测试
**目标**：用 httpx mock 构造"模型先调 read_file、再给最终回复"的流，跑通 send→loop→工具→JSONL 全链路，断言 JSONL 含 user/thinking/tool_call/tool_result/assistant 事件且可被 `get_conversation` 还原。
**改文件**：`backend/tests/test_chat_send_api.py` 新增端到端用例（或 `test_p0_e2e.py`）。
**验收标准**：
1. 一次 send 后 `GET /api/conversations/{id}` 返回的事件序列完整且顺序正确。
2. tool_result 含 read_file 真实文件内容。
3. `cd backend && uv run pytest` 全绿。
**闭环**：纯测试条（依赖 020-A/019-B 完成）。

## US-023-B agent-browser 真实闭环验证
**目标**：父 story 全部 agent-browser AC 实测通过。
**前置依赖**：US-017/018/019/020/021/022 全部完成；有一个可用真实模型（或本地 mock server 伪装 OpenAI）。
**验收标准（agent-browser 实操，每步截图 `screenshots/`）**：
1. 配置一个有效模型 + 创建/选用启用 read_file 的 Agent。
2. 打开 `http://localhost:5181/chat`，选 Agent，发"请读取 workspace/note.md"。
3. 验证 thinking 过程在可折叠区展示。
4. 验证 tool_call 卡片（read_file + path 参数）出现。
5. 验证 tool_result 在卡片下方显示文件内容。
6. 验证最终回复流式渲染为 Markdown。
7. 验证该会话出现在历史列表。
8. 刷新页面 → 点回该会话 → 验证含工具调用的完整对话从 JSONL 还原。
9. 验证 Agent 处理期间 SSE 心跳保活（连接不中断）。
10. `cd frontend && npm run typecheck && npm run lint` + `cd backend && uv run pytest` 全绿。
**闭环**：纯验证条，是整个 P0 的收口。

---

# 附录：sub-task 与父 story AC 覆盖映射

| 父 story AC | 覆盖 sub-task |
|-------------|--------------|
| US-017 全部 | 017-A/B/C/D |
| US-018 全部 | 018-A/B/C |
| US-019 全部 | 019-A/B/C |
| US-020 全部 | 020-A/B/C/D |
| US-021 全部 | 021-A/B/C |
| US-022 全部 | 022-A/B/C/D |
| US-023 全部 | 023-A/B |

> 共 23 个 sub-task。建议按"US-019 → US-018 → US-022 → US-020 → US-021 → US-017 → US-023"顺序执行，每完成一个 sub-task 即提交一次（`feat: [父Story-子编号] - 标题`），保持小步快跑。
