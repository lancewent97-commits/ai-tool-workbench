# AI Tool Workbench / AI 工具工作台

一个面向内部团队的 AI 工具发现、组包、下载、回传与治理平台。用户可以用自然语言描述需求，让平台推荐现有工具或组合成通用工具包，再将工具包交给 Codex、Claude Code、OpenClaw 等本地 Agent 执行。

> 当前版本：`v0.1.0-beta`。核心业务闭环已可运行，适合本地部署、功能评估和内部试运行。正式生产部署前，仍需接入组织内部模型、企业病毒扫描，并完成备份恢复和容量验收。

## 主要能力

- AI 需求理解：限制澄清轮次，保存结构化需求、已确认决策和上下文快照。
- 工具目录：按模块、功能分类、标签和关键词查找工具，查看版本、验证状态和衍生关系。
- AI/手动组包：锁定工具版本、任务目标、交付物和 Agent 调整边界，生成可下载 ZIP。
- 下载与溯源：每次下载生成独立凭证，保留原工具、版本和组合关系。
- 回传与沉淀：本地 Agent 调整后的包通过分片续传、静态预检、人工审核和自动发布形成新工具或衍生版本。
- 维护后台：管理工具资产、不可变版本、发布状态、回传审核、内部账号和审计事件。

## 工作方式

```text
用户描述需求
    ↓
AI 生成需求说明并由用户确认
    ↓
推荐现有工具 / 生成缺失组件提示词
    ↓
锁定版本并生成通用 Agent 工具包
    ↓
本地 Agent 执行、调整和验证
    ↓
净化回传 → 自动预检 → 人工审核 → 发布为组合/衍生/新工具
```

## 技术架构

- Web：Next.js 16、React 19、TypeScript
- API：Fastify、Zod
- 数据：PostgreSQL 16，手写 SQL 仓库层
- AI：可替换 Provider、版本化 Prompt、上下文压缩、候选工具排序与输出约束
- 文件：8MB 分片续传、流式合并、异步预检和不可变版本
- 工程：pnpm workspace、Docker Compose、Playwright、GitHub Actions

## 目录

```text
apps/web                 用户工作台与维护后台
apps/api                 Fastify API
packages/ai              AI 编排、Prompt、约束和评测
packages/contracts       前后端共享契约
packages/db              PostgreSQL 迁移与仓库层
packages/package-builder 通用 Agent 工具包构建器
deploy                    Docker 与 Nginx 部署配置
docs                      产品、AI、架构、规范和运维文档
tests/e2e                 浏览器端到端测试
```

## 快速开始

需要 Node.js 22、pnpm 11 和 Docker。

```bash
cp .env.example .env.local
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

启动 API：

```bash
pnpm dev:api:test
```

在另一个终端启动 Web：

```bash
pnpm dev:test
```

打开 `http://127.0.0.1:3000`。需要登录时，运行 `pnpm bootstrap:admin`创建一次性激活令牌，再调用 `POST /v1/auth/activate` 设置至少 12 位且包含字母与数字的密码。激活令牌不应写入文件、Issue 或聊天。

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

`pnpm release:check` 还会检查本机的正式环境配置，需要先创建不入库的 `.env.production.local`。

## AI Provider 边界

- `mock`：默认，用确定性结果验证业务闭环。
- `external-dev`：仅限脱敏开发数据，当前实现 DeepSeek 适配。
- `internal`：为组织内部模型预留的正式接口，需要按所在组织的鉴权和网络规则实现。

不要将真实业务数据、内部工具内容、个人信息或密钥发送给外部开发 Provider。

## 生产部署声明

仓库包含正式 Compose、配置门禁、备份/恢复脚本和安全 Cookie 等生产化基础，但不代表下载后可不经验收直接对组织开放。上线前至少需要：

1. 接入内部模型与企业病毒扫描。
2. 确定内网入口、TLS、数据库凭证和持久存储。
3. 完成备份恢复演练、容量压测和安全评审。

详见[正式环境部署与恢复](./docs/operations/正式环境部署与恢复.md)。

## 文档

- [平台结构化总览](./docs/product/AI工具工作台-平台结构化总览.md)
- [核心数据模型与接口边界](./docs/architecture/AI工具工作台-核心数据模型与接口边界.md)
- [后端技术架构](./docs/architecture/AI工具工作台-后端技术架构基线.md)
- [AI 模块架构与约束](./docs/ai/AI模块架构与约束基线.md)
- [工具生产与上传标准](./docs/standards/工具生产与上传标准-讨论稿.md)

## 许可证

[Apache License 2.0](./LICENSE)
