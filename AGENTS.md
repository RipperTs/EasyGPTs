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
- Lint: Next.js core-web-vitals (`projects/app/.eslintrc.json`). Fix lint before PR.
- Naming: React components PascalCase; hooks `useCamelCase`; constants `SCREAMING_SNAKE_CASE`.
- Files: Prefer named exports in packages; Next.js pages export default page components.
- Pre-commit runs `lint-staged` to format code and docs.

## Testing Guidelines
- No centralized test runner today. When adding critical logic, include minimal unit tests in-package (e.g., `foo.test.ts`) and document manual steps.
- Prefer pure, testable functions; keep side effects isolated.
- For UI, include screenshots or clips in PRs demonstrating the change.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`; scope optional (e.g., `feat(app): ...`).
- PRs must include: clear description, linked issues, screenshots, test plan, and any config/migration notes. Update `projects/app/.env.template` if envs change.
- Keep PRs focused and incremental; ensure format/lint pass locally.

## Security & Configuration Tips
- Never commit secrets. Copy `projects/app/.env.template` → `projects/app/.env.local` and fill values (`MONGODB_URI`, `OPENAI_BASE_URL`, `CHAT_API_KEY`, `SANDBOX_URL`, etc.).
- Use `docker-compose.yml` to provision Mongo/Milvus locally if needed.
- Control verbosity with `LOG_LEVEL` and `STORE_LOG_LEVEL`.

