import { randomUUID } from "node:crypto";
import type {
  AiConversationPhase,
  AiMessage,
  ClarificationQuestion,
  ContextSnapshot,
  RecommendationResult,
  RequirementBrief,
} from "@ai-tool-workbench/contracts";
import type {
  AiMemoryStore,
  ConversationRecord,
  RequirementDraft,
} from "../types.js";

type RunRecord = Parameters<AiMemoryStore["recordRun"]>[0];

export class MemoryAiStore implements AiMemoryStore {
  private readonly conversations = new Map<string, ConversationRecord>();
  readonly runs: RunRecord[] = [];
  readonly decisions: Array<{
    conversationId: string;
    type: "confirmed" | "rejected" | "user-selected-tool";
    key: string;
    value: unknown;
  }> = [];

  async healthCheck() {}

  async createConversation(userId: string) {
    const record: ConversationRecord = {
      id: randomUUID(),
      userId,
      phase: "clarifying",
      clarificationRoundCount: 0,
      questions: [],
      messages: [],
      brief: null,
      recommendation: null,
      contextSnapshot: null,
    };
    this.conversations.set(record.id, record);
    return record;
  }

  async getConversation(conversationId: string, userId: string) {
    const record = this.conversations.get(conversationId);
    return record?.userId === userId ? record : null;
  }

  async appendMessage(
    conversationId: string,
    role: AiMessage["role"],
    content: string,
  ) {
    const record = this.required(conversationId);
    const message: AiMessage = {
      id: randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    record.messages.push(message);
    return message;
  }

  async saveBrief(
    conversationId: string,
    draft: RequirementDraft,
    status: RequirementBrief["status"],
  ) {
    const record = this.required(conversationId);
    const brief: RequirementBrief = {
      ...draft,
      id: randomUUID(),
      version: (record.brief?.version ?? 0) + 1,
      status,
      createdAt: new Date().toISOString(),
    };
    record.brief = brief;
    return brief;
  }

  async recordDecision(
    conversationId: string,
    input: {
      type: "confirmed" | "rejected" | "user-selected-tool";
      key: string;
      value: unknown;
    },
  ) {
    this.required(conversationId);
    this.decisions.push({ conversationId, ...input });
  }

  async updateConversation(
    conversationId: string,
    input: {
      phase: AiConversationPhase;
      clarificationRoundCount?: number;
      questions?: ClarificationQuestion[];
    },
  ) {
    const record = this.required(conversationId);
    record.phase = input.phase;
    if (input.phase !== "recommended") record.recommendation = null;
    if (input.clarificationRoundCount !== undefined) {
      record.clarificationRoundCount = input.clarificationRoundCount;
    }
    if (input.questions !== undefined) record.questions = input.questions;
  }

  async saveContextSnapshot(
    conversationId: string,
    input: Omit<ContextSnapshot, "id" | "version" | "createdAt">,
  ) {
    const record = this.required(conversationId);
    const snapshot: ContextSnapshot = {
      ...input,
      id: randomUUID(),
      version: (record.contextSnapshot?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };
    record.contextSnapshot = snapshot;
    return snapshot;
  }

  async saveRecommendation(
    conversationId: string,
    recommendation: RecommendationResult,
  ) {
    this.required(conversationId).recommendation = recommendation;
  }

  async recordRun(input: RunRecord) {
    this.runs.push(input);
  }

  private required(conversationId: string) {
    const record = this.conversations.get(conversationId);
    if (!record) throw new Error(`Conversation not found: ${conversationId}`);
    return record;
  }
}
