# Prompt版本与上下文记忆

- 状态：实现基线
- 版本：v0.1
- 日期：2026-07-23

## Prompt目录

当前使用三个独立Prompt。需求理解根据真实脱敏评测迭代到v3，旧版本保留用于历史追溯：

```text
packages/ai/prompts/
├── requirement-understanding/v1
├── requirement-understanding/v2
├── requirement-understanding/v3  # 当前启用
├── recommendation/v1
├── recommendation/v2
├── recommendation/v3
├── recommendation/v4
├── recommendation/v5
├── recommendation/v6              # 当前启用
├── context-compression/v1
└── context-compression/v2          # 当前启用
```

每个版本包含：

- `manifest.json`：Prompt键、语义版本、系统文件和输出契约；
- `system.md`：该任务独立的系统约束。

代码通过`PromptRegistry`读取，业务代码不内嵌大段系统Prompt。

新增Prompt版本时创建新版本目录。已经产生AI运行记录的版本不得原地改写；测试阶段修改v1后，正式产生可追溯业务数据前必须冻结内容。

## 上下文组成

模型上下文按固定顺序组装：

```text
平台硬约束
→ 当前任务系统Prompt
→ 用户权限和候选工具范围
→ 最新任务说明
→ 受保护决策
→ 最近消息
→ 输出Schema
```

工具说明和用户内容属于不可信数据，不能作为系统指令执行。

外部开发Provider使用JSON输出模式，Prompt中明确要求只返回JSON；返回值仍必须通过共享Zod Schema。JSON模式只是输出格式约束，不能替代候选范围、受保护决策和正式环境禁用外部Provider等代码硬约束。

## 记忆分层

### 原始消息

`ai_messages`保存用户和AI的原始消息，不被摘要覆盖。

### 任务说明

`requirement_briefs`保存目标、输入、交付物、限制、假设、确认事实、否定项、待确认问题和手动选择版本。每次理解或本人确认都产生新版本。

### 决策

`ai_decisions`保存：

- 本人确认任务说明；
- 用户明确否定的方案；
- 用户手动选中的工具版本。

这些记录默认`protected_from_ai=true`。

### 上下文快照

`ai_context_snapshots`在对话超过近期消息阈值，或者进入任务说明、推荐等新阶段时生成。

快照必须保留：

- 已确认事实；
- 已否定项；
- 手动选择版本；
- 当前任务说明版本；
- 最后一条原始消息；
- 压缩Prompt版本。

### 推荐记忆

`ai_recommendations`同时保存结构化推荐和当时允许模型使用的候选工具版本。后续即使工具库更新，也能解释历史推荐。

## 压缩原则

- 压缩只减少发送给模型的上下文，不删除数据库历史；
- 快照存在时，后续模型输入使用结构化任务说明、最新快照和最近消息，不再发送完整历史；
- 已确认和已否定内容逐项保留；
- 推测不能升级为事实；
- 下载包只使用最终确认后的结构化任务说明，不携带完整聊天；
- 用户修正后产生新版本，不覆盖旧版本。
