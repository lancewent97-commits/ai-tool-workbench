import { createHash } from "node:crypto";
import type {
  AiConversationResponse,
  AiConversationStateResponse,
  RequirementBrief,
} from "@ai-tool-workbench/contracts";
import {
  aiConversationResponseSchema,
  aiConversationStateResponseSchema,
  clarificationQuestionSchema,
  contextSnapshotSchema,
  recommendationResultSchema,
  requirementBriefSchema,
} from "@ai-tool-workbench/contracts";
import { z } from "zod";
import {
  assertRecommendationAllowed,
  platformAiPolicy,
  reconcileRecommendationCoverage,
} from "../constraints/platform-policy.js";
import { PromptRegistry, type PromptKey } from "../prompt-runtime/prompt-registry.js";
import type {
  AiMemoryStore,
  AiProvider,
  ConversationRecord,
  ToolCandidateSource,
} from "../types.js";

export class AiConversationNotFoundError extends Error {}
export class AiBriefNotReadyError extends Error {}
export class AiProviderOutputError extends Error {}
export class AiRecommendationRejectedError extends Error {}

const requirementDraftSchema = requirementBriefSchema.omit({
  id: true,
  version: true,
  status: true,
  createdAt: true,
});

const requirementUnderstandingOutputSchema = z.object({
  draft: requirementDraftSchema,
  questions: z.array(clarificationQuestionSchema).max(
    platformAiPolicy.maxQuestionsPerTurn,
  ),
  assistantText: z.string(),
});

const contextSnapshotDraftSchema = contextSnapshotSchema.omit({
  id: true,
  version: true,
  createdAt: true,
});

function inputHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class AiOrchestrator {
  constructor(
    private readonly memory: AiMemoryStore,
    private readonly candidates: ToolCandidateSource,
    private readonly provider: AiProvider,
    private readonly prompts = new PromptRegistry(),
  ) {}

  healthCheck() {
    return this.memory.healthCheck();
  }

  async start(userId: string, message: string, selectedToolVersionIds: string[]) {
    const conversation = await this.memory.createConversation(userId);
    for (const versionId of selectedToolVersionIds) {
      await this.memory.recordDecision(conversation.id, {
        type: "user-selected-tool",
        key: `tool-version:${versionId}`,
        value: versionId,
      });
    }
    return this.processMessage(
      conversation,
      message,
      selectedToolVersionIds,
    );
  }

  async continue(userId: string, conversationId: string, message: string) {
    const conversation = await this.ownedConversation(conversationId, userId);
    return this.processMessage(
      conversation,
      message,
      conversation.brief?.selectedToolVersionIds ?? [],
    );
  }

  async retry(userId: string, conversationId: string) {
    const conversation = await this.ownedConversation(conversationId, userId);
    if (
      conversation.phase === "brief-review"
      && conversation.brief?.status === "confirmed"
    ) {
      return this.confirm(userId, conversationId);
    }
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!lastUserMessage) {
      throw new AiBriefNotReadyError("没有可重试的AI步骤");
    }
    return this.processMessage(
      conversation,
      lastUserMessage.content,
      conversation.brief?.selectedToolVersionIds ?? [],
      false,
    );
  }

  async confirm(userId: string, conversationId: string) {
    const conversation = await this.ownedConversation(conversationId, userId);
    if (!conversation.brief || conversation.phase === "clarifying") {
      throw new AiBriefNotReadyError("需求仍有关键内容未确认");
    }
    if (conversation.phase === "recommended" && conversation.recommendation) {
      return this.response(
        conversation,
        conversation.messages.at(-1)!,
      );
    }

    const needsConfirmation = conversation.brief.status !== "confirmed";
    const brief = !needsConfirmation
      ? conversation.brief
      : await this.memory.saveBrief(
          conversation.id,
          {
            goal: conversation.brief.goal,
            input: conversation.brief.input,
            deliverables: conversation.brief.deliverables,
            constraints: conversation.brief.constraints,
            assumptions: conversation.brief.assumptions,
            confirmedFacts: conversation.brief.confirmedFacts,
            rejectedOptions: conversation.brief.rejectedOptions,
            openQuestions: conversation.brief.openQuestions,
            selectedToolVersionIds: conversation.brief.selectedToolVersionIds,
          },
          "confirmed",
        );
    if (needsConfirmation) {
      await this.memory.recordDecision(conversation.id, {
        type: "confirmed",
        key: `requirement-brief:${brief.version}`,
        value: { briefId: brief.id, version: brief.version },
      });
    }
    const candidates = await this.candidates.search(
      brief,
      brief.selectedToolVersionIds,
    );
    const prompt = await this.prompts.get("recommendation");
    const modelRecommendation = recommendationResultSchema.parse(
      await this.run(
        conversation.id,
        "recommendation",
        prompt.version,
        { brief, candidates },
        () => this.provider.recommend({ prompt, brief, candidates }),
      ),
    );
    const recommendation = recommendationResultSchema.parse(
      reconcileRecommendationCoverage(modelRecommendation, candidates, brief),
    );
    try {
      assertRecommendationAllowed(recommendation, candidates, brief);
    } catch {
      throw new AiRecommendationRejectedError(
        "模型生成的方案未通过平台约束检查，请重试",
      );
    }
    await this.memory.saveRecommendation(
      conversation.id,
      recommendation,
      candidates.map((candidate) => candidate.toolVersionId),
      { key: "recommendation", version: prompt.version },
    );
    await this.memory.updateConversation(conversation.id, {
      phase: "recommended",
      questions: [],
    });
    const assistantMessage = await this.memory.appendMessage(
      conversation.id,
      "assistant",
      recommendation.primary?.coverage === "complete"
        ? "已根据确认后的任务说明生成最推荐方案。"
        : "现有工具只能覆盖部分需求，我同时生成了缺失组件的本地生产说明。",
    );
    const beforeCompression = await this.ownedConversation(conversation.id, userId);
    await this.compressBestEffort(beforeCompression, brief, true);
    const updated = await this.ownedConversation(conversation.id, userId);
    return this.response(updated, assistantMessage);
  }

  async getState(userId: string, conversationId: string) {
    const conversation = await this.ownedConversation(conversationId, userId);
    if (!conversation.brief) throw new AiBriefNotReadyError("任务说明尚未生成");
    return aiConversationStateResponseSchema.parse({
      conversationId: conversation.id,
      phase: conversation.phase,
      messages: conversation.messages.slice(-20),
      brief: conversation.brief,
      questions: conversation.questions,
      recommendation: conversation.recommendation,
      contextVersion: conversation.contextSnapshot?.version ?? 0,
    } satisfies AiConversationStateResponse);
  }

  private async processMessage(
    initial: ConversationRecord,
    content: string,
    selectedToolVersionIds: string[],
    appendUserMessage = true,
  ) {
    if (appendUserMessage) {
      await this.memory.appendMessage(initial.id, "user", content);
    }
    const conversation = await this.ownedConversation(initial.id, initial.userId);
    const nextRound = conversation.clarificationRoundCount + 1;
    const prompt = await this.prompts.get("requirement-understanding");
    const recentMessages = conversation.messages.slice(
      -platformAiPolicy.maxRecentMessages,
    );
    const understood = await this.run(
      conversation.id,
      "requirement-understanding",
      prompt.version,
      {
        contextSnapshot: conversation.contextSnapshot,
        messages: recentMessages,
        previousBrief: conversation.brief,
        selectedToolVersionIds,
        clarificationRoundCount: nextRound,
      },
      async () => requirementUnderstandingOutputSchema.parse(
        await this.provider.understand({
          prompt,
          messages: recentMessages,
          contextSnapshot: conversation.contextSnapshot,
          previousBrief: conversation.brief,
          selectedToolVersionIds,
          maxQuestions: platformAiPolicy.maxQuestionsPerTurn,
          clarificationRoundCount: nextRound,
        }),
      ),
    );

    let questions = understood.questions;
    if (
      questions.length > 0
      && nextRound >= platformAiPolicy.maxClarificationRounds
    ) {
      understood.draft.assumptions = [
        ...understood.draft.assumptions,
        ...questions.map((question) => `暂按常规方式处理：${question.text}`),
      ];
      understood.draft.openQuestions = [];
      questions = [];
      understood.assistantText = "已达到快速确认轮次上限，我把未确认内容标成了明确假设。请检查任务说明。";
    }

    const phase = questions.length > 0 ? "clarifying" : "brief-review";
    const previousRejected = new Set(conversation.brief?.rejectedOptions ?? []);
    const brief = await this.memory.saveBrief(
      conversation.id,
      understood.draft,
      "draft",
    );
    for (const rejected of brief.rejectedOptions) {
      if (previousRejected.has(rejected)) continue;
      await this.memory.recordDecision(conversation.id, {
        type: "rejected",
        key: `rejected:${inputHash(rejected).slice(0, 16)}`,
        value: rejected,
      });
    }
    await this.memory.updateConversation(conversation.id, {
      phase,
      clarificationRoundCount: nextRound,
      questions,
    });
    const assistantMessage = await this.memory.appendMessage(
      conversation.id,
      "assistant",
      understood.assistantText,
    );
    const beforeCompression = await this.ownedConversation(conversation.id, initial.userId);
    await this.compressBestEffort(
      beforeCompression,
      brief,
      phase === "brief-review",
    );
    const updated = await this.ownedConversation(conversation.id, initial.userId);
    return this.response(updated, assistantMessage);
  }

  private async compressBestEffort(
    conversation: ConversationRecord,
    brief: RequirementBrief,
    force: boolean,
  ) {
    try {
      await this.compressKnownConversation(conversation, brief, force);
    } catch {
      // Compression improves later prompts but must not block the user's core flow.
    }
  }

  private async compressKnownConversation(
    conversation: ConversationRecord,
    brief: RequirementBrief,
    force: boolean,
  ) {
    if (!force && conversation.messages.length <= platformAiPolicy.maxRecentMessages) return;
    const lastMessage = conversation.messages.at(-1);
    if (!lastMessage) return;
    const prompt = await this.prompts.get("context-compression");
    const snapshot = await this.run(
      conversation.id,
      "context-compression",
      prompt.version,
      {
        brief,
        previousSnapshot: conversation.contextSnapshot,
        messages: conversation.messages.slice(-platformAiPolicy.maxRecentMessages),
        lastMessageId: lastMessage.id,
      },
      async () => contextSnapshotDraftSchema.parse(
        await this.provider.compress({
          prompt,
          brief,
          previousSnapshot: conversation.contextSnapshot,
          messages: conversation.messages.slice(-platformAiPolicy.maxRecentMessages),
          lastMessageId: lastMessage.id,
        }),
      ),
    );
    await this.memory.saveContextSnapshot(
      conversation.id,
      snapshot,
      { key: "context-compression", version: prompt.version },
    );
  }

  private async run<T>(
    conversationId: string,
    promptKey: PromptKey,
    promptVersion: string,
    input: unknown,
    operation: () => Promise<T>,
  ) {
    const startedAt = Date.now();
    try {
      const output = await operation();
      await this.memory.recordRun({
        conversationId,
        promptKey,
        promptVersion,
        provider: this.provider.provider,
        model: this.provider.model,
        status: "succeeded",
        inputHash: inputHash(input),
        output,
        latencyMs: Date.now() - startedAt,
      });
      return output;
    } catch (error) {
      await this.memory.recordRun({
        conversationId,
        promptKey,
        promptVersion,
        provider: this.provider.provider,
        model: this.provider.model,
        status: "failed",
        inputHash: inputHash(input),
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.name : "UNKNOWN",
      });
      if (error instanceof z.ZodError) {
        throw new AiProviderOutputError("模型返回结构不符合平台要求，请重试");
      }
      throw error;
    }
  }

  private async ownedConversation(conversationId: string, userId: string) {
    const conversation = await this.memory.getConversation(conversationId, userId);
    if (!conversation) throw new AiConversationNotFoundError();
    return conversation;
  }

  private response(
    conversation: ConversationRecord,
    assistantMessage: ConversationRecord["messages"][number],
  ): AiConversationResponse {
    if (!conversation.brief) throw new AiBriefNotReadyError();
    return aiConversationResponseSchema.parse({
      conversationId: conversation.id,
      phase: conversation.phase,
      assistantMessage,
      brief: conversation.brief,
      questions: conversation.questions,
      recommendation: conversation.recommendation,
      contextVersion: conversation.contextSnapshot?.version ?? 0,
    } satisfies AiConversationResponse);
  }
}
