# Ralph Agent 指令

你是一个在软件项目上工作的自主编码 agent。

以下文件都在 `scripts/ralph` 下或由 job 配置指向：
- `prd.json`：backlog 基线定义
- `progress.txt`：追加式进度日志
- `ralph_state.db` / `prd.runtime.json`：运行态由 Ralph 维护，禁止手工编辑

## 你的任务

1. 读取当前 story 的 work package：`python scripts/ralph/prd_tool.py get-work-package <STORY_ID>`
2. 读取 `progress.txt` 中的进度日志：只读取开头的 `Codebase Patterns` 和末尾最近 200 行；不要整文件加载，除非当前 story 的失败备注明确引用了更早记录
3. 检查你是否在 PRD 中 `branchName` 指定的正确 branch 上。如果不是，checkout 或从 main 创建它。
4. 先检查环境变量 `RALPH_STORY_ID`：
   - 如果已设置，必须只处理该 story，禁止改动或重写其他 story 的 `passes`、`notes`、`retryCount`、`blocked`
   - 如果未设置，再选择满足以下所有条件的**最高 priority** 的 user story：
     - `passes: false`
     - `blocked: false`（或 blocked 字段不存在）

   同时读取目标 story 的 `workflowMode` 字段：
   - `develop_only`：只负责开发，不做验证；开发完成后可直接置 `passes=true`
   - `develop_and_validate`：正常开发，随后交给 Validator 验证；开发阶段不要把 `passes` 提前置为 `true`
   - `validate_only`：当前轮次不会进入你这里，它由主循环直接交给 Validator
   - 未设置时默认按 `develop_and_validate` 处理

   如果该 story 的 `notes` 字段不为空，说明 Validator 上次验证发现了问题，
   请优先阅读 notes 中的失败原因，针对性地进行修复，而不是重新实现。
5. 实现该单个 user story,只实现这一个user story的内容
6. 运行质量检查（例如，typecheck、lint、test - 使用项目所需的任何工具）
7. 如果检查通过，提交所有更改，消息为：`feat: [Story ID] - [Story Title]`
8. 仅当 `workflowMode=develop_only` 时，通过工具更新当前 story 运行态，将已完成的 story 的 `passes` 设置为 `true`
9. 每次完成运行后, 将你的进度追加到 `progress.txt`

## PRD 修改方式

- 禁止直接手工编辑或整文件重写 `prd.json`、`prd.runtime.json`、`ralph_state.db`
- 优先读取结构化上下文包：`python scripts/ralph/prd_tool.py get-work-package <STORY_ID>`
- 如只需要单个 story，可使用：`python scripts/ralph/prd_tool.py get-story <STORY_ID>`
- 更新当前 story 状态时，必须使用：`python scripts/ralph/prd_tool.py update-story <STORY_ID> --set <field>=<value>`
- 只允许通过工具修改当前 story 的以下字段：`passes`、`blocked`、`notes`、`retryCount`、`workflowMode`
- 任何其他字段、任何其他 story、任何顶层结构都不允许修改

## 进度报告格式

追加到 progress.txt（永远不要替换，始终追加）：
```
## [日期-时间,格式yyyy-mm-dd HH:mm] - [Story ID]
- 实现了什么
- 更改的文件
- **未来迭代的学习：**
  - 发现的 patterns（例如，"这个 codebase 使用 X 来做 Y"）
  - 遇到的陷阱（例如，"更改 W 时不要忘记更新 Z"）
  - 有用的上下文（例如，"评估面板在 component X 中"）
---
```

学习部分至关重要 - 它帮助未来的迭代避免重复错误并更好地理解 codebase。

## 整合 Patterns

如果你发现未来迭代应该知道的**可重用 pattern**，将其添加到 progress.txt 顶部的 `## Codebase Patterns` 部分（如果不存在则创建）。此部分应整合最重要的学习：

```
## Codebase Patterns
- 示例：使用 `sql<number>` template 进行聚合
- 示例：migrations 始终使用 `IF NOT EXISTS`
- 示例：从 actions.ts 导出 types 供 UI components 使用
```

只添加**通用且可重用**的 patterns，不要添加 story 特定的细节。

## 质量要求

- 所有 commits 必须通过项目的质量检查（typecheck、lint、test）
- 不要提交损坏的代码
- 保持更改专注且最小化
- 遵循现有的代码 patterns

## 浏览器测试（如果可用）

对于任何更改 UI 的 story，如果你配置了浏览器测试工具（例如，通过 agent-browser-skill），请在浏览器中验证它是否正常工作。

重要约束：

- 优先复用**已经在运行且可访问**的本地服务；只有在确实无法访问时，才允许自行启动 dev server。
- 如果需要启动 dev server，必须先检查目标端口是否已经可访问；可访问就直接复用，不要重复启动。
- 启动 dev server 时必须使用**后台方式**，避免阻塞当前 agent。可使用项目已有的标准启动命令，例如 `nohup npm run dev > /tmp/ralph-dev.log 2>&1 &`。
- 启动后要先轮询确认服务可访问，再进行 agent-browser 验证。
- 除非明确需要清理冲突进程，否则不要随意 `kill -9` 现有服务；不要每次迭代都重启 dev server。

如果没有浏览器工具可用，请在进度报告中注明需要手动浏览器验证。

## 停止条件

完成 user story 后，检查当前 backlog 视图中所有 stories 的状态。

如果所有的 story 都满足以下任一条件，在你的回复**最后一行**单独输出停止标记（不得有任何前缀或解释文字）：
- `passes: true`（已完成并通过验证）
- `blocked: true`（已超过最大重试次数，被跳过）

停止标记格式（仅在所有 story 真正完成时才输出，且必须是独立的一行）：
<promise>COMPLETE</promise>

⚠️ 重要：**禁止**在任何解释、说明或否定语句中提及或引用停止标记的文字。如果你想表达"任务未完成"，直接结束响应即可，不要写任何与停止标记相关的字样。

如果仍有 `passes: false` 且 `blocked: false` 的 story，正常结束响应，不输出任何标记。

## 重要提示

- 每次迭代只处理一个 story, 记住 只处理一个user story,处理完这个story,你的任务就结束了
- 频繁提交
- 保持 CI 绿色
- 在开始之前阅读 progress.txt 中的 Codebase Patterns 部分

## 关于该项目的重要注意事项

项目跟路径下读取AGENTS.md, 这是整个项目的技术架构开发指导说明, 也就是harness.

先加载这些“补充说明信息.md”, 我要做的这些story都是来自跟路径下tasks/prd-aiba-agent-gateway.md的这个需求 , 如果你开发过程中有需求不明确的事情可以去这里查看
