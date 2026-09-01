import type {
  DownloadCredential,
  DownloadFeedbackRequest,
  LockedPackageTool,
  PageResult,
} from "@ai-tool-workbench/contracts";
import { downloadCredentialSchema } from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql, type TransactionSql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import type {
  DownloadCredentialInput,
  DownloadHistoryRepository,
} from "./download-history-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function lockedSelections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return (value as LockedPackageTool[]).map((tool) => ({
    toolId: tool.toolId,
    versionId: tool.versionId,
    purpose: tool.purpose,
    replaceable: tool.replaceable,
  }));
}

function mapCredential(row: Row): DownloadCredential {
  const id = String(row.id);
  const packageVersionId = row.package_version_id
    ? String(row.package_version_id)
    : null;
  const toolVersionId = row.tool_version_id ? String(row.tool_version_id) : null;
  const details = Array.isArray(row.locked_tools)
    ? row.locked_tools as LockedPackageTool[]
    : [];
  return downloadCredentialSchema.parse({
    id,
    kind: row.kind,
    objectName: String(row.object_name),
    downloadedAt: iso(row.downloaded_at),
    packageVersionId,
    packageVersion: row.package_version_number
      ? `v${Number(row.package_version_number)}`
      : null,
    toolVersionId,
    toolVersion: row.tool_version ? String(row.tool_version) : null,
    sourceTaskId: row.source_task_id ? String(row.source_task_id) : null,
    lockedTools: lockedSelections(details),
    lockedToolDetails: details,
    lockedToolStatuses: Array.isArray(row.locked_tool_statuses)
      ? row.locked_tool_statuses
      : [],
    downloadUrl: `/v1/downloads/${id}/file`,
    feedbackState: row.feedback_state,
    feedbackResult: row.feedback_result ? String(row.feedback_result) : null,
    feedbackRating: row.feedback_rating === null || row.feedback_rating === undefined
      ? null
      : Number(row.feedback_rating),
    feedbackComment: row.feedback_comment === null || row.feedback_comment === undefined
      ? null
      : String(row.feedback_comment),
    feedbackSubmittedAt: row.feedback_submitted_at
      ? iso(row.feedback_submitted_at)
      : null,
  });
}

const selectCredential = (sql: Sql | TransactionSql) => sql`
  SELECT
    credential.*,
    package.version_number AS package_version_number,
    tool_version.version AS tool_version,
    COALESCE(statuses.items, '[]'::jsonb) AS locked_tool_statuses
  FROM download_credentials credential
  LEFT JOIN package_versions package
    ON package.id = credential.package_version_id
  LEFT JOIN tool_versions tool_version
    ON tool_version.id = credential.tool_version_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'toolId', locked.item ->> 'toolId',
      'toolSlug', COALESCE(tool.slug, locked.item ->> 'toolSlug', ''),
      'status', CASE
        WHEN tool.id IS NULL THEN 'missing'
        WHEN tool.status = 'offline' THEN 'offline'
        ELSE 'published'
      END,
      'latestVersion', latest.version,
      'derivedCount', COALESCE(lineage.derived_count, 0)
    )) AS items
    FROM jsonb_array_elements(credential.locked_tools) locked(item)
    LEFT JOIN tools tool ON tool.id::text = locked.item ->> 'toolId'
    LEFT JOIN tool_versions latest ON latest.id = tool.latest_version_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS derived_count
      FROM tool_lineage
      WHERE parent_tool_id = tool.id
    ) lineage ON true
  ) statuses ON true
`;

export class PostgresDownloadHistoryRepository implements DownloadHistoryRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresDownloadHistoryRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async create(input: DownloadCredentialInput) {
    const id = crypto.randomUUID();
    const [inserted] = await this.sql`
      INSERT INTO download_credentials (
        id, user_id, kind, object_name, package_version_id,
        tool_version_id, source_task_id, locked_tools
      )
      VALUES (
        ${id}, ${input.userId}, ${input.kind}, ${input.objectName},
        ${input.packageVersionId ?? null}, ${input.toolVersionId ?? null},
        ${input.sourceTaskId ?? null}, ${this.sql.json(toJson(input.lockedTools))}
      )
      RETURNING id
    `;
    if (!inserted) throw new Error("无法创建下载凭证");
    const record = await this.findById(input.userId, id);
    if (!record) throw new Error("无法读取下载凭证");
    return record;
  }

  async findById(userId: string, id: string) {
    const base = selectCredential(this.sql);
    const [row] = await this.sql`
      ${base}
      WHERE credential.id = ${id} AND credential.user_id = ${userId}
      LIMIT 1
    `;
    return row ? mapCredential(row) : null;
  }

  async list(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<DownloadCredential>> {
    const base = selectCredential(this.sql);
    const offset = (input.page - 1) * input.pageSize;
    const [rows, totals] = await Promise.all([
      this.sql`
        ${base}
        WHERE credential.user_id = ${userId}
        ORDER BY credential.downloaded_at DESC, credential.id DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `,
      this.sql`
        SELECT count(*)::integer AS total
        FROM download_credentials
        WHERE user_id = ${userId}
      `,
    ]);
    return {
      items: rows.map(mapCredential),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totals[0]?.total ?? 0),
    };
  }

  async submitFeedback(userId: string, id: string, input: DownloadFeedbackRequest) {
    return this.sql.begin(async (transaction) => {
      const [row] = await transaction`
        UPDATE download_credentials
        SET feedback_state = 'submitted',
            feedback_result = ${input.result ?? null},
            feedback_rating = ${input.rating ?? null},
            feedback_comment = ${input.comment || null},
            feedback_submitted_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, tool_version_id
      `;
      if (!row) return null;

      if (input.rating && row.tool_version_id) {
        const [version] = await transaction`
          SELECT tool_id FROM tool_versions WHERE id = ${row.tool_version_id} LIMIT 1
        `;
        if (version) {
          await transaction`
            INSERT INTO tool_reviews (
              download_id, tool_id, tool_version_id, user_id, rating, comment
            ) VALUES (
              ${id}, ${version.tool_id}, ${row.tool_version_id}, ${userId},
              ${input.rating}, ${input.comment}
            )
            ON CONFLICT (download_id) DO UPDATE SET
              rating = EXCLUDED.rating,
              comment = EXCLUDED.comment,
              updated_at = now()
          `;
          await transaction`
            INSERT INTO tool_metrics (tool_id, rating_average, rating_count, updated_at)
            SELECT ${version.tool_id}, AVG(rating)::numeric(3,2), COUNT(*), now()
            FROM tool_reviews WHERE tool_id = ${version.tool_id}
            ON CONFLICT (tool_id) DO UPDATE SET
              rating_average = EXCLUDED.rating_average,
              rating_count = EXCLUDED.rating_count,
              updated_at = now()
          `;
        }
      }

      const base = selectCredential(transaction);
      const [updated] = await transaction`
        ${base}
        WHERE credential.id = ${id} AND credential.user_id = ${userId}
        LIMIT 1
      `;
      return updated ? mapCredential(updated) : null;
    });
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
