import type {
  AiConversationPhase,
  AiMessage,
  ClarificationQuestion,
  ContextSnapshot,
  RecommendationResult,
  RequirementBrief,
} from "@ai-tool-workbench/contracts";
import {
  contextSnapshotSchema,
  recommendationResultSchema,
  requirementBriefSchema,
} from "@ai-tool-workbench/contracts";
import type {
  AiMemoryStore,
  ConversationRecord,
  RequirementDraft,
} from "@ai-tool-workbench/ai";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function mapMessage(row: Row): AiMessage {
  return {
    id: String(row.id),
    role: row.role as AiMessage["role"],
    content: String(row.content),
    createdAt: iso(row.created_at),
  };
}

function mapBrief(row: Row): RequirementBrief {
  return requirementBriefSchema.parse({
    id: String(row.id),
    version: Number(row.version),
    status: row.status,
    goal: row.goal,
    input: row.input_description,
    deliverables: stringArray(row.deliverables),
    constraints: stringArray(row.constraints),
    assumptions: stringArray(row.assumptions),
    confirmedFacts: stringArray(row.confirmed_facts),
    rejectedOptions: stringArray(row.rejected_options),
    openQuestions: stringArray(row.open_questions),
    selectedToolVersionIds: stringArray(row.selected_tool_version_ids),
    createdAt: iso(row.created_at),
  });
}

function mapSnapshot(row: Row): ContextSnapshot {
  return contextSnapshotSchema.parse({
    id: String(row.id),
    version: Number(row.version),
    briefVersion: Number(row.brief_version),
    summary: row.summary,
    confirmedFacts: stringArray(row.confirmed_facts),
    rejectedOptions: stringArray(row.rejected_options),
    selectedToolVersionIds: stringArray(row.selected_tool_version_ids),
    lastMessageId: String(row.last_message_id),
    createdAt: iso(row.created_at),
  });
}

export class PostgresAiMemoryRepository implements AiMemoryStore {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresAiMemoryRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async createConversation(userId: string) {
    const [row] = await this.sql`
      INSERT INTO ai_conversations (user_id)
      VALUES (${userId})
      RETURNING *
    `;
    if (!row) throw new Error("创建AI任务失败");
    return {
      id: String(row.id),
      userId: String(row.user_id),
      phase: row.phase as AiConversationPhase,
      clarificationRoundCount: Number(row.clarification_round_count),
      questions: [],
      messages: [],
      brief: null,
      recommendation: null,
      contextSnapshot: null,
    } satisfies ConversationRecord;
  }

  async getConversation(conversationId: string, userId: string) {
    const [conversation] = await this.sql`
      SELECT *
      FROM ai_conversations
      WHERE id = ${conversationId}
        AND user_id = ${userId}
        AND status = 'active'
      LIMIT 1
    `;
    if (!conversation) return null;

    const [messages, briefs, recommendations, snapshots] = await Promise.all([
      this.sql`
        SELECT * FROM ai_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at, id
      `,
      this.sql`
        SELECT * FROM requirement_briefs
        WHERE conversation_id = ${conversationId}
        ORDER BY version DESC LIMIT 1
      `,
      this.sql`
        SELECT result FROM ai_recommendations
        WHERE conversation_id = ${conversationId}
        ORDER BY brief_version DESC LIMIT 1
      `,
      this.sql`
        SELECT * FROM ai_context_snapshots
        WHERE conversation_id = ${conversationId}
        ORDER BY version DESC LIMIT 1
      `,
    ]);

    return {
      id: String(conversation.id),
      userId: String(conversation.user_id),
      phase: conversation.phase as AiConversationPhase,
      clarificationRoundCount: Number(conversation.clarification_round_count),
      questions: Array.isArray(conversation.current_questions)
        ? conversation.current_questions.map((question) => ({
            id: String(question.id),
            text: String(question.text),
            why: String(question.why),
            options: Array.isArray(question.options)
              ? question.options.map(String).slice(0, 4)
              : [],
          }))
        : [],
      messages: messages.map(mapMessage),
      brief: briefs[0] ? mapBrief(briefs[0]) : null,
      recommendation: conversation.phase === "recommended" && recommendations[0]
        ? recommendationResultSchema.parse(recommendations[0].result)
        : null,
      contextSnapshot: snapshots[0] ? mapSnapshot(snapshots[0]) : null,
    };
  }

  async appendMessage(
    conversationId: string,
    role: AiMessage["role"],
    content: string,
  ) {
    const [row] = await this.sql`
      INSERT INTO ai_messages (conversation_id, role, content)
      VALUES (${conversationId}, ${role}, ${content})
      RETURNING *
    `;
    if (!row) throw new Error("保存AI消息失败");
    return mapMessage(row);
  }

  async saveBrief(
    conversationId: string,
    draft: RequirementDraft,
    status: RequirementBrief["status"],
  ) {
    return this.sql.begin(async (transaction) => {
      await transaction`
        SELECT id FROM ai_conversations
        WHERE id = ${conversationId}
        FOR UPDATE
      `;
      const [versionRow] = await transaction`
        SELECT COALESCE(max(version), 0) + 1 AS version
        FROM requirement_briefs
        WHERE conversation_id = ${conversationId}
      `;
      const [row] = await transaction`
        INSERT INTO requirement_briefs (
          conversation_id, version, status, goal, input_description,
          deliverables, constraints, assumptions, confirmed_facts,
          rejected_options, open_questions, selected_tool_version_ids
        )
        VALUES (
          ${conversationId},
          ${Number(versionRow?.version ?? 1)},
          ${status},
          ${draft.goal},
          ${draft.input},
          ${transaction.json(draft.deliverables)},
          ${transaction.json(draft.constraints)},
          ${transaction.json(draft.assumptions)},
          ${transaction.json(draft.confirmedFacts)},
          ${transaction.json(draft.rejectedOptions)},
          ${transaction.json(draft.openQuestions)},
          ${transaction.json(draft.selectedToolVersionIds)}
        )
        RETURNING *
      `;
      if (!row) throw new Error("保存任务说明失败");
      return mapBrief(row);
    });
  }

  async recordDecision(
    conversationId: string,
    input: {
      type: "confirmed" | "rejected" | "user-selected-tool";
      key: string;
      value: unknown;
    },
  ) {
    await this.sql`
      INSERT INTO ai_decisions (
        conversation_id, decision_type, decision_key, value
      )
      VALUES (
        ${conversationId},
        ${input.type},
        ${input.key},
        ${this.sql.json(toJsonValue(input.value))}
      )
    `;
  }

  async updateConversation(
    conversationId: string,
    input: {
      phase: AiConversationPhase;
      clarificationRoundCount?: number;
      questions?: ClarificationQuestion[];
    },
  ) {
    await this.sql`
      UPDATE ai_conversations
      SET
        phase = ${input.phase},
        clarification_round_count = COALESCE(
          ${input.clarificationRoundCount ?? null},
          clarification_round_count
        ),
        current_questions = COALESCE(
          ${input.questions === undefined
            ? null
            : this.sql.json(toJsonValue(input.questions))},
          current_questions
        ),
        updated_at = now()
      WHERE id = ${conversationId}
    `;
  }

  async saveContextSnapshot(
    conversationId: string,
    snapshot: Omit<ContextSnapshot, "id" | "version" | "createdAt">,
    prompt: { key: "context-compression"; version: string },
  ) {
    return this.sql.begin(async (transaction) => {
      await transaction`
        SELECT id FROM ai_conversations WHERE id = ${conversationId} FOR UPDATE
      `;
      const [versionRow] = await transaction`
        SELECT COALESCE(max(version), 0) + 1 AS version
        FROM ai_context_snapshots WHERE conversation_id = ${conversationId}
      `;
      const [row] = await transaction`
        INSERT INTO ai_context_snapshots (
          conversation_id, version, brief_version, summary,
          confirmed_facts, rejected_options, selected_tool_version_ids,
          last_message_id, prompt_key, prompt_version
        )
        VALUES (
          ${conversationId},
          ${Number(versionRow?.version ?? 1)},
          ${snapshot.briefVersion},
          ${snapshot.summary},
          ${transaction.json(snapshot.confirmedFacts)},
          ${transaction.json(snapshot.rejectedOptions)},
          ${transaction.json(snapshot.selectedToolVersionIds)},
          ${snapshot.lastMessageId},
          ${prompt.key},
          ${prompt.version}
        )
        RETURNING *
      `;
      if (!row) throw new Error("保存上下文快照失败");
      return mapSnapshot(row);
    });
  }

  async saveRecommendation(
    conversationId: string,
    recommendation: RecommendationResult,
    candidateToolVersionIds: string[],
    prompt: { key: "recommendation"; version: string },
  ) {
    await this.sql`
      INSERT INTO ai_recommendations (
        conversation_id, brief_version, result, candidate_tool_version_ids,
        prompt_key, prompt_version
      )
      VALUES (
        ${conversationId},
        ${recommendation.briefVersion},
        ${this.sql.json(recommendation)},
        ${this.sql.json(candidateToolVersionIds)},
        ${prompt.key},
        ${prompt.version}
      )
      ON CONFLICT (conversation_id, brief_version) DO UPDATE SET
        result = EXCLUDED.result,
        candidate_tool_version_ids = EXCLUDED.candidate_tool_version_ids,
        prompt_key = EXCLUDED.prompt_key,
        prompt_version = EXCLUDED.prompt_version
    `;
  }

  async recordRun(input: Parameters<AiMemoryStore["recordRun"]>[0]) {
    await this.sql`
      INSERT INTO ai_runs (
        conversation_id, prompt_key, prompt_version, provider, model,
        status, input_hash, output, latency_ms, error_code
      )
      VALUES (
        ${input.conversationId},
        ${input.promptKey},
        ${input.promptVersion},
        ${input.provider},
        ${input.model},
        ${input.status},
        ${input.inputHash},
        ${input.output === undefined ? null : this.sql.json(toJsonValue(input.output))},
        ${input.latencyMs},
        ${input.errorCode ?? null}
      )
    `;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
