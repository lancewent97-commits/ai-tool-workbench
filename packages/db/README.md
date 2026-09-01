# 数据库包

`@ai-tool-workbench/db` 保存 PostgreSQL 迁移、仓库接口和正式数据库实现。

迁移 `migrations/0001_identity.sql` 包含：

- 组织；
- 部门；
- 职能；
- 用户与平台角色；
- 密码凭证；
- 一次性激活令牌；
- 登录会话；
- 审计事件。

迁移 `migrations/0002_tool_catalog.sql` 包含：

- 可编辑的模块、分类和标签；
- 工具长期身份与不可变工具版本；
- 一个工具在多个模块中的展示位置；
- 精确到来源版本的主工具 / 衍生工具关系；
- 工具采用事件与目录聚合指标；
- 为未来大文件存储预留的存储键、大小和摘要字段。

迁移 `migrations/0003_tool_catalog_integrity.sql` 用复合外键保证默认版本属于当前工具、来源版本属于对应父工具。

迁移 `migrations/0004_ai_memory.sql` 包含：

- AI任务和原始消息；
- 版本化需求说明；
- 受保护的确认、否定和手动选工具决策；
- 版本化上下文压缩快照；
- 结构化推荐结果和候选工具快照；
- Prompt版本、Provider、模型、输入摘要和运行状态。

迁移 `migrations/0005_task_workspace.sql` 包含：

- 按用户隔离的工具包草稿；
- AI草稿与任务的来源绑定；
- 草稿目标、工具选择、能力缺口和分段确认进度；
- 草稿修订号和更新时间。

业务代码通过 `IdentityRepository`、`ToolCatalogRepository`、`AiMemoryStore` 和 `TaskWorkspaceRepository` 访问数据，不在 HTTP 路由中编写 SQL。测试可替换为内存实现。

运行迁移：

```bash
pnpm db:migrate
```

已执行的迁移记录在 `schema_migrations`，不会重复运行。

开发环境可写入与前端 Mock 对齐的 16 个演示工具：

```bash
pnpm db:seed
```

种子脚本可重复执行，不会重复创建工具、版本、衍生关系或采用事件。正式环境不执行该命令。
