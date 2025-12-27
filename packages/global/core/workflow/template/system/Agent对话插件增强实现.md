# Agent 对话插件增强实现（商用级通用 Agent）

> 目标：把现有 `agentChat`（Plan-and-Execute）从“能跑”升级为“商用级、可控、可观测、可扩展”的通用 Agent，优先覆盖数据分析场景，同时不锁死在单一领域。
>
> 非目标（暂不做）：沙箱执行命令/改代码等高风险能力（后续单独适配）。

## 现状速览（基于当前实现）

后端核心在 `packages/service/core/workflow/dispatch/agent/agentChat.ts`，主要流程：

1. 收集工具：根据边连接到该节点的 tool nodes。
2. 复杂度分流：
   - `isObviouslySimple` + `callTaskAnalyzer` 判定 `simple/complex`
   - `simple`：直接 `dispatchRunTools` 跑一次，输出答案 + 工具预览
3. `complex`：Planner → 执行循环 → Replanner 决策（respond/continue）
   - Planner：`callPlanner` 产出 steps（注意：当前实际最大步数被 `Math.min(6, maxPlanSteps)` 限制）
   - Executor：每步调用 `dispatchRunTools`（内部支持 tool_choice/function_call/prompt_call）
   - 结果补全：若 `answerText` 为空，会用 `callStepResultSynthesis` 基于工具结果整理 1-4 句
   - Critic：按启发式决定是否 `callCritic`；低分视为失败，触发单步重试（每步最多 1 次）
   - Replanner：每步后 `callReplanner` 决定“结束答复”或“继续执行”
4. 前端展示：
   - 节点渲染：`projects/app/src/pages/app/detail/components/WorkflowComponents/Flow/index.tsx` 将 `agentChat` 映射到 `NodeTools`
   - `NodeCard` 已具备 debug 面板能力（可用于展示执行详情/工具时间线/大结果弹窗等）

## 增强总览（按优先级）

### P0（必做：商用稳定性与可控性）

1. **Agent 状态机（可恢复/可继续）**
   - 新增/输出 `agent_state`：持久化 `plan/todo/pastSteps/vars/budgets/traceId`
   - 支持断点续跑：同一任务多次调用可继续执行，而不是每次从 0 规划
   - 可“暂停/继续/终止”：为后续前端交互与运营排障提供基础

2. **规划结构化（从 string[] 到可执行计划）**
   - Planner 输出 schema 化：
     - `steps: [{ id, title, intent, toolHints, expectedOutput, acceptanceCriteria, inputs }]`
   - 价值：
     - 降低“步骤写成总结/回复”的概率
     - executor/critic/replanner 能围绕验收标准闭环，而不是靠长度/关键词启发式

3. **重规划升级（允许重排/替换/删减剩余步骤）**
   - 当前策略偏“只追加 + todo 顺序执行”，复杂任务会被早期错误计划拖死
   - 目标：replanner 可对 remaining steps 做“最小必要修改”
   - 必要守卫：
     - 不允许把已完成步骤拉回
     - 不允许无限扩张（受 `maxPlanSteps` + 预算约束）
     - 必须输出“修改理由/变化摘要”（便于审计与前端展示）

4. **失败恢复闭环（Critic 建议反哺重试）**
   - 当前 Critic 的 `issues/suggestion` 没有用于重试 prompt
   - 目标：失败重试时把“失败原因 + 建议”注入 executor 的 system/user prompt
   - 增加“工具级失败策略”：
     - 超时/空结果/解析失败 → 重试/降级/替代工具
     - 幂等键（避免重复写入类工具的副作用；当前虽暂不做沙箱命令，但接口类工具同样可能有副作用）

5. **成本与延迟控制（商用必备）**
   - 分工模型策略：
     - TaskAnalyzer/Critic/Replanner 使用低成本模型或更小 max_tokens
     - Executor 用主模型
   - 合并调用：
     - 能合并成一次“critic+replan” JSON 输出就合并，减少 round-trip
   - 预算管理：
     - 增加 `token_budget/point_budget/time_budget`，触发“降级/提前收敛/给出部分结果”

### P1（强化：通用能力与可观测性）

1. **面向数据分析的工具与上下文能力**
   - 工具组合建议（按需）：SQL 查询、CSV/Excel 解析、图表生成、指标计算、文档检索、数据字典/元数据查询
   - “数据分析专用 plan 模板”：
     - 先澄清口径（指标定义/时间范围/维度/过滤条件）
     - 再取数与校验（对账/抽样/异常值）
     - 再分析与解释（原因假设/证据/局限性）
     - 最后给行动建议（可落地、可验证）

2. **可观测性与审计**
   - 标准化事件：`agent_start/plan_generated/step_start/tool_call/tool_result/step_end/replan/agent_end`
   - `rawResponse` 增强：
     - traceId、每步耗时、每步 token/points、失败原因、replan 变化摘要
   - 日志分级：业务日志 vs 调试日志（便于线上排障与合规留痕）

3. **更强的输出质量控制**
   - 统一 final answer 模板（数据分析场景）：
     - 结论（TL;DR）→ 关键证据 → 计算口径/假设 → 风险与局限 → 下一步建议
   - 输出可选产物：
     - `table`（结构化表格）、`chartSpec`（如 ECharts/Vega spec）、`metrics`（键值对）

### P2（体验与运营：前端节点卡片与交互）

1. **Agent 专属节点卡片（替代 NodeTools）**
   - 展示区块：
     - todo 进度条 + 当前 step
     - 工具调用时间线（参数/耗时/结果摘要）
     - 成本面板（tokens/points/耗时/循环次数）
     - 操作：暂停/继续/终止/导出执行报告
   - 技术落点：
     - 新增 `NodeAgentChat` 组件并在 `Flow/index.tsx` 注册映射
     - 复用 `NodeCard` 的 debug 面板与 `WholeResponseContent` 能力

2. **更好的“执行详情”可读性**
   - 将 `rawResponse` 中的 `pastSteps` 结构化展示（步骤、摘要、证据、引用工具）
   - 支持一键复制“执行报告”（用于交付、复盘、客户沟通）

## 建议的落地节奏（可迭代）

1. **第一阶段（P0 最小闭环）**
   - 引入 `agent_state`（输入/输出）+ traceId
   - Planner 输出结构化 steps（先兼容旧格式，逐步迁移）
   - replanner 支持“重排/替换 remaining”，并输出变化摘要

2. **第二阶段（P0 完整商用化）**
   - 预算系统（token/points/time）
   - Critic 建议反哺重试 + 工具级失败策略
   - 事件化观测（后端 rawResponse + 可选落库）

3. **第三阶段（P2 体验升级）**
   - Agent 专属节点 UI（进度、时间线、控制按钮）
   - 执行报告导出与运营指标面板

## 约束与注意事项

- 当前不做沙箱执行命令/改代码：相关工具与权限模型后续单独设计，避免“先有能力后补风控”。
- planner/replanner/critic 统一使用 JSON schema 输出并做严格解析与兜底，避免线上被模型输出格式击穿。
- 数据分析场景优先：后续扩展到其他场景时，尽量通过“工具集 + plan 模板”扩展，而不是把逻辑写死在 `agentChat`。

