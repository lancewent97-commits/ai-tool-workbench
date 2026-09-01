# AI 工具工作台 Web

基于 Next.js 的用户工作台与统一维护系统。页面通过 API 完成登录、AI 任务、工具目录、打包下载、回传预检与审核等核心流程。

## 代码边界

- `src/app`：路由、布局和页面组装；
- `src/components`：跨功能共享的基础组件；
- `src/features`：按业务功能组织的界面、状态和接口适配；
- `src/lib`：请求、权限、配置与通用工具；
- `public/demo-assets`、`public/demo-source`：开发和自动化走查使用的脱敏演示资产。

## 主要路径

- `/`：AI 组包首页；
- `/tools`、`/tools/:toolId`：工具目录和工具详情；
- `/tasks/:taskId`：AI 任务工作区；
- `/packages/...`：打包确认与下载完成；
- `/me/...`：我的任务、下载与回传；
- `/standards`：工具生产规范与模板；
- `/admin/...`：工具、回传审核、AI 配置、规则与运营维护。

详细的数据归属、页面状态和兼容跳转见[前端路由与状态基线](../../docs/architecture/AI工具工作台-前端路由与状态基线.md)。
