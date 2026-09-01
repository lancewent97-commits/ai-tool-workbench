# AI 工具工作台 API

首期内部 API 当前已实现账号身份、真实工具目录、AI 需求推荐、本人任务与草稿、工具包生成、下载凭证，以及用户回传、自动预检查、维护审核和自动发布链路。默认使用 Mock AI；DeepSeek 只作为脱敏开发数据的可选适配器。正式对象存储和公司内部模型将在后续阶段接入。

## 当前接口

| 方法 | 路径 | 权限 | 用途 |
|---|---|---|---|
| GET | `/health` | 无 | 服务健康检查 |
| GET | `/ready` | 无 | API 与数据库就绪检查 |
| POST | `/v1/auth/activate` | 一次性激活令牌 | 员工首次设置密码 |
| POST | `/v1/auth/login` | 无 | 登录并创建 HttpOnly 会话 |
| POST | `/v1/auth/logout` | 登录用户 | 注销当前会话 |
| GET | `/v1/me` | 登录用户 | 获取当前用户 |
| POST | `/v1/admin/users/import` | 管理员 | 单个或批量创建内部账号 |
| GET | `/v1/tool-taxonomy` | 内网访问 | 获取可编辑模块、分类和标签 |
| GET | `/v1/tools` | 内网访问 | 搜索、筛选、排序和分页查询上架工具 |
| GET | `/v1/tools/:slug` | 内网访问 | 获取工具详情和当前版本 |
| GET | `/v1/tools/:slug/versions` | 内网访问 | 获取上架和已下架历史版本 |
| GET | `/v1/tools/:slug/derived` | 内网访问 | 获取已上架衍生工具 |
| POST | `/v1/ai/conversations` | 登录用户 | 创建AI任务并生成需求说明 |
| POST | `/v1/ai/conversations/:id/messages` | 任务本人 | 继续补充或修正需求 |
| POST | `/v1/ai/conversations/:id/confirm` | 任务本人 | 本人确认需求说明并生成推荐 |
| GET | `/v1/ai/conversations/:id` | 任务本人 | 恢复消息、任务说明、推荐和上下文版本 |
| GET | `/v1/tasks` | 登录用户 | 分页读取本人的服务端任务列表 |
| GET | `/v1/package-drafts/:id` | 草稿本人 | 恢复工具包草稿和确认进度 |
| PUT | `/v1/package-drafts/:id` | 草稿本人 | 创建或更新工具包草稿 |
| POST | `/v1/package-drafts/:id/generate` | 草稿本人 | 生成不可变工具包版本 |
| GET | `/v1/downloads` | 登录用户 | 查询本人的全部下载凭证 |
| GET | `/v1/downloads/:downloadId/file` | 下载凭证本人 | 重新下载原锁定文件 |
| GET | `/v1/returns` | 登录用户 | 查询本人的回传记录 |
| GET | `/v1/returns/:returnId` | 回传本人 | 查询回传、不可变版本和事件 |
| POST | `/v1/returns/precheck` | 登录用户 | 流式上传 ZIP 并执行自动预检查 |
| POST | `/v1/returns/:returnId/submit` | 回传本人 | 将预检查通过的当前版本提交审核 |
| GET | `/v1/returns/:returnId/versions/:versionId/file` | 回传本人 | 下载仍被安全保留的历史版本 |
| GET | `/v1/admin/returns` | 维护人员/管理员 | 查询已经进入人工审核的回传 |
| GET | `/v1/admin/returns/:returnId` | 维护人员/管理员 | 查看回传来源、检查结果、资产清单和过程记录 |
| GET | `/v1/admin/returns/:returnId/versions/:versionId/file` | 维护人员/管理员 | 下载审核范围内保留的回传版本 |
| POST | `/v1/admin/returns/:returnId/decision` | 维护人员/管理员 | 通过并自动发布，或填写原因后不通过 |
| GET | `/v1/admin/ai/status` | 维护人员/管理员 | 获取脱敏的模型、Provider、Prompt 版本和平台约束 |
| GET | `/v1/admin/users` | 管理员 | 获取平台内部账号和角色状态 |
| GET | `/v1/admin/audit-events` | 管理员 | 获取平台级只读审计事件 |

批量创建接口当前接收 JSON 数组，一次最多 500 人。后续维护后台可以读取 CSV 模板并转换为同一请求，不在 API 中维护第二套导入规则。

工具列表支持参数：

- `q`：名称和能解决的问题的关键词模糊匹配；
- `module`、`category`：按 slug 筛选；
- `tags`：逗号分隔或重复传入，多个标签按“同时具备”匹配；
- `sort`：`newest`、`popular`、`rating` 或 `name`；
- `page`、`pageSize`：分页，单页最多 100 条。

普通目录只返回已上架工具。历史版本下架后仍在版本列表显示，但下载地址返回 `null`。

AI接口默认使用确定性的 Mock Provider，目的是先验证记忆、约束、Prompt版本和推荐卡片协议。开发环境也可显式使用 DeepSeek `external-dev` Provider；正式环境禁止外部开发Provider。

AI调用遵循：

- 最多三轮关键澄清，每轮最多三个问题；
- 清晰后先进入任务说明确认，不直接推荐；
- 本人确认后才检索已上架工具并生成推荐；
- 手动选择的准确工具版本不可被AI静默删除；
- 推荐只能引用本次候选工具和版本；
- 对话较长或阶段变化时生成版本化上下文快照；
- 每次调用记录Prompt和模型版本，但不记录密钥。

任务与草稿遵循：

- 任务列表只查询当前登录用户的AI任务；
- 工具包草稿按用户和草稿ID隔离；
- AI草稿必须关联当前用户拥有的AI任务；
- 草稿保存后任务阶段变为`package-review`；
- 目标、锁定工具、能力缺口和分段确认进度均可刷新恢复；
- 草稿更新增加服务端修订号，但当前尚未生成不可变工具包版本。

回传遵循：

- 必须绑定当前用户拥有的下载凭证，来源版本不能由浏览器自行声明；
- 每次重新上传新增一个不可变版本，旧文件、检查结论和提交事件不会被覆盖；
- 自动检查识别必备结构、来源版本、空模板、路径风险、敏感文件和常见密钥模式；
- 存在必须修复项时不得提交审核，并生成可交给任意本地 Agent 的 `FIX_PROMPT.md`；
- 发现敏感风险的 ZIP 会立即删除，只保留问题记录；普通结构问题包保留供本人追溯；
- 当前压缩包与解压后总体积上限均为 20GB，浏览器使用 8MB 分片续传，服务端流式合并和异步预检；正式提升上限前必须同时完成对象存储、病毒扫描与压力测试；
- 回传文件和真实内部资料不发送给 DeepSeek 或其他外部开发 Provider。

人工审核与发布遵循：

- 只有 `maintainer` 和 `admin` 角色可读取和处理审核队列；
- 首期决定只有 `approved` 与 `rejected`，平台不提供包内文件或资产资料在线编辑；
- 通过时按 `return-manifest.yaml` 的资产清单发布；未声明资产的当前规则回传仅形成一个完整组合工具；
- 每个明确声明的发布资产必须是回传 ZIP 内独立 ZIP，衍生工具必须指向本次锁定来源的真实工具与版本；
- 发布事务同时创建工具、不可变版本、模块/分类/标签关系、衍生关系和发布记录；
- 通过后立即上架并成为该新工具的默认最新版本；审核决定、原回传、来源凭证和事件时间线永久保留；
- 不通过原因在上传者“我的回传”中显示，由上传者带回本地 Agent 修正后新增版本。

统一维护系统遵循：

- `/admin` 作为统一入口，不把回传审核做成孤立后台；
- 工具、分类、标签、下载与评分页面读取真实目录数据；
- 管理员账号列表和审计记录为平台级视图，普通维护人员无权访问；
- AI 状态接口只返回是否配置密钥，不返回密钥内容；
- 当前 Prompt 由受版本控制的代码目录加载，后台只读展示真实生效版本；
- Prompt 在线编辑必须等版本仓库、自动评测、发布和回滚真正接通后再开放。

## 本地启动

1. 将仓库根目录 `.env.example` 复制为 `.env.local`，只修改本机值。
2. 启动 Docker Desktop 或其他 Docker 服务。
3. 启动开发数据库：

   ```bash
   pnpm db:up
   ```

4. 执行数据库迁移：

   ```bash
   pnpm db:migrate
   ```

5. 可选：写入开发演示工具：

   ```bash
   pnpm db:seed
   ```

6. 创建首个管理员邀请：

   ```bash
   pnpm bootstrap:admin
   ```

   命令只在终端输出一次激活令牌。不要把令牌保存到仓库或聊天。

7. 启动 API：

   ```bash
   pnpm dev:api
   ```

默认地址为 `http://127.0.0.1:3100`。

### 可选：DeepSeek脱敏开发模式

不要把个人Key写入仓库或发到聊天中。在本机`.env.local`或当前Shell设置：

```bash
AI_PROVIDER=external-dev
EXTERNAL_AI_DATA_MODE=sanitized-test
DEEPSEEK_API_KEY=你的本机Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

然后启动API。缺少Key、没有显式开启脱敏测试模式，或在生产环境选择`external-dev`，服务都会拒绝启动。发送前还会拦截常见手机号、身份证号、邮箱、API密钥和口令模式；这只是额外保护，不代表允许发送真实内部数据。

运行五条脱敏需求评测：

```bash
EXTERNAL_AI_DATA_MODE=sanitized-test DEEPSEEK_API_KEY=你的本机Key pnpm eval:deepseek
```

评测只输出用例通过或失败，不打印模型原始内容。

调试单条用例时可增加：

```bash
EVAL_CASE_ID=clear-pdf-table EXTERNAL_AI_DATA_MODE=sanitized-test DEEPSEEK_API_KEY=你的本机Key pnpm eval:deepseek
```

## 安全边界

- 不开放员工自行注册；
- 密码使用 scrypt 加盐哈希；
- 激活令牌和会话令牌在数据库中只保存 SHA-256 摘要；
- 浏览器会话使用 HttpOnly、SameSite=Strict Cookie；
- 正式环境强制安全 Cookie；
- 登录失败不暴露账号是否存在；
- 管理操作写入审计事件；
- `.env.local` 已被 Git 忽略。

## 测试

```bash
pnpm --filter @ai-tool-workbench/api test
```

测试使用内存仓库或临时文件，不依赖本地 PostgreSQL，覆盖身份流程、权限拦截、目录筛选、详情、历史版本、衍生关系、AI任务、草稿隔离、DeepSeek配置边界，以及回传结构、来源、敏感内容检查、独立资产识别和审核发布文件提取。
