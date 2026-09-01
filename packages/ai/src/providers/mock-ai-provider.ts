import { randomUUID } from "node:crypto";
import type {
  ClarificationQuestion,
  RecommendationCard,
  RequirementBrief,
} from "@ai-tool-workbench/contracts";
import { buildDeterministicSummary } from "../context/context-compressor.js";
import type { AiProvider, RequirementDraft, ToolCandidate } from "../types.js";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function detectInput(text: string) {
  const inputs: string[] = [];
  const tableIsOutput = /(得到|输出|生成|整理成|变成|转成|提取成).{0,8}(excel|表格)/i
    .test(text);
  if (/pdf/i.test(text)) inputs.push("PDF 文件");
  if (/excel|表格/i.test(text) && !tableIsOutput) inputs.push("Excel 或表格");
  if (/word|docx/i.test(text)) inputs.push("Word 文档");
  if (/图片|照片|扫描件/i.test(text)) inputs.push("图片或扫描件");
  if (/教材/i.test(text)) inputs.push("教材");
  return unique(inputs).join("、");
}

function detectDeliverables(text: string) {
  const deliverables: string[] = [];
  if (/单词|词表/i.test(text)) deliverables.push("结构化单词表");
  if (/音标/i.test(text)) deliverables.push("音标清单");
  if (/配音|发音|音频|跟读/i.test(text)) deliverables.push("按条目组织的音频文件");
  if (/字幕/i.test(text)) deliverables.push("字幕文件");
  if (/报告|分析/i.test(text)) deliverables.push("分析报告");
  if (
    /表格|excel/i.test(text)
    && /得到|输出|生成|整理成|变成|转成|提取成/i.test(text)
  ) {
    deliverables.push("可编辑表格");
  }
  if (/图片/i.test(text) && /输出|生成|得到/i.test(text)) deliverables.push("处理后的图片");
  return unique(deliverables);
}

function detectConstraints(text: string) {
  const constraints: string[] = [];
  if (/离线|不能联网/i.test(text)) constraints.push("优先使用离线工具");
  if (/不能付费|免费|不产生费用/i.test(text)) constraints.push("不得调用付费服务");
  if (/英音/i.test(text)) constraints.push("使用英式发音");
  if (/美音/i.test(text)) constraints.push("使用美式发音");
  if (/慢速|低年级/i.test(text)) constraints.push("音频需要慢速和适当停顿");
  return constraints;
}

function detectRejected(text: string) {
  return text
    .split(/[。；;\n]/)
    .filter((part) => /不要|不需要|不采用|排除/.test(part))
    .map((part) => part.trim());
}

function questionsFor(input: string, deliverables: string[]): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  if (!input) {
    questions.push({
      id: "input",
      text: "你准备提供什么材料？",
      why: "输入类型会影响可以使用哪些工具",
      options: ["PDF或教材", "Word文档", "Excel表格", "图片"],
    });
  }
  if (deliverables.length === 0) {
    questions.push({
      id: "deliverables",
      text: "完成后你最希望得到什么结果？",
      why: "最终结果决定需要组合哪些工具",
      options: ["可编辑表格", "文档", "图片或音视频", "分析报告"],
    });
  }
  return questions;
}

function candidateText(candidate: ToolCandidate) {
  return [
    candidate.toolName,
    candidate.problem,
    candidate.result,
    ...candidate.tags,
  ].join(" ");
}

function contradictsRejectedOption(candidate: ToolCandidate, rejectedOptions: string[]) {
  const rejected = rejectedOptions.join(" ");
  const description = candidateText(candidate);
  return (
    (/不要.{0,8}(音频|配音|发音)|不需要.{0,8}(音频|配音|发音)/.test(rejected)
      && /配音|发音|音频|mp3|跟读/i.test(description))
    || (/不要.{0,8}音标|不需要.{0,8}音标/.test(rejected)
      && /音标/i.test(description))
    || (/不要.{0,8}(单词|词表)|不需要.{0,8}(单词|词表)/.test(rejected)
      && /单词|词表/i.test(description))
  );
}

function chooseTools(brief: RequirementBrief, candidates: ToolCandidate[]) {
  const selected = candidates.filter((candidate) => candidate.source === "user-selected");
  const chosen = [...selected];
  const eligibleCandidates = candidates.filter((candidate) =>
    candidate.source === "user-selected"
    || !contradictsRejectedOption(candidate, brief.rejectedOptions));
  const requirement = `${brief.goal} ${brief.input} ${brief.deliverables.join(" ")}`;
  const capabilities: Array<{ needed: boolean; pattern: RegExp; purpose: string }> = [
    {
      needed: /pdf|教材|文档|提取/i.test(requirement),
      pattern: /pdf|文档|提取|ocr/i,
      purpose: "提取和整理输入材料中的内容",
    },
    {
      needed: /音标/i.test(requirement),
      pattern: /音标/i,
      purpose: "补全、拆分并规范音标",
    },
    {
      needed: /配音|发音|音频|跟读/i.test(requirement),
      pattern: /配音|发音|音频|mp3|跟读/i,
      purpose: "批量生成并整理音频文件",
    },
    {
      needed: /表格|excel|数据/i.test(requirement),
      pattern: /表格|excel|数据|清洗/i,
      purpose: "整理和校验结构化表格",
    },
    {
      needed: /报告|分析/i.test(requirement),
      pattern: /报告|分析/i,
      purpose: "分析材料并生成报告",
    },
  ];

  const missing: Array<{ name: string; goal: string }> = [];
  for (const capability of capabilities.filter((item) => item.needed)) {
    if (chosen.some((candidate) => capability.pattern.test(candidateText(candidate)))) continue;
    const candidate = eligibleCandidates.find((item) =>
      !chosen.some((current) => current.toolVersionId === item.toolVersionId)
      && capability.pattern.test(candidateText(item)));
    if (candidate) chosen.push(candidate);
    else missing.push({ name: capability.purpose, goal: capability.purpose });
  }

  return { chosen: chosen.slice(0, 6), missing };
}

export class MockAiProvider implements AiProvider {
  readonly provider = "mock";
  readonly model = "deterministic-v1";

  async understand(input: Parameters<AiProvider["understand"]>[0]) {
    const userMessages = input.messages.filter((message) => message.role === "user");
    const userText = userMessages.map((message) => message.content).join("\n");
    const latestUserText = userMessages.at(-1)?.content ?? "";
    const detectedInput = detectInput(userText);
    const detectedDeliverables = detectDeliverables(userText);
    const draft: RequirementDraft = {
      goal: input.previousBrief?.goal || input.messages.find(
        (message) => message.role === "user",
      )?.content || "完成用户描述的任务",
      input: detectedInput || input.previousBrief?.input || "",
      deliverables: unique([
        ...(input.previousBrief?.deliverables ?? []),
        ...detectedDeliverables,
      ]),
      constraints: unique([
        ...(input.previousBrief?.constraints ?? []),
        ...detectConstraints(userText),
      ]),
      assumptions: [...(input.previousBrief?.assumptions ?? [])],
      confirmedFacts: unique([
        ...(input.previousBrief?.confirmedFacts ?? []),
        ...(detectedInput ? [`输入材料包含${detectedInput}`] : []),
      ]),
      rejectedOptions: unique([
        ...(input.previousBrief?.rejectedOptions ?? []),
        ...detectRejected(userText),
      ]),
      openQuestions: [],
      selectedToolVersionIds: unique([
        ...(input.previousBrief?.selectedToolVersionIds ?? []),
        ...input.selectedToolVersionIds,
      ]),
    };
    if (/不要|不需要|排除/.test(latestUserText)) {
      if (/不要.{0,8}(音频|配音|发音)|不需要.{0,8}(音频|配音|发音)/.test(latestUserText)) {
        draft.deliverables = draft.deliverables.filter((item) => !/音频/.test(item));
      }
      if (/不要.{0,8}音标|不需要.{0,8}音标/.test(latestUserText)) {
        draft.deliverables = draft.deliverables.filter((item) => !/音标/.test(item));
      }
      if (/不要.{0,8}(单词|词表)|不需要.{0,8}(单词|词表)/.test(latestUserText)) {
        draft.deliverables = draft.deliverables.filter((item) => !/单词/.test(item));
      }
      if (draft.deliverables.length > 0) {
        draft.goal = `基于${draft.input || "现有材料"}，生成${draft.deliverables.join("和")}`;
      }
    }
    const questions = questionsFor(draft.input, draft.deliverables)
      .slice(0, input.maxQuestions);
    draft.openQuestions = questions.map((question) => question.text);
    const assistantText = questions.length > 0
      ? `我先记下了你的目标。还需要确认${questions.length}个会影响选工具的问题。`
      : `我已经把需求整理成任务说明：${draft.goal}。请确认后，我再给出最推荐的工具组合。`;
    return { draft, questions, assistantText };
  }

  async recommend({ brief, candidates }: Parameters<AiProvider["recommend"]>[0]) {
    const { chosen, missing } = chooseTools(brief, candidates);
    const gaps = missing.map((item) => ({
      name: item.name,
      goal: item.goal,
      reason: "当前上架工具中没有找到能够覆盖这一能力的组件",
      productionPrompt: [
        `请基于平台《工具生产与上传标准》生产一个“${item.name}”组件。`,
        `目标：${item.goal}。`,
        `任务总目标：${brief.goal}。`,
        `交付物：${brief.deliverables.join("、")}。`,
        "必须包含统一工具清单、README、输入输出说明、调整边界和验证方法。",
      ].join("\n"),
    }));
    const primary: RecommendationCard = {
      id: "primary",
      kind: "primary",
      title: chosen.length > 0 ? "推荐工具组合" : "需要本地 Agent 补齐的方案",
      summary: chosen.length > 0
        ? `使用${chosen.length}个组件完成“${brief.goal}”`
        : "平台暂时没有足够的现成组件，已生成缺失工具生产说明",
      reason: chosen.length > 0
        ? "这些工具的声明能力与任务输入和交付物直接匹配"
        : "保留任务目标并明确能力缺口，比推荐不匹配工具更可靠",
      coverage: gaps.length === 0 && chosen.length > 0 ? "complete" : "partial",
      tools: chosen.map((candidate) => ({
        toolId: candidate.toolId,
        toolSlug: candidate.toolSlug,
        toolName: candidate.toolName,
        toolVersionId: candidate.toolVersionId,
        version: candidate.version,
        purpose: candidate.problem,
        source: candidate.source,
      })),
      deliverables: brief.deliverables,
      limitations: [
        "平台只根据工具声明能力生成组合，下载后仍应在本地 Agent 中验证结果",
      ],
      gaps,
    };
    return {
      briefVersion: brief.version,
      primary,
      alternatives: [],
      generatedAt: new Date().toISOString(),
    };
  }

  async compress({ brief, messages, lastMessageId }: Parameters<AiProvider["compress"]>[0]) {
    return {
      briefVersion: brief.version,
      summary: buildDeterministicSummary(brief, messages),
      confirmedFacts: brief.confirmedFacts,
      rejectedOptions: brief.rejectedOptions,
      selectedToolVersionIds: brief.selectedToolVersionIds,
      lastMessageId,
    };
  }
}
