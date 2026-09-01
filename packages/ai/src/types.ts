import type {
  AiConversationPhase,
  AiMessage,
  ClarificationQuestion,
  ContextSnapshot,
  RecommendationResult,
  RequirementBrief,
  ToolKind,
} from "@ai-tool-workbench/contracts";
import type {
  PromptKey,
  PromptTemplate,
} from "./prompt-runtime/prompt-registry.js";

export type ConversationRecord = {
  id: string;
  userId: string;
  phase: AiConversationPhase;
  clarificationRoundCount: number;
  questions: ClarificationQuestion[];
  messages: AiMessage[];
  brief: RequirementBrief | null;
  recommendation: RecommendationResult | null;
  contextSnapshot: ContextSnapshot | null;
};

export type RequirementDraft = Omit<
  RequirementBrief,
  "id" | "version" | "status" | "createdAt"
>;

export type ToolCandidate = {
  toolId: string;
  toolSlug: string;
  toolName: string;
  toolVersionId: string;
  version: string;
  kind: ToolKind;
  problem: string;
  result: string;
  tags: string[];
  verification: "verified" | "partly-verified" | "unverified";
  source: "ai" | "user-selected";
  score: number;
};

export interface AiMemoryStore {
  healthCheck(): Promise<void>;
  createConversation(userId: string): Promise<ConversationRecord>;
  getConversation(conversationId: string, userId: string): Promise<ConversationRecord | null>;
  appendMessage(
    conversationId: string,
    role: AiMessage["role"],
    content: string,
  ): Promise<AiMessage>;
  saveBrief(
    conversationId: string,
    draft: RequirementDraft,
    status: RequirementBrief["status"],
  ): Promise<RequirementBrief>;
  recordDecision(
    conversationId: string,
    input: {
      type: "confirmed" | "rejected" | "user-selected-tool";
      key: string;
      value: unknown;
    },
  ): Promise<void>;
  updateConversation(
    conversationId: string,
    input: {
      phase: AiConversationPhase;
      clarificationRoundCount?: number;
      questions?: ClarificationQuestion[];
    },
  ): Promise<void>;
  saveContextSnapshot(
    conversationId: string,
    snapshot: Omit<ContextSnapshot, "id" | "version" | "createdAt">,
    prompt: { key: PromptKey; version: string },
  ): Promise<ContextSnapshot>;
  saveRecommendation(
    conversationId: string,
    recommendation: RecommendationResult,
    candidateToolVersionIds: string[],
    prompt: { key: PromptKey; version: string },
  ): Promise<void>;
  recordRun(input: {
    conversationId: string;
    promptKey: PromptKey;
    promptVersion: string;
    provider: string;
    model: string;
    status: "succeeded" | "failed";
    inputHash: string;
    output?: unknown;
    latencyMs: number;
    errorCode?: string;
  }): Promise<void>;
}

export interface ToolCandidateSource {
  search(brief: RequirementBrief, selectedToolVersionIds: string[]): Promise<ToolCandidate[]>;
}

export interface AiProvider {
  readonly provider: string;
  readonly model: string;
  understand(input: {
    prompt: PromptTemplate;
    messages: AiMessage[];
    contextSnapshot: ContextSnapshot | null;
    previousBrief: RequirementBrief | null;
    selectedToolVersionIds: string[];
    maxQuestions: number;
    clarificationRoundCount: number;
  }): Promise<{
    draft: RequirementDraft;
    questions: ClarificationQuestion[];
    assistantText: string;
  }>;
  recommend(input: {
    prompt: PromptTemplate;
    brief: RequirementBrief;
    candidates: ToolCandidate[];
  }): Promise<RecommendationResult>;
  compress(input: {
    prompt: PromptTemplate;
    brief: RequirementBrief;
    messages: AiMessage[];
    previousSnapshot: ContextSnapshot | null;
    lastMessageId: string;
  }): Promise<Omit<ContextSnapshot, "id" | "version" | "createdAt">>;
}
