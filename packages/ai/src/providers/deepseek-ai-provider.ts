import {
  candidateSupportsCapability,
  requiredCapabilities,
} from "../capabilities/capability-rules.js";
import {
  clarificationQuestionSchema,
  contextSnapshotSchema,
  recommendationResultSchema,
  requirementBriefSchema,
} from "@ai-tool-workbench/contracts";
import { z } from "zod";
import type { AiProvider, ToolCandidate } from "../types.js";

const deepSeekResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({
      content: z.string().nullable(),
    }),
  })).min(1),
});

const requirementDraftSchema = requirementBriefSchema.omit({
  id: true,
  version: true,
  status: true,
  createdAt: true,
});

const understandingSchema = z.object({
  draft: requirementDraftSchema,
  questions: z.array(clarificationQuestionSchema).max(3),
  assistantText: z.string(),
});

const modelClarificationQuestionSchema = clarificationQuestionSchema.extend({
  options: z.array(z.string()),
});

const modelUnderstandingSchema = understandingSchema.extend({
  questions: z.array(modelClarificationQuestionSchema),
});

const snapshotDraftSchema = contextSnapshotSchema.omit({
  id: true,
  version: true,
  createdAt: true,
});

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class ExternalModelDataPolicyError extends Error {}
export class DeepSeekProviderError extends Error {}

export type DeepSeekProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
  dataMode: "sanitized-test";
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function removeCompositeCoveredTools(
  recommendation: z.infer<typeof recommendationResultSchema>,
  input: Parameters<AiProvider["recommend"]>[0],
) {
  if (!recommendation.primary) return recommendation;
  const candidates = new Map(
    input.candidates.map((candidate) => [candidate.toolVersionId, candidate]),
  );
  const required = requiredCapabilities(input.brief);
  const selectedCandidates = recommendation.primary.tools
    .map((tool) => candidates.get(tool.toolVersionId))
    .filter((candidate): candidate is ToolCandidate => candidate !== undefined);
  const composites = selectedCandidates.filter(
    (candidate) => candidate.kind === "composite",
  );
  if (composites.length === 0) return recommendation;

  const filteredTools = recommendation.primary.tools.filter((tool) => {
    const candidate = candidates.get(tool.toolVersionId);
    if (!candidate || candidate.source === "user-selected") return true;
    if (candidate.kind === "composite") return true;
    const contributed = required.filter((capability) =>
      candidateSupportsCapability(candidate, capability));
    if (contributed.length === 0) return true;
    return !composites.some((composite) =>
      contributed.every((capability) =>
        candidateSupportsCapability(composite, capability)));
  });
  const removedTools = filteredTools.length !== recommendation.primary.tools.length;
  return {
    ...recommendation,
    primary: {
      ...recommendation.primary,
      tools: filteredTools,
      summary: removedTools
        ? `使用${filteredTools.map((tool) => tool.toolName).join("、")}完成“${input.brief.goal}”`
        : recommendation.primary.summary,
      reason: removedTools
        ? "保留覆盖已确认交付物的最少必要工具，已移除被组合工具重复覆盖的组件"
        : recommendation.primary.reason,
    },
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceToolIdentifiers(
  value: string,
  tools: z.infer<typeof recommendationResultSchema>["alternatives"][number]["tools"],
) {
  return tools.reduce((text, tool) => {
    return [
      tool.toolVersionId,
      tool.toolId,
      tool.toolSlug,
    ].reduce(
      (current, identifier) =>
        current.replace(new RegExp(escapeRegExp(identifier), "gi"), tool.toolName),
      text,
    );
  }, value);
}

function humanizeRecommendationText(
  recommendation: z.infer<typeof recommendationResultSchema>,
) {
  const normalizeCard = (
    card: NonNullable<z.infer<typeof recommendationResultSchema>["primary"]>,
  ) => ({
    ...card,
    title: replaceToolIdentifiers(card.title, card.tools),
    summary: replaceToolIdentifiers(card.summary, card.tools),
    reason: replaceToolIdentifiers(card.reason, card.tools),
    limitations: card.limitations.map((item) =>
      replaceToolIdentifiers(item, card.tools)),
    tools: card.tools.map((tool) => ({
      ...tool,
      purpose: replaceToolIdentifiers(tool.purpose, card.tools),
    })),
  });
  return {
    ...recommendation,
    primary: recommendation.primary ? normalizeCard(recommendation.primary) : null,
    alternatives: recommendation.alternatives.map(normalizeCard),
  };
}

export function assertSanitizedExternalInput(input: unknown) {
  const text = JSON.stringify(input);
  const blocked: Array<[RegExp, string]> = [
    [/\b1[3-9]\d{9}\b/, "手机号码"],
    [/\b\d{17}[\dXx]\b/, "身份证号"],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "邮箱地址"],
    [/\b(?:sk|api)[-_][a-z0-9_-]{16,}\b/i, "API密钥"],
    [/(?:password|passwd|密码)\s*[:=：]\s*\S+/i, "密码"],
    [/(?:token|secret)\s*[:=：]\s*\S+/i, "Token或密钥"],
  ];
  for (const [pattern, label] of blocked) {
    if (pattern.test(text)) {
      throw new ExternalModelDataPolicyError(
        `外部开发模型输入疑似包含${label}，请先脱敏`,
      );
    }
  }
}

export class DeepSeekAiProvider implements AiProvider {
  readonly provider = "deepseek-external-dev";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(private readonly options: DeepSeekProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("缺少DEEPSEEK_API_KEY");
    this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "");
    this.model = options.model ?? "deepseek-v4-flash";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async understand(input: Parameters<AiProvider["understand"]>[0]) {
    const modelOutput = modelUnderstandingSchema.parse(await this.callJson(
      input.prompt.system,
      {
        task: "requirement-understanding",
        outputContract: {
          draft: {
            goal: "string",
            input: "string",
            deliverables: ["string"],
            constraints: ["string"],
            assumptions: ["string"],
            confirmedFacts: ["string"],
            rejectedOptions: ["string"],
            openQuestions: ["string"],
            selectedToolVersionIds: ["uuid"],
          },
          questions: {
            maximumItems: input.maxQuestions,
            item: {
              id: "string",
              text: "string",
              why: "string",
              options: {
                maximumItems: 4,
                items: ["string"],
              },
            },
          },
          assistantText: "string",
        },
        contextSnapshot: input.contextSnapshot,
        previousBrief: input.previousBrief,
        selectedToolVersionIds: input.selectedToolVersionIds,
        clarificationRoundCount: input.clarificationRoundCount,
        maxQuestions: input.maxQuestions,
        messages: input.messages,
      },
    ));
    const output = understandingSchema.parse({
      ...modelOutput,
      questions: modelOutput.questions
        .slice(0, input.maxQuestions)
        .map((question) => ({
          ...question,
          options: question.options.slice(0, 4),
        })),
    });
    output.draft.confirmedFacts = unique([
      ...(input.previousBrief?.confirmedFacts ?? []),
      ...output.draft.confirmedFacts,
    ]);
    output.draft.rejectedOptions = unique([
      ...(input.previousBrief?.rejectedOptions ?? []),
      ...output.draft.rejectedOptions,
    ]);
    output.draft.selectedToolVersionIds = unique([
      ...(input.previousBrief?.selectedToolVersionIds ?? []),
      ...input.selectedToolVersionIds,
      ...output.draft.selectedToolVersionIds,
    ]);
    output.draft.openQuestions = output.questions.map((question) => question.text);
    return output;
  }

  async recommend(input: Parameters<AiProvider["recommend"]>[0]) {
    const raw = await this.callJson(input.prompt.system, {
      task: "recommendation",
      instruction: "只输出JSON。工具ID、版本ID、名称和版本必须逐字复制候选列表。",
      outputContract: {
        briefVersion: input.brief.version,
        primary: {
          id: "string",
          kind: "primary",
          title: "string",
          summary: "string",
          reason: "string",
          coverage: "complete | partial",
          tools: [{
            toolId: "uuid",
            toolSlug: "string",
            toolName: "string",
            toolVersionId: "uuid",
            version: "string",
            purpose: "string",
            source: "ai | user-selected",
          }],
          deliverables: ["string"],
          limitations: ["string"],
          gaps: [{
            name: "string",
            goal: "string",
            reason: "string",
            productionPrompt: "string",
          }],
        },
        alternatives: [],
        generatedAt: "ISO datetime",
      },
      brief: input.brief,
      candidates: input.candidates,
    }, 0);
    const recommendation = recommendationResultSchema.parse({
      ...(raw as Record<string, unknown>),
      briefVersion: input.brief.version,
      generatedAt: new Date().toISOString(),
    });
    return recommendationResultSchema.parse(humanizeRecommendationText(
      removeCompositeCoveredTools({
        ...recommendation,
        primary: recommendation.primary
          ? {
              ...recommendation.primary,
              deliverables: input.brief.deliverables,
            }
          : null,
      }, input),
    ));
  }

  async compress(input: Parameters<AiProvider["compress"]>[0]) {
    const raw = await this.callJson(input.prompt.system, {
      task: "context-compression",
      outputContract: {
        briefVersion: input.brief.version,
        summary: "string",
        confirmedFacts: ["string"],
        rejectedOptions: ["string"],
        selectedToolVersionIds: ["uuid"],
        lastMessageId: input.lastMessageId,
      },
      previousSnapshot: input.previousSnapshot,
      brief: input.brief,
      messages: input.messages,
    });
    return snapshotDraftSchema.parse({
      ...(raw as Record<string, unknown>),
      briefVersion: input.brief.version,
      confirmedFacts: input.brief.confirmedFacts,
      rejectedOptions: input.brief.rejectedOptions,
      selectedToolVersionIds: input.brief.selectedToolVersionIds,
      lastMessageId: input.lastMessageId,
    });
  }

  private async callJson(
    systemPrompt: string,
    payload: unknown,
    temperature = 0.1,
  ) {
    assertSanitizedExternalInput(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `${systemPrompt}\n\n必须只输出一个有效JSON对象，不要使用Markdown代码块。`,
            },
            {
              role: "user",
              content: JSON.stringify(payload),
            },
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature,
          max_tokens: 4_000,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new DeepSeekProviderError(`DeepSeek请求失败（HTTP ${response.status}）`);
      }
      const parsed = deepSeekResponseSchema.parse(await response.json());
      const choice = parsed.choices[0]!;
      if (choice.finish_reason === "length") {
        throw new DeepSeekProviderError("DeepSeek结构化输出被截断");
      }
      const content = choice.message.content?.trim();
      if (!content) throw new DeepSeekProviderError("DeepSeek返回了空内容");
      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new DeepSeekProviderError("DeepSeek没有返回有效JSON");
      }
    } catch (error) {
      if (error instanceof DeepSeekProviderError || error instanceof ExternalModelDataPolicyError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new DeepSeekProviderError("DeepSeek请求超时");
      }
      throw new DeepSeekProviderError("DeepSeek请求失败");
    } finally {
      clearTimeout(timeout);
    }
  }
}
