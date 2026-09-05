# Repository Guidelines

## Project Layout and Commands

This is a pnpm workspace monorepo. Check package manifests for current dependency versions and runtime requirements.

| Location | Responsibility |
| --- | --- |
| `projects/app` | Next.js Pages Router application; source code lives in `src`. |
| `packages/global` | Shared types, constants, workflow templates, and pure utilities. |
| `packages/service` | Backend services, persistence, and workflow execution. |
| `packages/web` | Shared React components, hooks, icons, and Chakra theme. |
| `packages/plugins`, `packages/templates` | Plugin and application templates. |
| `scripts`, `Makefile`, `docker-compose.yml` | Development utilities, build helpers, and local infrastructure. |

Available commands are listed for reference; follow the verification policy before running checks.

| Purpose | Command |
| --- | --- |
| Install dependencies | `pnpm i` |
| Start development server | `pnpm --prefix projects/app dev` |
| Build application | `pnpm --prefix projects/app build` |
| Start production server | `pnpm --prefix projects/app start` |
| Lint application | `pnpm --prefix projects/app lint` |
| Generate Chakra theme types | `pnpm run gen:theme-typings` |
| Generate OpenAPI documentation | `pnpm run api:gen` |
| Build Docker image | `make build name=app image=<repository:tag>` |

## Collaboration and Scope

- Communicate with the user in Simplified Chinese. Lead with the result and keep explanations concise.
- Read relevant code, configuration, dependencies, and callers before proposing changes. Search for existing capabilities before adding new ones.
- Describe the approach, affected files, and key behavior changes before implementation. Obtain approval when the proposed work has not already been authorized; do not repeatedly confirm decisions the user has approved.
- Clarify ambiguities that materially change behavior or scope. Follow the agreed scope and present one recommended approach.
- Keep changes focused. Do not add unrelated refactoring, formatting, dependencies, abstractions, configuration, or features.
- Do not introduce compatibility layers, migrations, fallback paths, or retries unless explicitly required. Do not hide failures behind defaults or empty results.
- Review the final diff for correctness, duplication, and unintended behavior changes before reporting completion.

## Code and Language Conventions

- Use TypeScript and existing React patterns. Follow `.prettierrc.js`: two-space indentation, single quotes, semicolons, and a print width of 100.
- Avoid `any`. Use `unknown` with narrowing at boundaries, or define appropriate interfaces, type aliases, generics, and third-party declarations. A necessary exception must remain local and have an explanatory comment.
- Use PascalCase for React components, `useCamelCase` for hooks, and `SCREAMING_SNAKE_CASE` for constants. Prefer named exports in packages; Next.js page components use default exports.
- Keep functions and components focused on one responsibility. Share logic only when its meaning and responsibility are the same; avoid abstractions for hypothetical future needs.
- New UI labels, configuration copy, and user-visible errors use direct Simplified Chinese strings. Do not add translation keys or modify `packages/web/i18n/*` unless multilingual support is explicitly requested.
- Internal agent prompts, tool instructions, parameter descriptions for models, and schema instructions use English. User-facing answers, progress messages, task descriptions, and result summaries use Simplified Chinese.
- When maintaining existing translated UI, resolve actual translation keys before rendering. Do not pass arbitrary runtime strings into a strictly typed translation-key API.

## Frontend Design and Interaction

### Global Style Alignment

Visual consistency is part of implementation, not a finishing step to defer until the user reports mismatches.

- Before writing styles, inspect `packages/web/styles/theme.ts`, the relevant shared components, and a comparable existing page. Identify the native layout and interaction pattern being followed.
- Reuse `MyModal`, `FormLabel`, `MyIcon`, `MySlider`, `useConfirm`, and existing Chakra component variants where appropriate. Reusing functionality alone is insufficient if the surrounding layout looks unrelated.
- Use existing theme colors such as `primary`, `myGray`, and `borderColor`, along with established typography, spacing, radii, and shadows. Prefer component `size` and `variant` props over local styling overrides.
- Match the hierarchy of headings, labels, body text, helper text, and placeholders. Align font size, weight, line height, control height, icon dimensions, text baselines, and spacing with comparable native components.
- Plugin branding belongs in approved assets. Do not automatically apply a plugin icon's color to buttons, backgrounds, or an entire configuration section.
- Treat modal headers, forms, lists, parameter sections, and footers as one composition. Avoid excessive nested cards, repeated borders, inconsistent section styles, and unused whitespace.
- Adapt forms and modals to their containers. Check narrow layouts, long labels, larger lists, wrapping, truncation, and access to primary actions. Workflow nodes should follow native canvas layout behavior rather than acquiring arbitrary height limits or scroll areas.
- In Chakra, `w` sets width while `maxW` only limits it. Check inherited minimum widths and responsive values when a requested size appears ineffective.
- Keep local changes local. Avoid global CSS overrides, unnecessary shared-component changes, and accumulating `!important` rules to fix one screen.

### Controls and Information Hierarchy

- Inspect the native component's title row, action placement, parameter entry points, list layout, and overflow behavior before designing an equivalent feature.
- Match icon size, icon-to-text spacing, typography, and color within an action group. Preserve the native icon-and-label pattern instead of substituting isolated icons or new emphasis colors.
- Provide only necessary configuration entry points. Do not duplicate a parameter button outside a dialog that already contains the setting. Do not show an input-mode switch with only one usable choice.
- After removing cards, summaries, or controls, revisit the whole section's layout. Move remaining actions into a sensible group and remove leftover whitespace.
- External-data loading states should combine a suitable icon, progress indicator, and brief explanation in the existing visual style. Distinguish loading, empty results, and failures.
- Check the component in its full page context, alongside native controls. Inspect relevant hover, selected, disabled, loading, and error states; an isolated component screenshot is insufficient.

### Form State and Persistence

- Edit through draft state and apply changes only on confirmation. Verify that cancel leaves the active configuration unchanged and that saved values are restored when reopened.
- Validation must match serialization requirements. Do not allow a configuration to be submitted if saving it silently omits the corresponding node or data.
- Confirm configuration ownership and entry points from the agreed user flow. Do not invent account-wide, platform-wide, or extra workspace settings.
- When credentials or connection scope change, revalidate accessible selections rather than treating old selections as valid.
- Parameter labels and controls must reflect actual backend behavior. Hiding a control does not remove duplicate processing behind it.

## WeKnoraX Integration Contract

Keep these product decisions unless the user requests a change:

- Simple applications show selection and removal actions as icon-and-label buttons, followed by selected-count and reference-length summaries. Do not expand individual knowledge-base cards. Keep parameter editing inside the selection dialog, and confirm configuration removal.
- Workflow nodes follow the native knowledge-search node: a two-column grid containing the selection button and selected knowledge-base icons and names. Truncate long names and let the node grow with the list. Use the node's deletion action instead of a separate configuration-removal action.
- Knowledge-base configuration uses the selection dialog without a variable-reference mode switch. The user question can still reference upstream variables.
- The dialog contains Base URL, API Key, optional source website URL, knowledge-base selection, and a reference-token limit. Do not add platform or workspace-ID fields. Retrieval and reranking are handled by WeKnoraX.
- Derive the source website URL from `new URL(baseUrl).origin`, preserving scheme, host, and port while removing the API path. Allow manual edits. Require at least one selected knowledge base before applying the configuration.
- Use the exact brand spelling `WeKnoraX`, separated from the localized knowledge-base label by a space. Update related titles and connection messages consistently.
- Use the approved icon asset and verify its registration, node template, and template-conversion paths. Check both newly added and previously saved nodes.
- Compare the same query across the external API response, node output, and actual model input when investigating retrieval differences. Distinguish documents, chunks, parent-context expansion, reference-token budgets, and model output-token limits. Do not assume a full-search endpoint matches the native chat pipeline.

Native UI references:

- `projects/app/src/pages/app/detail/components/SimpleApp/EditForm.tsx`
- `projects/app/src/pages/app/detail/components/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectDataset.tsx`

## System Workflow Node Registration

A new system node must have a template, runtime handler, and frontend renderer. Missing frontend registration produces an empty or fallback node on the canvas.

1. Add the node type to `FlowNodeTypeEnum` in `packages/global/core/workflow/node/constant.ts`.
2. Add required input and output keys in `packages/global/core/workflow/constants.ts`.
3. Define the template under `packages/global/core/workflow/template/system/`, including inputs and outputs. Set `isTool: true` when the node supports tool invocation.
4. Register the template in `packages/global/core/workflow/template/constants.ts`.
5. Implement dispatch behavior under `packages/service/core/workflow/dispatch/`.
6. Register the dispatch handler in `packages/service/core/workflow/dispatch/index.ts`.
7. Register the frontend node renderer in `projects/app/src/pages/app/detail/components/WorkflowComponents/Flow/index.tsx`. Register any new input renderer in that node's input-rendering layer as well.

## Data and React Pitfalls

- Distinguish conversations, messages, and usage records before selecting a collection. Use `chat` and `chatitems` for conversation history; `usages` represents billing and consumption, and its application name or ID may not identify the conversation's application reliably.
- Define whether a latest-message field means the user's question or the assistant's answer. Filter by role before selecting the latest relevant message.
- Avoid unstable callback dependencies that repeatedly trigger list requests. In particular, inspect callback stability before placing a `usePagination` loader in an effect; use stable callbacks or an effect structure tied to the actual filter changes without hiding required dependencies.
- Use Mongoose `PipelineStage[]` for aggregation pipelines. A MongoDB `$let` variable cannot reference a sibling declared in the same `vars` block; use nested scopes when needed.

## Verification and Completion

- Do not add or modify tests, mocks, fixtures, or test dependencies unless explicitly requested.
- Do not automatically run lint, build, or test commands at task completion. Perform code review and authorized page or API checks as appropriate, and state which checks were not run.
- Inspect relevant UI states such as unconfigured, loading, failed, selected, cancelled, and confirmed removal. Check reopening after saving when persistence is affected. Keep verification limited to the changed behavior.
- Do not claim visual verification from code changes, hot reload, or a successful API response. Inspect each affected page before reporting that its appearance is verified.
- Distinguish implementation completion, visual verification, and full conversation or workflow verification. API connectivity alone does not establish end-to-end success.
- Report what changed, affected files, key behavior, checks performed, and remaining verification gaps. Provide brief manual steps when a complex flow has not been exercised. Include screenshots or clips for UI changes when available.

## Commits, Pull Requests, and Configuration

- When requested, use Conventional Commits with a concise Simplified Chinese subject. Describe only the changes included in the commit and keep unrelated work separate.
- Keep pull requests focused. Explain actual behavior changes, verification performed, and relevant configuration or deployment implications. Include issue links only when applicable; never invent validation results.
- Do not stage additional files, commit, push, or create a pull request without authorization.
- Never commit credentials. Use `projects/app/.env.template` as the reference for local environment configuration, and update the template when introducing environment variables.
- Keep test credentials out of source files, examples, logs, and documentation. Follow the existing `LOG_LEVEL` and `STORE_LOG_LEVEL` controls when adjusting logging.
