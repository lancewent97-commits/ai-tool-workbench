import type {
  LockedPackageTool,
  PackageDraft,
  PackageVersionRecord,
} from "@ai-tool-workbench/contracts";
import {
  packageDraftSchema,
  packageVersionRecordSchema,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import {
  PackageDraftNotReadyError,
  PackageVersionNotFoundError,
  type PackageGenerationRepository,
} from "./package-generation-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown) {
  return value ? iso(value) : null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function mapVersion(row: Row): PackageVersionRecord {
  const id = String(row.id);
  return packageVersionRecordSchema.parse({
    id,
    draftId: String(row.draft_id),
    taskId: row.conversation_id ? String(row.conversation_id) : null,
    source: row.source,
    name: String(row.name),
    goal: row.goal === null ? null : String(row.goal),
    deliverables: strings(row.deliverables),
    lockedTools: row.locked_tools,
    plannedComponents: row.planned_components,
    version: `v${Number(row.version_number)}`,
    status: row.status,
    startPrompt: String(row.start_prompt ?? ""),
    downloadUrl: `/v1/package-versions/${id}/download`,
    archiveBytes: row.archive_bytes === null ? null : Number(row.archive_bytes),
    archiveSha256: row.archive_sha256 === null ? null : String(row.archive_sha256),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    createdAt: iso(row.created_at),
    readyAt: nullableIso(row.ready_at),
  });
}

export class PostgresPackageGenerationRepository implements PackageGenerationRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresPackageGenerationRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async recoverInterrupted(errorMessage: string) {
    const rows = await this.sql`
      UPDATE package_versions
      SET status = 'failed',
          error_message = ${errorMessage.slice(0, 1_000)},
          ready_at = NULL
      WHERE status = 'generating'
      RETURNING id
    `;
    return rows.length;
  }

  async reserveVersion(
    userId: string,
    draft: PackageDraft,
    lockedTools: LockedPackageTool[],
    startPrompt: string,
  ) {
    return this.sql.begin(async (transaction) => {
      const [draftRow] = await transaction`
        SELECT *
        FROM package_drafts
        WHERE user_id = ${userId}
          AND id = ${draft.id}
          AND status <> 'archived'
        FOR UPDATE
      `;
      if (!draftRow) throw new PackageVersionNotFoundError("没有找到这个工具包草稿");
      const storedDraft = packageDraftSchema.parse({
        id: String(draftRow.id),
        source: draftRow.source,
        taskId: draftRow.conversation_id ? String(draftRow.conversation_id) : undefined,
        name: String(draftRow.name),
        goal: draftRow.goal === null ? undefined : String(draftRow.goal),
        deliverables: draftRow.deliverables,
        tools: draftRow.tools,
        plannedComponents: draftRow.planned_components,
        confirmedSections: draftRow.confirmed_sections,
        userConfirmedFields: draftRow.user_confirmed_fields,
      });
      const confirmed = new Set(storedDraft.confirmedSections);
      const required = ["目标与交付", "工具与版本", "Agent任务要求", "使用前提醒"];
      if (!required.every((section) => confirmed.has(section))) {
        throw new PackageDraftNotReadyError("请先确认工具包的全部四个部分");
      }
      const [numberRow] = await transaction`
        SELECT COALESCE(max(version_number), 0) + 1 AS next
        FROM package_versions
        WHERE user_id = ${userId} AND draft_id = ${draft.id}
      `;
      const versionNumber = Number(numberRow?.next ?? 1);
      const id = crypto.randomUUID();
      const [row] = await transaction`
        INSERT INTO package_versions (
          id, user_id, draft_id, conversation_id, source, draft_revision, version_number,
          name, goal, deliverables, locked_tools, planned_components,
          draft_snapshot, start_prompt
        )
        VALUES (
          ${id}, ${userId}, ${storedDraft.id},
          ${storedDraft.taskId ?? null}, ${storedDraft.source}, ${Number(draftRow.revision)}, ${versionNumber},
          ${storedDraft.name}, ${storedDraft.goal ?? null},
          ${transaction.json(storedDraft.deliverables)},
          ${transaction.json(json(lockedTools))},
          ${transaction.json(json(storedDraft.plannedComponents))},
          ${transaction.json(json(storedDraft))},
          ${startPrompt}
        )
        RETURNING *
      `;
      if (!row) throw new Error("无法创建工具包版本");
      return { record: mapVersion(row), draft: storedDraft };
    });
  }

  async markReady(
    userId: string,
    packageVersionId: string,
    input: {
      startPrompt: string;
      archivePath: string;
      archiveBytes: number;
      archiveSha256: string;
    },
  ) {
    return this.sql.begin(async (transaction) => {
      const [row] = await transaction`
        UPDATE package_versions
        SET status = 'ready',
            start_prompt = ${input.startPrompt},
            archive_path = ${input.archivePath},
            archive_bytes = ${input.archiveBytes},
            archive_sha256 = ${input.archiveSha256},
            error_message = NULL,
            ready_at = now()
        WHERE id = ${packageVersionId}
          AND user_id = ${userId}
          AND status = 'generating'
        RETURNING *
      `;
      if (!row) throw new PackageVersionNotFoundError("没有找到正在生成的工具包版本");
      await transaction`
        UPDATE package_drafts
        SET status = 'generated', updated_at = now()
        WHERE user_id = ${userId}
          AND id = ${row.draft_id}
          AND revision = ${row.draft_revision}
      `;
      return mapVersion(row);
    });
  }

  async markFailed(userId: string, packageVersionId: string, errorMessage: string) {
    await this.sql`
      UPDATE package_versions
      SET status = 'failed', error_message = ${errorMessage.slice(0, 1_000)}
      WHERE id = ${packageVersionId} AND user_id = ${userId}
    `;
  }

  async getVersion(userId: string, packageVersionId: string) {
    const [row] = await this.sql`
      SELECT * FROM package_versions
      WHERE id = ${packageVersionId} AND user_id = ${userId}
      LIMIT 1
    `;
    return row ? mapVersion(row) : null;
  }

  async getReadyArchive(userId: string, packageVersionId: string) {
    const [row] = await this.sql`
      SELECT * FROM package_versions
      WHERE id = ${packageVersionId}
        AND user_id = ${userId}
        AND status = 'ready'
      LIMIT 1
    `;
    return row && row.archive_path
      ? { record: mapVersion(row), archivePath: String(row.archive_path) }
      : null;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
