# AI 工具工作台：前端工程结构方案

- 文档状态：已落地，后续演进以实际基线为准
- 整理日期：2026-07-22
- 当前版本：v0.3
- 适用阶段：用户侧 MVP 前端开发
- 页面依据：[AI工具工作台-MVP页面清单与跳转关系](../product/AI工具工作台-MVP页面清单与跳转关系.md)
- 产品依据：[AI工具工作台-平台结构化总览](../product/AI工具工作台-平台结构化总览.md)

## 修订记录

- `v0.3`：用户侧 MVP 前端已完成；正式 AI 首页确定为 `/`，实际采用统一 `(workbench)` 路由组、CSS Modules 和轻量脚本链路检查。当前实现以[前端路由与状态基线](./AI工具工作台-前端路由与状态基线.md)为准。
- `v0.2`：工程方案确认并完成第一阶段落地；产品文档已归档到 `docs/`，17 张用户侧已选视觉稿已归档到 `design/selected/`，pnpm workspace、`apps/web`、共享 contracts 与根目录工程配置已经初始化。
- `v0.1`：形成开发前工程结构建议。

## 一、结论

第一版采用“轻量 monorepo + 单一 Web 应用 + 按业务功能分层”的工程结构。

当前技术路线：

- Next.js App Router；
- React + TypeScript；
- CSS Modules + 全局 CSS Variables 管理视觉令牌；
- pnpm workspace 管理仓库；
- TypeScript、ESLint、生产构建负责静态与构建检查；
- `tests/e2e` 轻量脚本负责路由、控件、链接和下载资源检查；
- 接入真实后端后再补充 Vitest 业务规则测试和 Playwright 核心用户流程；
- 第一阶段使用符合正式数据契约的 mock 数据，不把模拟数据直接写进页面组件；
- 等真实 API 明确后替换数据适配层，不重写页面和业务组件。

当前项目绝对路径包含中文字符，Next.js 16.2.10 的 Turbopack 生产构建在该路径下存在字符边界崩溃。首期开发和构建显式使用 Next.js 官方支持的 `--webpack` 选项，保留项目中文目录；待上游问题修复并验证后再切回 Turbopack。

选择 Next.js App Router 的原因：

1. 文件路由能直接对应已经确定的页面清单；
2. Route Groups 可以把公开页面、登录后工作区和维护后台分开，但不改变实际 URL；
3. `layout.tsx`、`loading.tsx`、`error.tsx` 和 `not-found.tsx` 适合统一承载工作台外壳与页面状态；
4. 后续需要少量 BFF 接口时可以使用 Route Handlers，但首期不把全部后端逻辑塞入前端项目。

官方结构依据：

- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Playwright](https://playwright.dev/docs/intro)
- [Vitest](https://vitest.dev/guide/)

## 二、仓库根目录

确认后建议将当前目录整理为：

```text
AI工具工作台设计/
├── apps/
│   └── web/                         # 当前唯一需要开发的 Web 应用
├── packages/
│   ├── contracts/                   # 跨前后端共享的数据类型与 Schema
│   └── config/                      # TypeScript、ESLint 等共享配置
├── docs/
│   ├── product/                     # 产品方案、页面清单与结构化总览
│   ├── architecture/                # 工程结构、数据契约与架构决策
│   └── standards/                   # 工具生产与上传标准
├── design/
│   ├── selected/                    # 已选定的页面视觉稿
│   ├── explorations/                # 未选方案，按需保留
│   └── README.md                    # 页面与视觉稿索引
├── tests/
│   └── e2e/                         # 跨页面核心流程测试
├── scripts/                         # 仓库级检查、资源整理等脚本
├── .github/
│   └── workflows/                   # CI：检查、测试和构建
├── .editorconfig
├── .gitignore
├── .npmrc
├── package.json                     # 仓库级命令
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md                        # 项目启动、开发和目录说明
```

### 2.1 首期不创建的目录

以下内容只预留架构位置，实际需要时再创建：

- `apps/api/`：独立业务 API 服务；
- `apps/worker/`：工具包检查、拆解和异步任务；
- `packages/ui/`：第二个前端应用出现后，再抽取跨应用 UI 包；
- `packages/ai/`：AI 提示词编译与模型适配成为独立能力后再抽取。

这样可以避免首期出现大量空目录和无效配置。

## 三、Web 应用目录

本节保留完整演进目标。当前 MVP 没有为了结构完整而建立空目录；真实已落地位置如下：

```text
apps/web/src/
├── app/(workbench)/                 # 当前全部用户侧路由
├── components/workbench/            # 工作台外壳
├── features/
│   ├── ai-packaging/
│   ├── tools/
│   ├── packages/
│   ├── me/
│   └── standards/
└── lib/
    ├── api/mock-repository.ts        # 统一演示数据适配层
    ├── download.ts
    └── workbench-store.tsx           # 跨页面演示状态
```

```text
apps/web/
├── public/
│   ├── brand/                       # Logo 与品牌资源
│   ├── images/                      # 页面静态图片
│   └── demo-assets/                 # 仅供演示下载的无敏感示例文件
├── src/
│   ├── app/                          # 只负责路由、布局和页面组装
│   │   ├── (public)/                 # 游客可访问
│   │   ├── (workspace)/              # 登录后的个人工作区
│   │   ├── (admin)/                  # 维护后台
│   │   ├── layout.tsx                # 根布局、字体和全局 Provider
│   │   ├── page.tsx                  # 根地址直接展示 AI 组包首页
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                       # Button、Input、Badge、Dialog 等基础组件
│   │   ├── shell/                    # 左侧导航、页头、内容容器
│   │   └── feedback/                 # 空、加载、错误、权限和风险状态
│   ├── features/                     # 按业务功能组织
│   │   ├── ai-packaging/
│   │   ├── tools/
│   │   ├── package-drafts/
│   │   ├── tasks/
│   │   ├── downloads/
│   │   ├── returns/
│   │   ├── standards/
│   │   ├── auth/
│   │   └── admin/
│   ├── domain/                       # Web 内使用的领域模型与枚举
│   ├── lib/
│   │   ├── api/                      # 请求客户端、错误转换、接口适配器
│   │   ├── auth/                     # 登录态与权限判断
│   │   ├── config/                   # 环境配置
│   │   ├── formatters/               # 日期、版本、人数等展示转换
│   │   └── utils/                    # 无业务含义的通用工具
│   ├── mocks/                        # 与正式契约一致的模拟数据和处理器
│   ├── stores/                       # 少量跨页面客户端状态
│   ├── styles/                       # 颜色、间距、圆角、阴影等视觉令牌
│   └── types/                        # 仅 Web 层使用的类型
├── tests/
│   ├── unit/
│   ├── component/
│   └── fixtures/
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── vitest.config.ts
```

## 四、页面路由结构

`app` 目录只表达 URL、布局、加载和错误边界，不在 `page.tsx` 中堆积业务逻辑。

早期方案按权限预留 `(public)`、`(workspace)` 和 `(admin)`。当前用户侧 MVP 为了共享同一工作台外壳，实际统一放在 `(workbench)`；权限由工作台外壳根据路径触发登录门槛。维护后台开始开发时再新增 `(admin)`，不提前创建空目录。

```text
src/app/
├── (public)/
│   ├── ai/page.tsx
│   ├── tools/page.tsx
│   ├── tools/[toolId]/page.tsx
│   └── standards/[[...slug]]/page.tsx
├── (workspace)/
│   ├── layout.tsx                    # 登录检查与个人工作区外壳
│   ├── tasks/[taskId]/page.tsx
│   ├── packages/drafts/[draftId]/confirm/page.tsx
│   ├── packages/[packageVersionId]/ready/page.tsx
│   └── me/
│       ├── tasks/page.tsx
│       ├── downloads/page.tsx
│       └── returns/
│           ├── page.tsx
│           ├── new/page.tsx
│           └── [returnId]/page.tsx
└── (admin)/
    ├── admin/layout.tsx              # 维护人员权限与后台外壳
    └── admin/
        ├── tools/
        │   ├── page.tsx
        │   ├── new/page.tsx
        │   └── [toolId]/
        │       ├── page.tsx
        │       └── versions/new/page.tsx
        ├── returns/
        │   ├── page.tsx
        │   └── [returnId]/page.tsx
        ├── content/page.tsx
        └── analytics/page.tsx
```

说明：

- 当前正式用户侧路由和页面状态见[前端路由与状态基线](./AI工具工作台-前端路由与状态基线.md)；
- 未来的 `(public)`、`(workspace)` 和 `(admin)` 只用于代码组织，不出现在 URL 中；
- AI 首页允许游客填写需求，真正发送时由业务层触发登录；
- `/tools`、`/tools/[toolId]` 和 `/standards` 允许游客浏览；
- `/tasks`、`/packages`、`/me` 必须登录；
- `/admin` 需要维护人员权限；
- 手动组包清单、版本选择、评价和风险确认仍作为抽屉、弹窗或页内状态，不增加路由。

## 五、功能模块内部结构

每个 `features/*` 模块采用相同但不过度拆分的结构：

```text
features/returns/
├── components/                      # 只在回传功能中使用的组件
├── api/                             # 回传接口调用与数据适配
├── model/                           # 状态、选择器和业务规则
├── schemas/                         # 表单与接口校验
├── utils/                           # 回传专用工具函数
├── fixtures/                        # 回传演示数据
└── index.ts                         # 对外公开入口
```

并非每个模块必须一开始拥有所有子目录。只有出现对应文件时才创建，避免形式化空结构。

### 5.1 模块边界

| 模块 | 负责内容 | 不负责内容 |
|---|---|---|
| `ai-packaging` | 需求梳理、任务说明、推荐与能力缺口 | 下载历史与回传审核 |
| `tools` | 工具目录、详情、版本与衍生展示 | 手动组包的全局状态 |
| `package-drafts` | AI/手动工具包草稿、确认和生成状态 | 本地 Agent 实际执行 |
| `tasks` | 任务历史和任务工作区恢复 | 工具资产维护 |
| `downloads` | 不可变下载凭证、重下、反馈入口 | 尚未下载的草稿 |
| `returns` | 回传上传、预检查、提交历史和贡献成果 | 平台在线修改工具 |
| `standards` | 规范阅读、模板和示例下载 | 工具上传与检查执行 |
| `admin` | 维护后台页面编排和权限入口 | 普通用户个人工作区 |

## 六、共享数据契约

`packages/contracts` 保存前端、未来 API 和 Worker 都要遵守的数据结构，首期至少包括：

当前 MVP 为便于快速校准，将第一批类型集中在 `packages/contracts/src/index.ts`。真实 API 开始实现并且类型继续增长时，再按以下领域拆分文件，对外仍由 `index.ts` 统一导出。

```text
packages/contracts/src/
├── tool.ts                           # Tool、ToolVersion、ToolLineage
├── task.ts                           # Task、RequirementBrief、Recommendation
├── package.ts                        # PackageDraft、PackageVersion、LockedTool
├── download.ts                       # DownloadReceipt
├── return.ts                         # ReturnSubmission、PrecheckResult、ReviewResult
├── standard.ts                       # StandardVersion、DownloadableResource
├── organization.ts                   # Department、Function、UserContext
├── common.ts                         # ID、时间、分页和状态通用类型
└── index.ts
```

约束：

- mock 数据、页面展示和未来真实 API 使用同一套契约；
- 状态名称不能由各页面自行发明；
- 提交版本、工具发布版本、下载包版本必须使用不同字段；
- 自动检查结果与人工审核结果必须使用不同结构；
- 文件上传对象不能直接包含业务原文件、密钥或日志内容。

## 七、组件分层

组件分为三层：

1. `components/ui`：无业务含义的基础组件，例如按钮、输入框、标签、弹窗、抽屉和分页；
2. `components/shell`：全局工作台外壳，例如侧栏、页头、组织入口和内容布局；
3. `features/*/components`：带业务语义的组件，例如工具卡片、下载凭证、回传时间线和检查问题列表。

禁止做法：

- 在 `components/ui` 中读取业务接口；
- 把完整页面做成一个数千行组件；
- 不同页面各自复制按钮、标签和状态颜色；
- 为一个页面专用组件过早建立跨项目公共包。

## 八、状态与数据策略

首期遵循以下顺序：

1. URL 参数负责可分享和可恢复状态，例如工具 ID、任务 ID、回传 ID、筛选条件；
2. 服务端或请求缓存负责远端业务数据；
3. 组件内部状态负责弹窗、展开和当前选择；
4. 只有当前手动组包、未提交输入等确实跨页面保留的状态进入 `stores/`；
5. 不把所有接口数据复制进一个全局状态仓库。

Mock 阶段必须通过 `lib/api` 的统一接口读取数据，页面不能直接 import 一份大型 JSON。后续接入真实 API 时，只替换适配器。

## 九、样式与视觉资产

当前页面采用按功能就近维护的 `*.module.css`，公共外壳样式位于 `components/workbench`，全局基础样式位于 `app/globals.css`。以下独立 token 文件是后续组件复用增多时的演进目标，不要求为了目录形式立即拆分。

```text
src/styles/
├── tokens.css                        # 品牌色、文字色、背景、边框、圆角、阴影
├── typography.css                    # 中文字号、字重和行高
└── utilities.css                     # 少量全局辅助样式
```

开发前将已选视觉稿复制到 `design/selected/`，按页面编号统一命名：

```text
U01-ai-home.png
U01-task-quick-confirm.png
U01-task-deep-dialog.png
U01-task-brief-confirm.png
U01-recommend-primary.png
U01-recommend-compare.png
U01-recommend-gap.png
U02-tool-workbench.png
U03-tool-detail.png
U04-package-confirm.png
U05-download-ready.png
U06-my-tasks.png
U07-my-downloads.png
U08-my-returns.png
U09-return-new.png
U10-return-detail.png
U11-standards.png
```

`design/README.md` 记录页面编号、路由、选中视觉稿和实现状态，避免设计图继续只存在于 Codex 临时生成目录。

## 十、测试与质量门槛

### 10.1 单元与组件测试

优先覆盖：

- 版本和状态格式化；
- 自动检查与人工审核状态映射；
- 工具包版本锁定；
- 回传资产拆分结果展示；
- 表单校验和敏感文件拦截；
- 权限判断。

### 10.2 端到端测试

首期至少覆盖五条主流程：

1. 游客填写需求 → 登录 → 恢复输入 → 创建任务；
2. AI 推荐 → 打包确认 → 下载完成；
3. 工具工作台 → 查看工具 → 单工具下载；
4. 下载凭证 → 发起回传 → 自动检查失败 → 重新上传 → 提交审核；
5. 维护人员 → 回传审核 → 通过发布 → 用户回传详情出现形成资产。

### 10.3 每次提交检查

- TypeScript 类型检查；
- ESLint；
- 单元测试；
- 生产构建；
- 核心页面可访问性检查；
- 关键流程 E2E 在合并前运行。

## 十一、环境与安全

- 仓库只提交 `.env.example`，不提交 `.env.local`；
- 浏览器可见环境变量必须与服务端密钥分离；
- mock 文件只使用虚构、脱敏数据；
- 演示下载包不得包含真实业务文件、Token、日志或客户资料；
- 上传校验不能只依赖前端，真实后端上线时必须再次验证；
- 文件名、MIME、大小、校验值和扫描结果作为结构化字段处理。

## 十二、实施顺序

确认本方案后按以下顺序推进：

1. 整理 `docs/` 与 `design/selected/`，建立稳定设计索引；
2. 初始化 workspace 和 `apps/web`；
3. 建立视觉令牌、基础组件和统一工作台外壳；
4. 先完成 U01 AI 首页静态骨架并验证视觉基线；
5. 按 U02–U11 逐页开发，每完成一页即进行视觉对比和交互检查；
6. 用户侧主流程可运行后，再设计并开发 A01–A07 维护后台；
7. 接入真实 API 前先冻结 `packages/contracts` 的第一版数据契约。

## 十三、需要确认的工程决策

本方案建议直接确定以下决策：

1. 使用 Next.js App Router，而不是 Vite 单页应用；
2. 使用 pnpm workspace，但首期只有 `apps/web`；
3. 采用按业务功能分层，不采用所有组件和接口混放的平铺结构；
4. 用户侧和维护后台放在同一个 Web 应用，通过 Route Groups、布局和权限分隔；
5. 当前先使用契约化 mock 数据，后续通过适配层接入真实 API；
6. 先开发用户侧 U01–U11，维护后台视觉与开发随后进行；
7. 所有已选视觉稿复制进项目 `design/selected/` 后再开始页面开发。
