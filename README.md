# EasyGPTs（LLM 应用开发平台）

面向企业/团队的 LLM 应用与知识库问答平台：内置数据集（知识库）处理、向量检索、重排、工具/插件能力，并通过 Flow 可视化工作流编排实现复杂问答与自动化流程。

## 架构

- Monorepo（pnpm workspace），主应用为 Next.js 14（同一进程同时提供 Web UI + API）。
- `projects/app`：Next.js 应用（页面、API Routes、工作流画布等）。
- `packages/service`：后端服务能力（数据集/向量库/工作流调度/文件处理等），由 `projects/app` 引用。
- `packages/global`：全局类型、常量、工作流节点定义与模板。
- `packages/web`：通用 UI 组件与工具。
- `packages/plugins`：工作流插件（系统/自定义）。
- `python/`：辅助示例代码（非主项目、未参与生产）。

## 技术栈

- 前端框架：Next.js 14（pages）+ React 18 + TypeScript
- UI 框架：Chakra UI
- 画布/编辑器：ReactFlow（工作流画布）、Lexical（富文本）、Monaco Editor（代码编辑）
- 状态与数据：Zustand、TanStack React Query
- 服务端：Next.js API Routes（Node.js 运行时），Monorepo 内复用 `packages/service`
- 存储：MongoDB（主数据）；向量库优先级 `pg > milvus`
- 交付形态：Docker 镜像 + `docker-compose`（包含 Milvus/MinIO/etcd、Mongo、Sandbox、Attu）

## 部署

本项目的生产部署仅支持 `docker-compose.yml` 这一套方式（不提供/不维护 k8s、裸机脚本等其它部署形态）。

`docker-compose.yml` 默认包含：`easygpts`（主服务）、`mongo`、`milvus`（含 `etcd`/`minio`）、`sandbox`（代码沙箱）、`attu`（Milvus 可视化，可选）。

1) 准备配置文件（与 `docker-compose.yml` 同级）：
- `config.json`：从 `projects/app/data/config.json` 复制一份按需修改（该文件以 json5 解析，允许注释）。

2) 修改 `docker-compose.yml` 中 `easygpts` 的关键环境变量（示例里包含占位符）：
- `DEFAULT_ROOT_PSW`：root 初始密码（用户名固定 `root`）
- `FE_DOMAIN`：对外访问域名/地址（本地一般填 `http://localhost:3001`）
- `OPENAI_BASE_URL`、`CHAT_API_KEY`：模型接口地址与密钥（务必包含 `/v1`）
- `TOKEN_KEY`、`ROOT_KEY`：登录凭证与最高权限密钥（务必替换）
- `MONGODB_URI`：Mongo 连接串（compose 内默认用户 `myusername` / `mypassword`）
- `MILVUS_ADDRESS`、`PG_URL`（可选）：向量库（优先级 `pg > milvus`）
- `SANDBOX_URL`：代码沙箱服务地址（compose 内默认 `http://sandbox:3000`）

3) 启动：
```bash
docker compose up -d
```

4) 默认端口（可在 compose 内调整）：
- Web/API：`http://localhost:3001`
- MongoDB：`27017`
- Milvus：`19530` / `9091`
- MinIO：`9000` / `9001`
- Milvus 可视化（Attu）：`http://localhost:18000`

### 自建镜像（仍通过 docker-compose 部署）

如果需要基于源码构建 `easygpts` 镜像：
```bash
make build name=app image=<your_repo/easygpts:tag>
```
然后将 `docker-compose.yml` 中 `easygpts.image` 替换为你的镜像名，再 `docker compose up -d`。

## 本地开发

前置：Node.js >= 18.16、pnpm >= 9（Node >= 20 安装依赖时可能需要 `NODE_OPTIONS=--no-node-snapshot`）。

```bash
pnpm i
make dev name=app
```

## 配置及依赖

### 配置
- 环境变量模板：`projects/app/.env.template`
- 运行期配置（模型/向量/重排/前端配置等）：`projects/app/data/config.json`（部署时通过 `./config.json` 挂载到容器 `/app/data/config.json`）

### 其他项目依赖
- [New-API](https://github.com/RipperTs/new-api)：用于对接多种大模型服务的统一接口层（可选）
- [FastGPT-Sandbox](https://github.com/RipperTs/fastgpt-sandbox)：代码沙箱服务（必须）
- [Python-Code-Interpreter](https://github.com/RipperTs/python-code-Interpreter) ：Python 代码执行环境（必须）
- [MinerU](https://github.com/opendatalab/MinerU) ：PDF数据处理工具（可选）

## 鸣谢

感谢以下开源项目及其社区（排名不分先后）：

- Next.js / React / TypeScript
- Chakra UI
- FastGPT、LangChain.js
- ReactFlow、Lexical、Monaco Editor
- TanStack React Query、Zustand
- MongoDB、Milvus、PostgreSQL（pgvector 等生态）
