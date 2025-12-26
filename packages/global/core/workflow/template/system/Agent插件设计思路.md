## 1) Plan-and-Execute 的本质：把“想清楚”和“做事情”解耦

**核心思想**：先用一个“规划器（Planner）”把目标拆成清晰的多步计划；再用“执行器（Executor）”逐步完成；每完成一步，根据执行记录决定 **继续按计划走、调整计划（Replan）、或直接收敛输出（Reply/Response）**。

LangGraph 的官方教程把它概括得很直白：先制定多步计划，然后一次执行一个步骤，完成后可重新审视并修改计划；优势包括“更明确的长期规划”，以及“执行阶段可用更小模型，只在规划阶段用更强模型”。([LangGraph][1])

---

## 2) LangChain/LangGraph 的“最新主流做法”：用 LangGraph 搭一个 Plan→Execute→Replan 的状态机

### 2.1 关键组件映射

以 LangGraph JS 教程为例（Python 版本思路等价），它把系统拆为：

1. **Planner**：输出结构化 Plan（steps 数组），通常用 *structured output* 强约束格式
   教程里用 `zod` 定义 `steps: string[]`，再用 `model.withStructuredOutput(planObject)` 让模型稳定产出计划。([LangGraph][3])

2. **Executor（子代理）**：执行单个 step
   教程里 `executeStep()` 取 `state.plan[0]`，把该 step 作为一个新任务发给 `agentExecutor`（它本身可以是 ReAct 工具代理），并把结果写入 `pastSteps`，同时从 `plan` 里弹出该 step。([LangGraph][3])

3. **Replanner / Reply**：根据“目标 + 原计划 + 已完成步骤（pastSteps）”决定：

* 要么返回 `response`（最终答复）
* 要么返回 `plan`（剩余需要做的新 steps）
  教程用工具调用绑定了两个“伪工具”：`plan` 与 `response`，让模型必须二选一输出（这是一种非常实用的**收敛控制**手段）。([LangGraph][3])

4. **Orchestrator（主程序）**：用 StateGraph 串起来
   教程的图是：`START → planner → agent(execute) → replan → (conditional) END or agent`。([LangGraph][3])

> 这套结构的价值在于：你不再“把全部智能塞进一个 ReAct 循环里”，而是把智能拆到不同节点，并且用 **显式状态（plan/pastSteps/response）** 控制行为与终止条件。

---

## 3) 拆解：做一个“类似 Claude Code / Codex 的代码 Agent”，Plan-and-Execute 怎么落地？

下面是一个“工业化代码代理”常见且有效的分层（你可以直接按这个模块搭建）。

### 3.1 系统分层总览

**A. 入口层（Intake）**

* 解析用户目标：功能需求、边界条件、语言/框架、交付物（哪些文件、是否要测试、是否要 PR 描述）。
* 初始化工作区状态：repo 路径、可用工具、预算（最大循环次数/最大命令数/最大修改文件数等）。

**B. 规划层（Planner，大模型、低频调用）**

* 输出一个“可执行计划”（建议结构化）：

    * steps：每步要达成的子目标
    * 每步的验收标准（尤其对 coding：能否编译、哪些测试必须绿）
    * 需要的工具类型（读文件/写文件/运行测试/搜索）
    * 风险点与回滚点（例如先加测试再改逻辑）

对应 LangGraph 教程中的 Planner 节点。([LangGraph][3])

**C. 执行层（Executor，小模型或 ReAct 子代理、高频调用）**

* 对每个 step 启动一个“执行子代理”，它可以是 ReAct（思考→工具→观察）：

    * 读 repo（定位文件/函数）
    * 修改代码（写文件或打 patch）
    * 运行命令（单测/构建/lint）
    * 收集错误输出并修复

对应教程里的 `executeStep()`：把 `state.plan[0]` 当任务交给 `agentExecutor` 执行。([LangGraph][3])

**D. 评审/再规划层（Replanner/Reply，中频调用）**

* 输入：目标、原 plan、pastSteps（执行轨迹）、当前 repo 状态摘要（diff、测试结果）
* 决策：

    1. 继续：返回剩余 steps
    2. 调整：插入新 steps（例如“先修测试失败”“先补依赖”）
    3. 收敛：输出最终交付说明（做了什么、如何运行、风险）

对应教程里的 `replanStep()`：用工具调用在 `plan` 与 `response` 间二选一，是非常关键的“收敛闸门”。([LangGraph][3])

---

## 4) 一个可直接照抄的“Plan-and-Execute 代码代理”执行策略

这里给一个非常实用的默认策略（你在实现 Claude Code/Codex 类代理时，基本会走向这个形态）：

1. **Planner 产出 steps**（结构化）

    * 例：`理解现状 → 写/改测试 → 实现 → 运行测试 → 修复 → 总结`

2. **Executor 执行 step（ReAct 子循环）**

    * 每个 step 内允许若干次工具调用，但要有上限（防止无限试错）
    * step 完成后必须输出“step result summary”（写入 `pastSteps`）

3. **Replanner 判定是否收敛**

    * 若测试全绿且验收满足：直接 `response`
    * 若失败：把“修复失败原因”变成新 steps（只保留未完成的步骤，教程也强调不要重复已完成步骤）。([LangGraph][3])

4. **终止条件（必须显式）**

    * `response` 已产生则结束（教程用 `shouldEnd()` 判断 state.response）。([LangGraph][3])
    * 递归/迭代上限：例如 `recursionLimit: 50`（防止跑飞）。([LangGraph][3])

---

[1]: https://github.langchain.ac.cn/langgraph/tutorials/plan-and-execute/plan-and-execute/ "计划-执行 - LangChain 教程"
[2]: https://blog.langchain.com/planning-agents/ "Plan-and-Execute Agents"
[3]: https://github.langchain.ac.cn/langgraphjs/tutorials/plan-and-execute/plan-and-execute/ "规划与执行 - LangChain 教程"
[4]: https://js.langchain.com.cn/docs/modules/agents/agents/plan_execute/ "计划执行代理 | ️ Langchain"
