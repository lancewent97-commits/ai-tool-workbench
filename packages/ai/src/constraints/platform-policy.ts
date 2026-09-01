import type {
  RecommendationCard,
  RecommendationResult,
  RequirementBrief,
} from "@ai-tool-workbench/contracts";
import {
  candidateSupportsCapability,
  requiredCapabilities,
} from "../capabilities/capability-rules.js";
import type { ToolCandidate } from "../types.js";

export const platformAiPolicy = Object.freeze({
  maxClarificationRounds: 2,
  maxQuestionsPerTurn: 3,
  maxRecentMessages: 6,
  maxCandidates: 12,
});

function sentence(value: string) {
  return /[。！？.!?]$/.test(value) ? value : `${value}。`;
}

function capabilityGap(
  capability: ReturnType<typeof requiredCapabilities>[number],
  brief: RequirementBrief,
) {
  return {
    name: capability.name,
    goal: `补齐“${capability.name}”能力，确保完成“${brief.goal}”`,
    reason: `当前候选工具没有明确声明“${capability.name}”能力，平台不会把未声明能力视为已覆盖`,
    productionPrompt: [
      `请严格按照平台《工具生产与上传标准》生产一个用于“${capability.name}”的组件。`,
      `任务总目标：${sentence(brief.goal)}`,
      `输入材料：${sentence(brief.input || "沿用任务说明中的上一步产物")}`,
      `最终交付：${sentence(brief.deliverables.join("、") || "以任务说明为准")}`,
      `该组件必须明确输入输出格式，并用最小脱敏样本验证“${capability.name}”确实可完成。`,
      "优先复用或适配现有组件；确需新建时不得覆盖原工具，必须建立衍生目录、来源记录、修改记录、回滚方式和验证报告。",
    ].join("\n"),
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function reconcileCardCoverage(
  card: RecommendationCard,
  allowed: Map<string, ToolCandidate>,
  brief: RequirementBrief,
): RecommendationCard {
  const cardCandidates = card.tools
    .map((tool) => allowed.get(tool.toolVersionId))
    .filter((candidate): candidate is ToolCandidate => candidate !== undefined);
  const unsupported = requiredCapabilities(brief).filter((capability) =>
    !cardCandidates.some((candidate) =>
      candidateSupportsCapability(candidate, capability)));
  const existingNames = new Set(card.gaps.map((gap) => gap.name));
  const gaps = [
    ...card.gaps,
    ...unsupported
      .filter((capability) => !existingNames.has(capability.name))
      .map((capability) => capabilityGap(capability, brief)),
  ];

  if (gaps.length === 0) {
    return {
      ...card,
      coverage: "complete",
      gaps: [],
    };
  }

  const missingNames = gaps.map((gap) => gap.name).join("、");
  return {
    ...card,
    title: card.tools.length > 0 ? "现有工具 + 待补齐组件" : "待生产组件方案",
    summary: card.tools.length > 0
      ? `已有${card.tools.length}个工具可完成部分步骤；补齐“${missingNames}”后才能完成全部交付。`
      : `平台暂无足够的现成工具；需要先生产“${missingNames}”后再完成任务。`,
    reason: card.tools.length > 0
      ? `现有工具只覆盖其清单明确声明的能力；“${missingNames}”尚未覆盖，已作为待生产组件加入工具包。完成并验证这些组件后，才能按任务说明验收。`
      : `当前候选工具没有覆盖任务所需能力；平台保留完整目标，并为“${missingNames}”生成生产说明，避免把不匹配工具描述成可完成方案。`,
    coverage: "partial",
    gaps,
    limitations: unique([
      ...card.limitations,
      "本方案当前不能独立完成全部交付；必须先补齐并验证待生产组件。",
    ]),
  };
}

export function reconcileRecommendationCoverage(
  result: RecommendationResult,
  candidates: ToolCandidate[],
  brief: RequirementBrief,
): RecommendationResult {
  const allowed = new Map(
    candidates.map((candidate) => [candidate.toolVersionId, candidate]),
  );
  return {
    ...result,
    primary: result.primary
      ? reconcileCardCoverage(result.primary, allowed, brief)
      : null,
    alternatives: result.alternatives.map((card) =>
      reconcileCardCoverage(card, allowed, brief)),
  };
}

export function assertRecommendationAllowed(
  result: RecommendationResult,
  candidates: ToolCandidate[],
  brief: RequirementBrief,
) {
  if (!result.primary) {
    throw new Error("AI没有生成最推荐方案");
  }
  if (result.primary.kind !== "primary") {
    throw new Error("最推荐方案类型不正确");
  }
  if (result.alternatives.some((option) => option.kind !== "alternative")) {
    throw new Error("备选方案类型不正确");
  }

  const allowed = new Map(
    candidates.map((candidate) => [candidate.toolVersionId, candidate]),
  );
  const recommended = [
    ...result.primary.tools,
    ...result.alternatives.flatMap((option) => option.tools),
  ];
  for (const tool of recommended) {
    const candidate = allowed.get(tool.toolVersionId);
    if (!candidate) {
      throw new Error(`AI推荐了候选范围外的工具版本: ${tool.toolVersionId}`);
    }
    if (
      tool.toolId !== candidate.toolId
      || tool.toolSlug !== candidate.toolSlug
      || tool.toolName !== candidate.toolName
      || tool.version !== candidate.version
      || tool.source !== candidate.source
    ) {
      throw new Error(`AI改写了候选工具身份: ${tool.toolVersionId}`);
    }
    const overstated = requiredCapabilities({
      ...brief,
      goal: tool.purpose,
      input: "",
      deliverables: [],
      constraints: [],
    }).find((capability) =>
      !candidateSupportsCapability(candidate, capability));
    if (overstated) {
      throw new Error(
        `AI夸大了工具“${tool.toolName}”在方案中的职责: ${overstated.name}`,
      );
    }
  }

  for (const option of [result.primary, ...result.alternatives]) {
    const versionIds = option.tools.map((tool) => tool.toolVersionId);
    if (new Set(versionIds).size !== versionIds.length) {
      throw new Error(`方案包含重复工具版本: ${option.id}`);
    }
    if (option.coverage === "complete" && option.gaps.length > 0) {
      throw new Error(`完整覆盖方案仍包含能力缺口: ${option.id}`);
    }
    if (option.coverage === "partial" && option.gaps.length === 0) {
      throw new Error(`部分覆盖方案没有说明能力缺口: ${option.id}`);
    }
  }

  const primaryVersionIds = new Set(result.primary.tools.map((tool) => tool.toolVersionId));
  const primaryCandidates = result.primary.tools.map(
    (tool) => allowed.get(tool.toolVersionId)!,
  );
  const primaryComposites = primaryCandidates.filter(
    (candidate) => candidate.kind === "composite",
  );
  for (const selectedId of brief.selectedToolVersionIds) {
    if (!primaryVersionIds.has(selectedId)) {
      throw new Error(`AI静默移除了用户手动选择的工具版本: ${selectedId}`);
    }
  }

  for (const deliverable of brief.deliverables) {
    if (!result.primary.deliverables.includes(deliverable)) {
      throw new Error(`AI静默移除了已确认交付物: ${deliverable}`);
    }
  }

  for (const candidate of primaryCandidates) {
    if (candidate.kind === "composite" || candidate.source === "user-selected") continue;
    const contributed = requiredCapabilities(brief).filter((capability) =>
      candidateSupportsCapability(candidate, capability));
    if (
      contributed.length > 0
      && primaryComposites.some((composite) =>
        contributed.every((capability) =>
          candidateSupportsCapability(composite, capability)))
    ) {
      throw new Error(`组合工具已覆盖重复组件: ${candidate.toolSlug}`);
    }
  }

  if (result.primary.coverage === "complete") {
    if (result.primary.tools.length === 0 || result.primary.gaps.length > 0) {
      throw new Error("完整覆盖方案的工具或能力缺口不一致");
    }
    const unsupported = requiredCapabilities(brief).filter((capability) =>
      !primaryCandidates.some((candidate) =>
        candidateSupportsCapability(candidate, capability)));
    if (unsupported.length > 0) {
      throw new Error(
        `完整覆盖方案夸大了工具能力: ${unsupported.map((item) => item.name).join("、")}`,
      );
    }
  } else if (result.primary.gaps.length === 0) {
    throw new Error("部分覆盖方案没有说明能力缺口");
  }
}

export function assertExternalModelInputAllowed(
  environment: "development" | "test" | "production",
  provider: string,
) {
  if (environment === "production" && provider === "external-dev") {
    throw new Error("正式环境禁止使用外部开发模型");
  }
}
