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
