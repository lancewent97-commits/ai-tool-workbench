export const productionStandard = {
  version: "v0.28",
  status: "当前版本 · 测试环境生效",
  publishedAt: "2026-07-20",
  title: "工具生产与上传标准",
} as const;

export const requiredToolFiles = [
  ["START_HERE.md", "使用入口", "告诉 Agent 应该先读什么、按什么顺序开始"],
  ["AGENT_INSTRUCTIONS.md", "调整规则", "明确允许配置、适配、替换和禁止改动项"],
  ["README.md", "工具说明", "写清用途、输入输出、使用方式与限制"],
  ["tool.yaml", "工具清单", "记录工具身份、入口、依赖与验证状态"],
  ["CHANGELOG.md", "版本记录", "说明相对来源版本的变化与回滚方式"],
  ["lineage.yaml", "来源关系", "记录主工具、来源版本和衍生关系"],
  ["return-manifest.yaml", "回传清单", "声明净化状态和准备发布的资产"],
  ["standards/TOOL_PRODUCTION_STANDARD.md", "生产标准", "随包携带当前完整标准"],
  ["policies/modification-policy.yaml", "修改边界", "约束本地 Agent 的修改范围"],
  ["validation/validation.md", "验证记录", "区分实际运行结果与未验证风险"],
  ["reports/completion-report.md", "完成报告", "记录最终交付、未完成项和复现方式"],
  ["reports/modification-report.md", "修改报告", "记录修改原因、影响和回滚方法"],
] as const;

export const standardDownloads = [
  ["通用空白工具模板", "标准 v0.28 · ZIP", "/demo-assets/tool-template.zip"],
  ["完整工具生产标准", "标准 v0.28 · Markdown", "/demo-source/tool-template/standards/TOOL_PRODUCTION_STANDARD.md"],
  ["单一执行工具合格示例", "标准 v0.28 · ZIP", "/demo-assets/single-tool-example.zip"],
  ["多组件组合工具合格示例", "标准 v0.28 · ZIP", "/demo-assets/composite-tool-example.zip"],
] as const;

export const automaticCheckLevels = [
  ["必须修复", "阻断提交", "缺少核心文件、包含敏感信息或目录结构不合格"],
  ["风险提醒", "允许继续", "未实际验证等情况必须如实保留"],
  ["优化建议", "不影响提交", "缺少脱敏样例等可用性改进"],
] as const;
