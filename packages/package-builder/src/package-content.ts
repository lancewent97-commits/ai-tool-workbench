import type {
  PackageDraft,
  PlannedComponent,
  ToolKind,
  VerificationState,
} from "@ai-tool-workbench/contracts";

export const packageStandardVersion = "v0.28";

export type LockedTool = {
  toolId: string;
  toolSlug: string;
  toolName: string;
  toolKind: ToolKind;
  versionId: string;
  version: string;
  purpose: string;
  replaceable: boolean;
  problem: string;
  result: string;
  principle: string;
  verification: VerificationState;
  standardVersion: string;
  risks: string[];
  artifactPath: string;
  artifactDownloadUrl: string;
};

export type PackageBuildInput = {
  packageVersionId: string;
  packageVersion: string;
  createdAt: string;
  draft: PackageDraft;
  tools: LockedTool[];
  productionStandard: string;
};

export type PackageTextFile = {
  path: string;
  content: string;
};

export function archivePathSegment(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value)) {
    throw new Error(`不安全的工具包路径片段：${value}`);
  }
  return value;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function yamlList(values: string[], indent = 2) {
  if (!values.length) return `${" ".repeat(indent)}[]`;
  return values.map((value) => `${" ".repeat(indent)}- ${yamlString(value)}`).join("\n");
}

function goal(draft: PackageDraft) {
  return draft.goal?.trim() || "先阅读包内工具说明，再向用户确认本次目标。";
}

function toolLine(tool: LockedTool) {
  return `${tool.toolName} ${tool.version}：${tool.purpose}`;
}

export function createStartPrompt(input: PackageBuildInput) {
  const tools = input.tools.length
    ? input.tools.map((tool) => toolLine(tool)).join("；")
    : "当前没有锁定现成工具";
  const deliverables = input.draft.deliverables.length
    ? input.draft.deliverables.join("、")
    : "交付物尚未限定";
  const gaps = input.draft.plannedComponents.length
    ? `还需处理能力缺口：${input.draft.plannedComponents.map((item) => item.name).join("、")}。`
    : "当前没有已知能力缺口。";
  const toolSentence = /[。！？.!?]$/.test(tools) ? tools : `${tools}。`;
  return [
    "请先完整读取 START_HERE.md、AGENT_INSTRUCTIONS.md、TASK.md、tool.yaml、policies/modification-policy.yaml 和 standards/TOOL_PRODUCTION_STANDARD.md。",
    `本次目标：${goal(input.draft)}`,
    `锁定工具：${toolSentence}`,
    `期望交付：${deliverables}。${gaps}`,
    "先说明你对目标、各工具职责、调整边界和验收标准的理解，再给出执行计划并等待我确认。",
    "未经确认不要执行；不得覆盖包内原始工具；需要替换、修改或新建组件时，必须先说明原因、影响和回滚方式，取得确认后在衍生副本中处理，并完整记录变更与验证结果。",
  ].join("\n");
}

function taskMarkdown(input: PackageBuildInput) {
  const deliverables = input.draft.deliverables.length
    ? input.draft.deliverables.map((item) => `- ${item}`).join("\n")
    : "- 尚未限定；开始前向用户确认";
  const tools = input.tools.length
    ? input.tools.map((tool) => `- ${toolLine(tool)}；${tool.replaceable ? "经用户确认后可替换" : "不得替换"}`).join("\n")
    : "- 无现成工具";
  const gaps = input.draft.plannedComponents.length
    ? input.draft.plannedComponents.map((item) => [
        `### ${item.name}`,
        "",
        `- 临时组件 ID：${item.id}`,
        `- 需要解决：${item.goal}`,
        `- 验收目标：${item.acceptance.join("；")}`,
        "- 处理要求：先评估复用、配置或适配；确需新建时按平台生产标准完成。",
      ].join("\n")).join("\n\n")
    : "无。";
  return `# TASK

## 最终目标

${goal(input.draft)}

## 期望交付

${deliverables}

## 锁定工具及职责

${tools}

## 能力缺口

${gaps}

## 完成条件

- 对照上述目标和交付物逐项说明完成情况。
- 使用最小样本验证后再批量处理。
- 不把真实业务输入、交付结果、密钥、日志或缓存放入净化回传包。
- 在 \`reports/completion-report.md\` 记录实际计划、变化、验证、未完成项和复现方法。
`;
}

function toolYaml(input: PackageBuildInput) {
  const tools = input.tools.length
    ? input.tools.map((tool) => `  - tool_id: ${yamlString(tool.toolId)}
    slug: ${yamlString(tool.toolSlug)}
    name: ${yamlString(tool.toolName)}
    kind: ${yamlString(tool.toolKind)}
    version_id: ${yamlString(tool.versionId)}
    version: ${yamlString(tool.version)}
    purpose: ${yamlString(tool.purpose)}
    replaceable: ${tool.replaceable}
    verification: ${yamlString(tool.verification)}
    source_standard_version: ${yamlString(tool.standardVersion)}
    artifact: ${yamlString(`tool-files/${archivePathSegment(tool.toolSlug)}/${archivePathSegment(tool.toolSlug)}-${archivePathSegment(tool.version)}.zip`)}`)
    : "  []";
  const components = input.draft.plannedComponents.length
    ? input.draft.plannedComponents.map((item) => `  - temporary_id: ${yamlString(item.id)}
    name: ${yamlString(item.name)}
    goal: ${yamlString(item.goal)}
    prompt_file: ${yamlString(`planned-components/${archivePathSegment(item.id)}/PRODUCTION_PROMPT.md`)}`).join("\n")
    : "  []";
  return `schema_version: "1"
standard_version: ${yamlString(packageStandardVersion)}
package:
  id: ${yamlString(input.packageVersionId)}
  draft_id: ${yamlString(input.draft.id)}
  name: ${yamlString(input.draft.name)}
  version: ${yamlString(input.packageVersion)}
  kind: "composite"
  source: ${yamlString(input.draft.source)}
  source_task_id: ${input.draft.taskId ? yamlString(input.draft.taskId) : "null"}
  created_at: ${yamlString(input.createdAt)}
goal: ${yamlString(goal(input.draft))}
deliverables:
${yamlList(input.draft.deliverables)}
locked_tools:
${tools}
planned_components:
${components}
`;
}

function agentInstructions(input: PackageBuildInput) {
  return `# Agent 使用与调整规则

## 开始前必须按顺序阅读

1. \`START_HERE.md\`
2. \`TASK.md\`
3. \`tool.yaml\`
4. 各工具的 \`SOURCE.md\` 和其原始压缩包内说明
5. \`policies/modification-policy.yaml\`
6. \`validation/validation.md\`
7. \`standards/TOOL_PRODUCTION_STANDARD.md\`

## 强制行为

- 先检查操作系统、依赖、账号、网络、费用、权限和数据去向。
- 先向用户复述任务理解并提交计划，等待确认后才执行。
- 由你根据目标规划工具使用方式；本包不预设固定工作流。
- 优先调整参数和配置，其次做外部适配；最后才考虑修改或替换工具。
- 不得直接覆盖 \`tool-files/\` 中的锁定原始工具。
- 任何替换、能力边界变化、输入输出变化、外部数据传输、付费调用或不可逆操作，都必须重新确认。
- 新建、适配或修改的内容必须进入独立衍生目录，并保留来源、版本、差异和回滚方法。
- 对每项交付物执行可说明的验证，并如实记录“已验证、部分验证或未验证”。
- 完成后填写 \`reports/completion-report.md\`；发生修改时同时填写 \`reports/modification-report.md\`。
- 如需回传，只输出净化后的 \`return-package/\`，排除真实输入、最终业务交付物、密钥、账号、Token、Cookie、日志、缓存和临时文件。

## 用户已确认信息

最终目标：${goal(input.draft)}

已确认字段：${input.draft.userConfirmedFields.length ? input.draft.userConfirmedFields.join("、") : "未单独标记"}
`;
}

function modificationPolicy(input: PackageBuildInput) {
  const replacements = input.tools.map((tool) =>
    `  - slug: ${yamlString(tool.toolSlug)}\n    replaceable_after_confirmation: ${tool.replaceable}`,
  ).join("\n") || "  []";
  return `schema_version: "1"
original_artifacts:
  immutable: true
  location: "tool-files/"
adjustment_priority:
  - "configuration"
  - "external-adapter"
  - "derived-copy"
  - "replacement-after-user-confirmation"
tool_replacement_rules:
${replacements}
requires_user_reconfirmation:
  - "更换或移除锁定工具"
  - "修改最终目标、交付物或验收标准"
  - "改变输入输出格式或能力边界"
  - "将数据发送到新的外部服务"
  - "引入费用、账号、密钥、管理员权限或不可逆操作"
required_records:
  - "lineage.yaml"
  - "CHANGELOG.md"
  - "reports/completion-report.md"
  - "reports/modification-report.md"
return_package:
  must_be_sanitized: true
  prohibited:
    - "真实业务输入"
    - "最终业务交付物"
    - "密钥、Token、密码、Cookie、私钥和认证文件"
    - "日志、缓存、临时文件和本地环境"
`;
}

function plannedPrompt(component: PlannedComponent) {
  return `# 待生产组件：${component.name}

- 临时组件 ID：${component.id}
- 需要解决的问题：${component.goal}
- 验收目标：${component.acceptance.join("；")}

## 给本地 Agent 的生产要求

${component.prompt}

开始前先判断能否通过复用、配置、适配或合并现有工具达到目标。确需新建时，严格按照包内 \`standards/TOOL_PRODUCTION_STANDARD.md\` 生产，不覆盖任何来源工具，并在完成报告中记录最终归类和验证结果。
`;
}

function sourceMarkdown(tool: LockedTool) {
  return `# ${tool.toolName} ${tool.version}

- 平台工具 ID：${tool.toolId}
- 工具 slug：${tool.toolSlug}
- 锁定版本 ID：${tool.versionId}
- 主类型：${tool.toolKind}
- 本包职责：${tool.purpose}
- 能解决的问题：${tool.problem}
- 预计结果：${tool.result}
- 实现原理：${tool.principle}
- 验证状态：${tool.verification}
- 来源标准版本：${tool.standardVersion}
- 原始下载位置：${tool.artifactDownloadUrl}
- 替换规则：${tool.replaceable ? "只有用户明确确认后才可替换" : "不得替换"}

原始工具文件以同目录压缩包形式锁定保存。先阅读压缩包内说明；如需调整，只能复制到衍生目录中操作。
`;
}

export function compilePackageTextFiles(input: PackageBuildInput): PackageTextFile[] {
  const startPrompt = createStartPrompt(input);
  const files: PackageTextFile[] = [
    {
      path: "START_HERE.md",
      content: `# ${input.draft.name}\n\n这个包用于：${goal(input.draft)}\n\n请保留完整 ZIP，或把解压后的完整文件夹交给本地 Agent。\n\n## 可直接复制给 Agent\n\n${startPrompt}\n\n等待 Agent 说明理解和计划，确认后再开始。\n`,
    },
    { path: "AGENT_INSTRUCTIONS.md", content: agentInstructions(input) },
    {
      path: "README.md",
      content: `# ${input.draft.name}\n\n这是平台根据用户最终确认内容生成的通用 Agent 工具包。它包含锁定工具原始文件、任务目标、交付要求、调整边界、生产标准和报告模板，不包含平台完整对话，也不会预设固定工作流。\n\n从 \`START_HERE.md\` 开始。\n`,
    },
    { path: "TASK.md", content: taskMarkdown(input) },
    { path: "tool.yaml", content: toolYaml(input) },
    {
      path: "CHANGELOG.md",
      content: `# 版本变化\n\n## ${input.packageVersion} - ${input.createdAt}\n\n- 根据草稿 ${input.draft.id} 首次生成或重新生成工具包版本。\n- 锁定 ${input.tools.length} 个工具版本，登记 ${input.draft.plannedComponents.length} 个待生产组件。\n`,
    },
    {
      path: "lineage.yaml",
      content: `schema_version: "1"\npackage_version_id: ${yamlString(input.packageVersionId)}\nsource_task_id: ${input.draft.taskId ? yamlString(input.draft.taskId) : "null"}\nsource_draft_id: ${yamlString(input.draft.id)}\nsource_draft_revision_snapshot: true\ncomponent_sources:\n${input.tools.length ? input.tools.map((tool) => `  - tool_id: ${yamlString(tool.toolId)}\n    version_id: ${yamlString(tool.versionId)}\n    relationship: "locked-source"`).join("\n") : "  []"}\n`,
    },
    {
      path: "return-manifest.yaml",
      content: `schema_version: "1"\nsource_package_version_id: ${yamlString(input.packageVersionId)}\nreturn_status: "not-prepared"\nreturn_directory: "return-package/"\nrequired_assets:\n  - "调整后的组合工具（如有）"\n  - "衍生组件（如有）"\n  - "新生产组件（如有）"\n  - "完成报告与修改报告"\nexcluded_assets:\n  - "真实业务输入和最终业务交付物"\n  - "凭证、个人信息、日志、缓存和临时文件"\n# 本地 Agent 完成后可在 assets 中逐项声明可独立发布的组合工具、衍生工具和新工具。\n# 每项至少填写 type、name、problem、result、principle、reason 和 artifact。\n# derived 还必须填写本包 tool.yaml 中真实的 source_tool_id 与 source_version_id。\n# 未填写时，平台把整个合格回传包作为一个组合工具候选，不自动猜测组件拆分。\nassets: []\n`,
    },
    { path: "standards/TOOL_PRODUCTION_STANDARD.md", content: input.productionStandard },
    { path: "policies/modification-policy.yaml", content: modificationPolicy(input) },
    {
      path: "validation/validation.md",
      content: `# 验证计划与记录\n\n## 最小验证建议\n\n1. 用不含敏感信息的小样本检查每个工具能否读取输入。\n2. 检查各工具产物是否满足下一步所需格式；不一致时先提出适配方案。\n3. 对照 TASK.md 逐项检查最终交付物。\n4. 如未实际运行，必须明确记录为“未验证”，不得写成已通过。\n\n## 记录\n\n- 当前状态：尚未由本地 Agent 验证\n- 验证环境：待填写\n- 样本范围：待填写\n- 结果：待填写\n- 已知问题：待填写\n`,
    },
    {
      path: "reports/completion-report.md",
      content: "# 完成报告\n\n- 用户确认的最终目标：\n- 实际使用的工具及版本：\n- Agent 实际执行计划摘要：\n- 已完成目标：\n- 最终交付物说明：\n- 配置、适配和修改：\n- 新生产、替换或移除的工具：\n- 验证方法和结果：\n- 未完成目标和已知问题：\n- 复现方法：\n- 净化回传包状态：\n",
    },
    {
      path: "reports/modification-report.md",
      content: "# 修改报告\n\n- 来源工具与锁定版本：\n- 修改原因：\n- 用户确认记录：\n- 修改位置（必须为衍生副本）：\n- 输入输出及能力边界变化：\n- 验证结果：\n- 回滚方法：\n- 新版本或衍生关系建议：\n",
    },
    {
      path: "examples/input/README.md",
      content: "# 输入样例\n\n放置虚构或脱敏的最小输入样例。不要放入真实业务数据。\n",
    },
    {
      path: "examples/expected-output/README.md",
      content: "# 预期输出样例\n\n记录预期结构和验收方式；不要放入真实业务交付物。\n",
    },
    {
      path: "return-package/README.md",
      content: "# 净化回传目录\n\n只有完成清理并按 return-manifest.yaml 核对后，才把可复用资产放入此目录并回传平台。\n\n每个准备独立发布的资产应整理为单独 ZIP，并在顶层 return-manifest.yaml 的 assets 中声明；未声明时平台只会把完整回传包作为一个组合工具候选。\n",
    },
  ];
  for (const tool of input.tools) {
    files.push({
      path: `tool-files/${archivePathSegment(tool.toolSlug)}/SOURCE.md`,
      content: sourceMarkdown(tool),
    });
  }
  for (const component of input.draft.plannedComponents) {
    files.push({
      path: `planned-components/${archivePathSegment(component.id)}/PRODUCTION_PROMPT.md`,
      content: plannedPrompt(component),
    });
  }
  return files;
}
