# Contributing

感谢你参与 AI Tool Workbench。

## 开始之前

- 功能请求和普通缺陷可以先创建 Issue。
- 安全漏洞请按 [`SECURITY.md`](./SECURITY.md) 私密报告。
- 不要提交业务文件、个人信息、API Key、Token、密码或未获得再分发授权的工具包。

## 本地开发

```bash
cp .env.example .env.local
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev:api:test
pnpm dev:test
```

## 提交前检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及页面链路、登录、组包、下载或回传时，还应运行 `pnpm test:browser`。

## 代码边界

- `apps/*` 只组装产品能力，跨应用契约放入 `packages/contracts`。
- 业务层不直接依赖特定 AI 厂商，Provider 差异留在 `packages/ai`。
- 工具版本、回传版本和已发布文件按不可变数据处理。
- 平台只检查并给出修正要求，不在服务端替用户改写回传工具。
- 新增工具样例必须符合 [`docs/standards`](./docs/standards) 中的生产与上传规范。

## Pull Request

PR 请聚焦一个问题，说明动机、主要变更、验证方式和剩余风险。修改用户界面时，请附上脱敏截图，并检查常见桌面与移动宽度。
