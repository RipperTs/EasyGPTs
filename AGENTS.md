# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm workspaces (`pnpm-workspace.yaml`).
- App: Next.js 14 project in `projects/app` (pages-based; code under `projects/app/src`).
- Packages: shared libraries in `packages/*` (`global`, `service`, `web`, `plugins`, `templates`).
- Scripts: utilities in `scripts/*` (e.g., `scripts/postinstall.sh` creates app tmp dir and generates Chakra theme typings).
- Infra: `docker-compose.yml` for Mongo/Milvus/MinIO sandbox, and `Makefile` helpers.

## Build, Test, and Development Commands
- Install deps: `pnpm i` (Node ≥ 20: `NODE_OPTIONS=--no-node-snapshot pnpm i`).
- Dev server: `make dev name=app` or `pnpm --prefix projects/app dev`.
- Build app: `pnpm --prefix projects/app build`; start: `pnpm --prefix projects/app start`.
- Docker image: `make build name=app image=<repo/easygpts:tag> [proxy=taobao|clash]`.
- OpenAPI docs: `pnpm run api:gen` → outputs `projects/app/public/openapi/index.html`.

## Coding Style & Naming Conventions
- Language: TypeScript. Format with Prettier (`.prettierrc.js`): 2 spaces, single quotes, semicolons, width 100.
- Type safety: 禁止使用 `any`；类型不明确时优先使用 `unknown` 并在边界进行类型收窄；优先通过泛型/类型别名/接口完善类型；为第三方缺失声明补充 `*.d.ts`；如必须例外需同行注释说明且仅限局部。
- 文案/i18n：后续新增功能默认不再接入/补充 i18n（不新增翻译 key，不修改 `packages/web/i18n/*`），界面与配置文案统一直接使用中文字符串；仅当你明确要求“需要多语言”时才使用 i18nT。
- Lint: Next.js core-web-vitals (`projects/app/.eslintrc.json`). Fix lint before PR.
- Naming: React components PascalCase; hooks `useCamelCase`; constants `SCREAMING_SNAKE_CASE`.
- Files: Prefer named exports in packages; Next.js pages export default page components.
- Pre-commit runs `lint-staged` to format code and docs.

## Testing Guidelines
- No centralized test runner today. When adding critical logic, include minimal unit tests in-package (e.g., `foo.test.ts`) and document manual steps.
- Prefer pure, testable functions; keep side effects isolated.
- For UI, include screenshots or clips in PRs demonstrating the change.
- 验证策略：默认不在任务完成后自动运行 `lint`/`build`/`test` 等自动化校验命令；直接说明“已完成”，由你手动验证。若功能较复杂，我需要提供简要的手动验证步骤与注意事项。

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`; scope optional (e.g., `feat(app): ...`).
- PRs must include: clear description, linked issues, screenshots, test plan, and any config/migration notes. Update `projects/app/.env.template` if envs change.
- Keep PRs focused and incremental; ensure format/lint pass locally.

## Security & Configuration Tips
- Never commit secrets. Copy `projects/app/.env.template` → `projects/app/.env.local` and fill values (`MONGODB_URI`, `OPENAI_BASE_URL`, `CHAT_API_KEY`, `SANDBOX_URL`, etc.).
- Use `docker-compose.yml` to provision Mongo/Milvus locally if needed.
- Control verbosity with `LOG_LEVEL` and `STORE_LOG_LEVEL`.

---

## 系统基础插件开发流程（Checklist）

> 目标：新增一个可在工作流画布正常显示、可运行、可作为工具使用的系统节点。

1. **新增节点枚举**
   - `packages/global/core/workflow/node/constant.ts`：在 `FlowNodeTypeEnum` 里添加新节点类型（例如 `nl2sql`）。
2. **新增输入/输出 Key**
   - `packages/global/core/workflow/constants.ts`：
     - `NodeInputKeyEnum`：补充该节点需要的输入 key
     - `NodeOutputKeyEnum`：补充该节点需要的输出 key（例如 `sql`）
3. **实现模板（节点长什么样）**
   - `packages/global/core/workflow/template/system/<yourNode>/index.ts`
   - 定义 `inputs/outputs`，需要可作为工具时设置 `isTool: true`。
4. **注册模板到系统节点列表**
   - `packages/global/core/workflow/template/constants.ts`：把新模块加入 `systemNodes`。
5. **实现后端 dispatch（节点怎么跑）**
   - `packages/service/core/workflow/dispatch/**`：新增 `dispatchXxx`，按 inputs 取参、调用能力、组装 outputs。
6. **注册 dispatch**
   - `packages/service/core/workflow/dispatch/index.ts`：在 `callbackMap` 里映射 `[FlowNodeTypeEnum.xxx]: dispatchXxx`。
7. **前端节点渲染注册（否则画布会空白）**
   - `projects/app/src/pages/app/detail/components/WorkflowComponents/Flow/index.tsx`
   - 在 `nodeTypes` 中新增映射：`[FlowNodeTypeEnum.xxx]: NodeSimple`（或自定义 Node 组件）。

## 常见坑（本次踩过）

- **忘记注册前端 `nodeTypes`**
  - 现象：画布中节点显示为"小空白框"，控制台报错：`[React Flow]: Node type "xxx" not found. Using fallback type "default"`。
  - 修复：在 `projects/app/src/pages/app/detail/components/WorkflowComponents/Flow/index.tsx` 的 `nodeTypes` 补上对应类型映射。
- **Chakra 按钮宽度设置不生效**
  - 现象：给 `Button` 设置了 `maxW`，但视觉上宽度没有变化（常见于同时写了 `w="100%"`）。
  - 原因：`maxW` 只限制最大宽度，不会主动改变布局；`w` 才是实际宽度。
  - 修复：需要固定宽度用 `w`（可用响应式数组如 `w={['100%', '360px']}`）；需要居中时用 `Flex justify="center"` 或配合 `mx="auto"`。
- **“请求日志/对话日志”口径没先确认，导致查错集合**
  - 现象：把“对话日志”当成“请求日志”实现，误用 `usages`（计费/消耗记录）导致“应用名”显示成训练名/文件名/任务标题等。
  - 修复：先确认日志口径，再选集合：
    - **会话列表**：优先 `chat`（会话维度：`title/source/updateTime/outLinkUid`）+ `chatitems`（消息维度：`obj/value/responseData`）。
    - **计费/消耗**：`usages`（`appName` 不一定是应用名，`appId` 可能为空，需谨慎展示）。
- **`usePagination` + `useEffect` 依赖不当导致频繁请求**
  - 现象：页面打开后不停请求 list 接口。
  - 原因：把 `getData`（函数引用可能不稳定）放进 `useEffect` 依赖，触发渲染-请求-再渲染循环。
  - 修复：只依赖真正的筛选条件（如 `appId/keyword`），或用稳定的回调封装后再放依赖。
- **i18n key 直接渲染/类型过严导致构建失败**
  - 现象：来源显示 `common:core.chat.logs.api`；或 `t(label)` 在 build 阶段类型校验失败。
  - 原因：`ChatSourceMap.*.name` 通过 `i18nT` 返回 key（不是中文）；同时 `next-i18next` 的 `t()` key 类型是联合类型，不能直接喂运行时字符串。
  - 修复：按仓库规范优先直接用中文字符串；需要显示来源时用本地 `source -> 中文` 映射兜底，不要在此处硬接 i18n。
- **Mongo 聚合 `$let` / `$$REMOVE` / TS 类型约束的坑**
  - `$let.vars` 同层变量不能互相引用：需要嵌套 `$let`，避免 “undefined variable”。
  - `$$REMOVE` 在部分环境/写法下不稳定：更稳的做法是先 push `null` 再用 `$filter` 清理。
  - Mongoose `aggregate()` 的 pipeline 类型：不要用 `Record<string, unknown>[]`，用 `PipelineStage[]`（或最终断言为该类型）避免 build 的类型错误。
- **“最近消息”要明确是问题还是答案**
  - 经验：对话日志列表更适合展示“最近一次用户提问（Human）”，而不是最后一条 AI 回复；可在聚合前提取 `textContent`，聚合后从 Human candidates 里取第一条。

---

## Agent Prompt 开发规范

### Prompt 语言规范

#### 核心原则
- **内部 Prompt 使用英文**：所有 Agent 内部的 system prompt、user prompt 必须使用英文
- **用户输出使用中文**：最终面向用户的输出内容必须使用简体中文
- **保持一致性**：与现有 agent 代码风格保持一致（如 Planner、Executor、Critic 等）

#### 适用范围

**✅ 必须使用英文的场景：**
- System prompts for LLM calls (如 Task Analyzer, Planner, Executor, Replanner, Critic)
- Tool instructions and guidelines
- Internal reasoning prompts
- Agent 内部角色定义和规则说明
- 工具调用的参数描述和约束条件
- JSON schema 和格式要求说明

**❌ 必须使用中文的场景：**
- User-facing responses (面向用户的最终回复)
- UI text and labels (界面文本和标签)
- Error messages shown to users (用户可见的错误信息)
- Todo list content (任务列表内容)
- Step result synthesis (步骤结果合成)
