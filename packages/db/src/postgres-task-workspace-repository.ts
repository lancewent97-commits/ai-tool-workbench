import type {
  PackageDraft,
  PackageDraftRecord,
  PageResult,
  Task,
} from "@ai-tool-workbench/contracts";
import {
  packageDraftRecordSchema,
  packageDraftSchema,
  taskSchema,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import {
  type TaskWorkspaceRepository,
  WorkspaceTaskNotFoundError,
} from "./task-workspace-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function mapTask(row: Row): Task {
  return taskSchema.parse({
    id: String(row.id),
    name: String(row.name),
    goal: String(row.goal),
    input: String(row.input_description ?? ""),
    deliverables: stringArray(row.deliverables),
    stage: row.stage,
    updatedAt: iso(row.updated_at),
    needsUserAction: Boolean(row.needs_user_action),
    packageVersionIds: stringArray(row.package_version_ids),
    result: row.feedback_result ?? undefined,
  });
}

function mapDraft(row: Row): PackageDraftRecord {
  return packageDraftRecordSchema.parse({
    draft: packageDraftSchema.parse({
      id: String(row.id),
      source: row.source,
      taskId: row.conversation_id ? String(row.conversation_id) : undefined,
      name: String(row.name),
      goal: row.goal === null ? undefined : String(row.goal),
      deliverables: stringArray(row.deliverables),
      tools: row.tools,
      plannedComponents: row.planned_components,
      confirmedSections: stringArray(row.confirmed_sections),
      userConfirmedFields: stringArray(row.user_confirmed_fields),
    }),
    revision: Number(row.revision),
    updatedAt: iso(row.updated_at),
  });
}

export class PostgresTaskWorkspaceRepository implements TaskWorkspaceRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresTaskWorkspaceRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async listTasks(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<Task>> {
    const offset = (input.page - 1) * input.pageSize;
    const [rows, totals] = await Promise.all([
      this.sql`
        SELECT
          conversation.id,
          COALESCE(first_message.content, latest_brief.goal) AS name,
          latest_brief.goal,
          latest_brief.input_description,
          latest_brief.deliverables,
          CASE
            WHEN feedback.feedback_result IS NOT NULL THEN 'completed'
            WHEN draft.status = 'draft' THEN 'package-review'
            WHEN package_state.ready_count > 0 THEN 'ready'
            ELSE conversation.phase
          END AS stage,
          CASE
            WHEN feedback.feedback_result IS NOT NULL THEN false
            WHEN draft.status = 'draft' THEN true
            WHEN package_state.ready_count > 0 THEN false
            WHEN conversation.phase IN ('clarifying', 'brief-review') THEN true
            ELSE false
          END AS needs_user_action,
          package_state.package_version_ids,
          feedback.feedback_result,
          GREATEST(
            conversation.updated_at,
            COALESCE(draft.updated_at, conversation.updated_at),
            COALESCE(package_state.latest_at, conversation.updated_at),
            COALESCE(feedback.feedback_submitted_at, conversation.updated_at)
          ) AS updated_at
        FROM ai_conversations conversation
        JOIN LATERAL (
          SELECT *
          FROM requirement_briefs brief
          WHERE brief.conversation_id = conversation.id
          ORDER BY brief.version DESC
          LIMIT 1
        ) latest_brief ON true
        LEFT JOIN LATERAL (
          SELECT content
          FROM ai_messages message
          WHERE message.conversation_id = conversation.id
            AND message.role = 'user'
          ORDER BY message.created_at, message.id
          LIMIT 1
        ) first_message ON true
        LEFT JOIN package_drafts draft
          ON draft.conversation_id = conversation.id
          AND draft.status <> 'archived'
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE version.status = 'ready')::integer AS ready_count,
            COALESCE(
              jsonb_agg(version.id ORDER BY version.version_number)
                FILTER (WHERE version.status = 'ready'),
              '[]'::jsonb
            ) AS package_version_ids,
            max(version.created_at) AS latest_at
          FROM package_versions version
          WHERE version.conversation_id = conversation.id
        ) package_state ON true
        LEFT JOIN LATERAL (
          SELECT credential.feedback_result, credential.feedback_submitted_at
          FROM download_credentials credential
          WHERE credential.source_task_id = conversation.id
            AND credential.feedback_state = 'submitted'
            AND credential.feedback_result IS NOT NULL
          ORDER BY credential.feedback_submitted_at DESC, credential.id DESC
          LIMIT 1
        ) feedback ON true
        WHERE conversation.user_id = ${userId}
          AND conversation.status = 'active'
        ORDER BY updated_at DESC, conversation.id
        LIMIT ${input.pageSize}
        OFFSET ${offset}
      `,
      this.sql`
        SELECT count(*)::integer AS total
        FROM ai_conversations conversation
        WHERE conversation.user_id = ${userId}
          AND conversation.status = 'active'
          AND EXISTS (
            SELECT 1 FROM requirement_briefs brief
            WHERE brief.conversation_id = conversation.id
          )
      `,
    ]);
    return {
      items: rows.map(mapTask),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totals[0]?.total ?? 0),
    };
  }

  async getPackageDraft(userId: string, draftId: string) {
    const [row] = await this.sql`
      SELECT *
      FROM package_drafts
      WHERE user_id = ${userId}
        AND id = ${draftId}
        AND status <> 'archived'
      LIMIT 1
    `;
    return row ? mapDraft(row) : null;
  }

  async savePackageDraft(userId: string, draft: PackageDraft) {
    const conversationId = draft.source === "ai" ? draft.taskId : null;
    if (draft.source === "ai") {
      const [conversation] = await this.sql`
        SELECT id
        FROM ai_conversations
        WHERE id = ${conversationId ?? null}
          AND user_id = ${userId}
          AND status = 'active'
        LIMIT 1
      `;
      if (!conversation) throw new WorkspaceTaskNotFoundError("没有找到关联的AI任务");
    }

    return this.sql.begin(async (transaction) => {
      const [row] = await transaction`
        INSERT INTO package_drafts (
          user_id, id, conversation_id, source, name, goal,
          deliverables, tools, planned_components,
          confirmed_sections, user_confirmed_fields
        )
        VALUES (
          ${userId},
          ${draft.id},
          ${conversationId ?? null},
          ${draft.source},
          ${draft.name},
          ${draft.goal ?? null},
          ${transaction.json(draft.deliverables)},
          ${transaction.json(toJsonValue(draft.tools))},
          ${transaction.json(toJsonValue(draft.plannedComponents))},
          ${transaction.json(draft.confirmedSections)},
          ${transaction.json(draft.userConfirmedFields)}
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
          status = CASE WHEN
            package_drafts.name IS DISTINCT FROM EXCLUDED.name
            OR package_drafts.goal IS DISTINCT FROM EXCLUDED.goal
            OR package_drafts.deliverables IS DISTINCT FROM EXCLUDED.deliverables
            OR package_drafts.tools IS DISTINCT FROM EXCLUDED.tools
            OR package_drafts.planned_components IS DISTINCT FROM EXCLUDED.planned_components
            OR package_drafts.confirmed_sections IS DISTINCT FROM EXCLUDED.confirmed_sections
            OR package_drafts.user_confirmed_fields IS DISTINCT FROM EXCLUDED.user_confirmed_fields
          THEN 'draft' ELSE package_drafts.status END,
          name = EXCLUDED.name,
          goal = EXCLUDED.goal,
          deliverables = EXCLUDED.deliverables,
          tools = EXCLUDED.tools,
          planned_components = EXCLUDED.planned_components,
          confirmed_sections = EXCLUDED.confirmed_sections,
          user_confirmed_fields = EXCLUDED.user_confirmed_fields,
          revision = CASE WHEN
            package_drafts.name IS DISTINCT FROM EXCLUDED.name
            OR package_drafts.goal IS DISTINCT FROM EXCLUDED.goal
            OR package_drafts.deliverables IS DISTINCT FROM EXCLUDED.deliverables
            OR package_drafts.tools IS DISTINCT FROM EXCLUDED.tools
            OR package_drafts.planned_components IS DISTINCT FROM EXCLUDED.planned_components
            OR package_drafts.confirmed_sections IS DISTINCT FROM EXCLUDED.confirmed_sections
            OR package_drafts.user_confirmed_fields IS DISTINCT FROM EXCLUDED.user_confirmed_fields
          THEN package_drafts.revision + 1 ELSE package_drafts.revision END,
          updated_at = CASE WHEN
            package_drafts.name IS DISTINCT FROM EXCLUDED.name
            OR package_drafts.goal IS DISTINCT FROM EXCLUDED.goal
            OR package_drafts.deliverables IS DISTINCT FROM EXCLUDED.deliverables
            OR package_drafts.tools IS DISTINCT FROM EXCLUDED.tools
            OR package_drafts.planned_components IS DISTINCT FROM EXCLUDED.planned_components
            OR package_drafts.confirmed_sections IS DISTINCT FROM EXCLUDED.confirmed_sections
            OR package_drafts.user_confirmed_fields IS DISTINCT FROM EXCLUDED.user_confirmed_fields
          THEN now() ELSE package_drafts.updated_at END
        RETURNING *
      `;
      if (!row) throw new Error("保存工具包草稿失败");
      if (conversationId) {
        await transaction`
          UPDATE ai_conversations
          SET updated_at = now()
          WHERE id = ${conversationId}
        `;
      }
      return mapDraft(row);
    });
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
