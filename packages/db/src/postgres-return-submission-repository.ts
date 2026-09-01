import {
  returnAssetCandidateSchema,
  returnFindingSchema,
  returnRecordSchema,
  returnReviewRecordSchema,
  type ReturnAssetCandidate,
  type ReturnFinding,
  type ReturnRecord,
  type ReturnReviewRecord,
  type ReturnVersionRecord,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import type {
  PublishedReturnAssetInput,
  ReturnSubmissionRepository,
  ReturnVersionInput,
} from "./return-submission-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function findings(value: unknown): ReturnFinding[] {
  return Array.isArray(value)
    ? value.map((item) => returnFindingSchema.parse(item))
    : [];
}

function assetCandidates(value: unknown): ReturnAssetCandidate[] {
  return Array.isArray(value)
    ? value.map((item) => returnAssetCandidateSchema.parse(item))
    : [];
}

function mapVersion(row: Row): ReturnVersionRecord {
  return {
    id: String(row.id),
    version: `v${Number(row.version_number)}`,
    fileName: String(row.file_name),
    archiveBytes: Number(row.archive_bytes),
    archiveSha256: String(row.archive_sha256),
    retained: Boolean(row.archive_path),
    precheckStatus: row.precheck_status === "passed" ? "passed" : "failed",
    findings: findings(row.findings),
    assetCandidates: assetCandidates(row.asset_candidates),
    fixPrompt: String(row.fix_prompt),
    uploadedAt: iso(row.uploaded_at),
    submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
  };
}

function events(versions: ReturnVersionRecord[]) {
  return versions.flatMap((version) => {
    const uploaded = {
      id: `${version.id}-uploaded`,
      at: version.uploadedAt,
      type: "uploaded" as const,
      title: `上传 ${version.version}`,
      detail: `${version.fileName} · ${version.archiveBytes.toLocaleString()} bytes`,
    };
    const checked = {
      id: `${version.id}-precheck`,
      at: version.uploadedAt,
      type: "precheck" as const,
      title: version.precheckStatus === "passed" ? "自动检查通过" : "自动检查未通过",
      detail: version.precheckStatus === "passed"
        ? "没有必须修复项，可以提交维护人员审核。"
        : `发现 ${version.findings.filter((item) => item.level === "required").length} 个必须修复项。`,
    };
    const submitted = version.submittedAt
      ? [{
          id: `${version.id}-submitted`,
          at: version.submittedAt,
          type: "review" as const,
          title: "已提交人工审核",
          detail: "当前版本已进入维护人员审核队列。",
        }]
      : [];
    return [uploaded, checked, ...submitted];
  });
}

const baseSelect = (sql: Sql) => sql`
  SELECT
    submission.*,
    credential.object_name AS source_object_name,
    package.version_number AS source_package_version_number,
    tool_version.version AS source_tool_version
  FROM return_submissions submission
  JOIN download_credentials credential
    ON credential.id = submission.source_download_id
  LEFT JOIN package_versions package
    ON package.id = credential.package_version_id
  LEFT JOIN tool_versions tool_version
    ON tool_version.id = credential.tool_version_id
`;

export class PostgresReturnSubmissionRepository implements ReturnSubmissionRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresReturnSubmissionRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async addVersion(input: ReturnVersionInput) {
    const returnId = input.returnId ?? crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await this.sql.begin(async (transaction) => {
      const [ownedDownload] = await transaction`
        SELECT id FROM download_credentials
        WHERE id = ${input.sourceDownloadId} AND user_id = ${input.userId}
        LIMIT 1
      `;
      if (!ownedDownload) throw new Error("RETURN_SOURCE_NOT_FOUND");

      const [existing] = await transaction`
        SELECT id, source_download_id, current_version_number
        FROM return_submissions
        WHERE id = ${returnId} AND user_id = ${input.userId}
        FOR UPDATE
      `;
      if (input.returnId && !existing) throw new Error("RETURN_NOT_FOUND");
      if (existing && String(existing.source_download_id) !== input.sourceDownloadId) {
        throw new Error("RETURN_SOURCE_MISMATCH");
      }
      const versionNumber = existing
        ? Number(existing.current_version_number) + 1
        : 1;
      const state = input.precheckStatus === "passed"
        ? "precheck-passed"
        : "precheck-failed";

      if (!existing) {
        await transaction`
          INSERT INTO return_submissions (
            id, user_id, source_download_id, name, state, current_version_number
          )
          VALUES (
            ${returnId}, ${input.userId}, ${input.sourceDownloadId},
            ${input.name}, ${state}, ${versionNumber}
          )
        `;
      }
      await transaction`
        INSERT INTO return_versions (
          id, return_id, version_number, file_name, archive_path,
          archive_bytes, archive_sha256, precheck_status, findings,
          asset_candidates, fix_prompt
        )
        VALUES (
          ${versionId}, ${returnId}, ${versionNumber}, ${input.fileName},
          ${input.archivePath ?? null}, ${input.archiveBytes},
          ${input.archiveSha256}, ${input.precheckStatus},
          ${transaction.json(json(input.findings))},
          ${transaction.json(json(input.assetCandidates))}, ${input.fixPrompt}
        )
      `;
      if (existing) {
        await transaction`
          UPDATE return_submissions
          SET name = ${input.name},
              state = ${state},
              current_version_number = ${versionNumber},
              review_reason = null,
              updated_at = now()
          WHERE id = ${returnId}
        `;
      }
    });
    const record = await this.findById(input.userId, returnId);
    if (!record) throw new Error("无法读取回传记录");
    return record;
  }

  async findById(userId: string, returnId: string) {
    const base = baseSelect(this.sql);
    const [row] = await this.sql`
      ${base}
      WHERE submission.id = ${returnId} AND submission.user_id = ${userId}
      LIMIT 1
    `;
    return row ? this.mapRecord(row) : null;
  }

  async list(
    userId: string,
    input: { page: number; pageSize: number },
  ) {
    const base = baseSelect(this.sql);
    const offset = (input.page - 1) * input.pageSize;
    const [rows, totals] = await Promise.all([
      this.sql`
        ${base}
        WHERE submission.user_id = ${userId}
        ORDER BY submission.updated_at DESC, submission.id DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `,
      this.sql`
        SELECT count(*)::integer AS total
        FROM return_submissions
        WHERE user_id = ${userId}
      `,
    ]);
    return {
      items: await Promise.all(rows.map((row) => this.mapRecord(row))),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totals[0]?.total ?? 0),
    };
  }

  async setListing(userId: string, returnId: string, listed: boolean) {
    const updated = await this.sql.begin(async (transaction) => {
      const [submission] = await transaction`
        SELECT id, state, listed
        FROM return_submissions
        WHERE id = ${returnId}
          AND user_id = ${userId}
          AND state IN ('published', 'offline')
        FOR UPDATE
      `;
      if (!submission) return false;
      if (Boolean(submission.listed) === listed) return true;

      const reason = listed ? "回传人重新上架" : "回传人主动下架";
      if (listed) {
        await transaction`
          UPDATE tools tool
          SET status = 'published',
              offline_at = null,
              offline_reason = null,
              published_at = COALESCE(tool.published_at, now()),
              updated_at = now()
          FROM return_publish_records record
          WHERE record.return_id = ${returnId}
            AND record.tool_id = tool.id
        `;
        await transaction`
          INSERT INTO tool_asset_events (
            tool_id, tool_version_id, actor_user_id, event_type, reason,
            metadata
          )
          SELECT
            record.tool_id, record.tool_version_id, ${userId},
            'tool-published', ${reason},
            jsonb_build_object('returnId', ${returnId}::text)
          FROM return_publish_records record
          WHERE record.return_id = ${returnId}
        `;
      } else {
        await transaction`
          UPDATE tools tool
          SET status = 'offline',
              offline_at = now(),
              offline_reason = ${reason},
              updated_at = now()
          FROM return_publish_records record
          WHERE record.return_id = ${returnId}
            AND record.tool_id = tool.id
        `;
        await transaction`
          INSERT INTO tool_asset_events (
            tool_id, tool_version_id, actor_user_id, event_type, reason,
            metadata
          )
          SELECT
            record.tool_id, record.tool_version_id, ${userId},
            'tool-offline', ${reason},
            jsonb_build_object('returnId', ${returnId}::text)
          FROM return_publish_records record
          WHERE record.return_id = ${returnId}
        `;
      }
      await transaction`
        UPDATE return_submissions
        SET state = ${listed ? "published" : "offline"},
            listed = ${listed},
            updated_at = now()
        WHERE id = ${returnId}
      `;
      return true;
    });
    return updated ? this.findById(userId, returnId) : null;
  }

  async submitForReview(userId: string, returnId: string) {
    const updatedRows = await this.sql.begin(async (transaction) => {
      const rows = await transaction`
        UPDATE return_submissions submission
        SET state = 'reviewing', updated_at = now()
        FROM return_versions version
        WHERE submission.id = ${returnId}
          AND submission.user_id = ${userId}
          AND submission.state = 'precheck-passed'
          AND version.return_id = submission.id
          AND version.version_number = submission.current_version_number
          AND version.precheck_status = 'passed'
        RETURNING submission.id, version.id AS version_id
      `;
      const row = rows[0];
      if (row) {
        await transaction`
          UPDATE return_versions
          SET submitted_at = now()
          WHERE id = ${row.version_id}
        `;
      }
      return rows;
    });
    return updatedRows[0] ? this.findById(userId, returnId) : null;
  }

  async listForReview(input: { page: number; pageSize: number }) {
    const offset = (input.page - 1) * input.pageSize;
    const [rows, totals] = await Promise.all([
      this.sql`
        SELECT
          submission.*,
          credential.object_name AS source_object_name,
          package.version_number AS source_package_version_number,
          tool_version.version AS source_tool_version,
          users.display_name AS uploader_display_name,
          users.internal_account AS uploader_account
        FROM return_submissions submission
        JOIN download_credentials credential
          ON credential.id = submission.source_download_id
        LEFT JOIN package_versions package
          ON package.id = credential.package_version_id
        LEFT JOIN tool_versions tool_version
          ON tool_version.id = credential.tool_version_id
        JOIN users ON users.id = submission.user_id
        WHERE submission.state = 'reviewing'
        ORDER BY submission.updated_at ASC, submission.id ASC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `,
      this.sql`
        SELECT count(*)::integer AS total
        FROM return_submissions
        WHERE state = 'reviewing'
      `,
    ]);
    return {
      items: await Promise.all(rows.map((row) => this.mapReviewRecord(row))),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(totals[0]?.total ?? 0),
    };
  }

  async findForReview(returnId: string) {
    const [row] = await this.sql`
      SELECT
        submission.*,
        credential.object_name AS source_object_name,
        package.version_number AS source_package_version_number,
        tool_version.version AS source_tool_version,
        users.display_name AS uploader_display_name,
        users.internal_account AS uploader_account
      FROM return_submissions submission
      JOIN download_credentials credential
        ON credential.id = submission.source_download_id
      LEFT JOIN package_versions package
        ON package.id = credential.package_version_id
      LEFT JOIN tool_versions tool_version
        ON tool_version.id = credential.tool_version_id
      JOIN users ON users.id = submission.user_id
      WHERE submission.id = ${returnId}
      LIMIT 1
    `;
    return row ? this.mapReviewRecord(row) : null;
  }

  async rejectReview(input: {
    reviewerUserId: string;
    returnId: string;
    reason: string;
  }) {
    const rows = await this.sql.begin(async (transaction) => {
      const [current] = await transaction`
        SELECT submission.id, version.id AS version_id
        FROM return_submissions submission
        JOIN return_versions version
          ON version.return_id = submission.id
         AND version.version_number = submission.current_version_number
        WHERE submission.id = ${input.returnId}
          AND submission.state = 'reviewing'
        FOR UPDATE OF submission
      `;
      if (!current) return [];
      await transaction`
        INSERT INTO return_review_decisions (
          return_id, return_version_id, reviewer_user_id, decision, reason
        )
        VALUES (
          ${input.returnId}, ${current.version_id},
          ${input.reviewerUserId}, 'rejected', ${input.reason}
        )
      `;
      return transaction`
        UPDATE return_submissions
        SET state = 'review-rejected',
            review_reason = ${input.reason},
            updated_at = now()
        WHERE id = ${input.returnId}
        RETURNING id, user_id
      `;
    });
    const row = rows[0] as Row | undefined;
    return row ? this.findById(String(row.user_id), input.returnId) : null;
  }

  async approveReview(input: {
    reviewerUserId: string;
    returnId: string;
    assets: PublishedReturnAssetInput[];
  }) {
    const rows = await this.sql.begin(async (transaction) => {
      const [current] = await transaction`
        SELECT
          submission.id,
          submission.user_id,
          version.id AS version_id,
          version.asset_candidates
        FROM return_submissions submission
        JOIN return_versions version
          ON version.return_id = submission.id
         AND version.version_number = submission.current_version_number
        WHERE submission.id = ${input.returnId}
          AND submission.state = 'reviewing'
          AND version.precheck_status = 'passed'
          AND version.submitted_at IS NOT NULL
        FOR UPDATE OF submission
      `;
      if (!current) return [];
      const expectedIds = assetCandidates(current.asset_candidates)
        .map((candidate) => candidate.id)
        .sort();
      const receivedIds = input.assets.map((asset) => asset.candidate.id).sort();
      if (
        expectedIds.length === 0
        || expectedIds.length !== receivedIds.length
        || expectedIds.some((id, index) => id !== receivedIds[index])
      ) {
        throw new Error("RETURN_ASSET_MISMATCH");
      }

      const publishedAssets: Array<{
        type: "composite" | "derived" | "new";
        toolId: string;
        slug: string;
        name: string;
        reason: string;
      }> = [];
      await transaction`
        INSERT INTO return_review_decisions (
          return_id, return_version_id, reviewer_user_id, decision, reason
        )
        VALUES (
          ${input.returnId}, ${current.version_id},
          ${input.reviewerUserId}, 'approved', ''
        )
      `;

      for (const asset of input.assets) {
        const candidate = asset.candidate;
        const toolId = crypto.randomUUID();
        const toolVersionId = crypto.randomUUID();
        const [parent] = candidate.sourceToolId
          ? await transaction`
              SELECT
                tool.primary_category_id,
                version.id AS version_id
              FROM tools tool
              JOIN tool_versions version ON version.tool_id = tool.id
              WHERE tool.id = ${candidate.sourceToolId}
                AND version.id = ${candidate.sourceVersionId}
              LIMIT 1
            `
          : [];
        if (
          candidate.type === "derived"
          && (!parent || !candidate.sourceToolId || !candidate.sourceVersionId)
        ) {
          throw new Error("RETURN_DERIVED_SOURCE_INVALID");
        }

        const [category] = candidate.categorySlug
          ? await transaction`
              SELECT id FROM tool_categories
              WHERE slug = ${candidate.categorySlug} AND status = 'published'
              LIMIT 1
            `
          : candidate.type === "composite"
            ? await transaction`
                SELECT id FROM tool_categories
                WHERE slug = 'composite' AND status = 'published'
                LIMIT 1
              `
            : [];
        const categoryId = category?.id ?? parent?.primary_category_id ?? null;

        await transaction`
          INSERT INTO tools (
            id, slug, name, problem, result, principle, kind, status,
            primary_category_id, latest_version_id, created_by_user_id,
            published_at, origin_type, source_return_id, source_candidate_id
          )
          VALUES (
            ${toolId}, ${asset.slug}, ${candidate.name}, ${candidate.problem},
            ${candidate.result}, ${candidate.principle}, ${candidate.kind},
            'published', ${categoryId}, null, ${current.user_id}, now(),
            ${candidate.type === "composite"
              ? "return-composite"
              : candidate.type === "derived"
                ? "return-derived"
                : "return-new"},
            ${input.returnId}, ${candidate.id}
          )
        `;
        await transaction`
          INSERT INTO tool_versions (
            id, tool_id, version, status, verification, change_summary,
            standard_version, risks, artifact_storage_key,
            artifact_size_bytes, artifact_sha256, download_url,
            created_by_user_id, released_at, source_type,
            source_return_version_id
          )
          VALUES (
            ${toolVersionId}, ${toolId}, ${candidate.version}, 'published',
            ${candidate.verification}, ${candidate.reason},
            ${candidate.standardVersion},
            ${transaction.json(json(candidate.risks))},
            ${asset.artifactPath}, ${asset.artifactBytes},
            ${asset.artifactSha256}, ${asset.downloadUrl},
            ${current.user_id}, now(), 'return', ${current.version_id}
          )
        `;
        await transaction`
          UPDATE tools
          SET latest_version_id = ${toolVersionId}, updated_at = now()
          WHERE id = ${toolId}
        `;
        await transaction`
          INSERT INTO tool_metrics (tool_id)
          VALUES (${toolId})
        `;

        const requestedModules = candidate.moduleSlugs.length
          ? await transaction`
              SELECT id, slug FROM tool_modules
              WHERE slug = ANY(${candidate.moduleSlugs}) AND status = 'published'
              ORDER BY sort_order, slug
            `
          : [];
        const inheritedModules = !requestedModules.length && candidate.sourceToolId
          ? await transaction`
              SELECT module_id AS id
              FROM tool_module_placements
              WHERE tool_id = ${candidate.sourceToolId}
              ORDER BY is_primary DESC, sort_order, module_id
            `
          : [];
        const moduleRows = requestedModules.length
          ? requestedModules
          : inheritedModules.length
            ? inheritedModules
            : await transaction`
                SELECT id FROM tool_modules
                WHERE slug = 'content-production' AND status = 'published'
                LIMIT 1
              `;
        for (const [index, module] of moduleRows.entries()) {
          await transaction`
            INSERT INTO tool_module_placements (
              tool_id, module_id, is_primary, sort_order
            )
            VALUES (${toolId}, ${module.id}, ${index === 0}, ${index})
          `;
        }

        if (candidate.tagSlugs.length) {
          const tags = await transaction`
            SELECT id FROM tool_tags
            WHERE slug = ANY(${candidate.tagSlugs}) AND status = 'published'
          `;
          for (const tag of tags) {
            await transaction`
              INSERT INTO tool_tag_assignments (tool_id, tag_id)
              VALUES (${toolId}, ${tag.id})
            `;
          }
        }

        if (candidate.type === "derived") {
          await transaction`
            INSERT INTO tool_lineage (
              child_tool_id, parent_tool_id, parent_version_id, difference
            )
            VALUES (
              ${toolId}, ${candidate.sourceToolId},
              ${candidate.sourceVersionId},
              ${candidate.difference ?? candidate.reason}
            )
          `;
        }
        await transaction`
          INSERT INTO tool_asset_events (
            tool_id, actor_user_id, event_type, reason, metadata
          )
          VALUES (
            ${toolId}, ${input.reviewerUserId}, 'created',
            ${candidate.reason},
            ${transaction.json({
              origin: candidate.type,
              returnId: input.returnId,
              candidateId: candidate.id,
            })}
          )
        `;
        await transaction`
          INSERT INTO tool_asset_events (
            tool_id, tool_version_id, actor_user_id, event_type, reason, metadata
          )
          VALUES (
            ${toolId}, ${toolVersionId}, ${input.reviewerUserId},
            'version-published', ${candidate.reason},
            ${transaction.json({
              returnId: input.returnId,
              returnVersionId: String(current.version_id),
            })}
          )
        `;
        await transaction`
          INSERT INTO return_publish_records (
            return_id, return_version_id, candidate_id, tool_id, tool_version_id
          )
          VALUES (
            ${input.returnId}, ${current.version_id}, ${candidate.id},
            ${toolId}, ${toolVersionId}
          )
        `;
        publishedAssets.push({
          type: candidate.type,
          toolId,
          slug: asset.slug,
          name: candidate.name,
          reason: candidate.reason,
        });
      }

      return transaction`
        UPDATE return_submissions
        SET state = 'published',
            assets = ${transaction.json(json(publishedAssets))},
            listed = true,
            review_reason = null,
            updated_at = now()
        WHERE id = ${input.returnId}
        RETURNING id, user_id
      `;
    });
    const row = rows[0] as Row | undefined;
    return row ? this.findById(String(row.user_id), input.returnId) : null;
  }

  async findVersionFile(userId: string, returnId: string, versionId: string) {
    const [row] = await this.sql`
      SELECT version.archive_path, version.file_name, version.archive_bytes
      FROM return_versions version
      JOIN return_submissions submission ON submission.id = version.return_id
      WHERE submission.id = ${returnId}
        AND submission.user_id = ${userId}
        AND version.id = ${versionId}
        AND version.archive_path IS NOT NULL
      LIMIT 1
    `;
    return row
      ? {
          path: String(row.archive_path),
          fileName: String(row.file_name),
          bytes: Number(row.archive_bytes),
        }
      : null;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }

  private async mapRecord(row: Row): Promise<ReturnRecord> {
    const [versionRows, decisionRows, publishRows, adoptionRows] = await Promise.all([
      this.sql`
        SELECT * FROM return_versions
        WHERE return_id = ${row.id}
        ORDER BY version_number ASC
      `,
      this.sql`
        SELECT decision.*, version.version_number
        FROM return_review_decisions decision
        JOIN return_versions version ON version.id = decision.return_version_id
        WHERE decision.return_id = ${row.id}
        ORDER BY decision.decided_at ASC, decision.id ASC
      `,
      this.sql`
        SELECT record.published_at, record.tool_id, tool.slug
        FROM return_publish_records record
        JOIN tools tool ON tool.id = record.tool_id
        WHERE record.return_id = ${row.id}
        ORDER BY record.published_at ASC, record.id ASC
      `,
      this.sql`
        SELECT count(DISTINCT credential.id)::integer AS adopted_count
        FROM return_publish_records record
        JOIN download_credentials credential
          ON EXISTS (
            SELECT 1
            FROM jsonb_array_elements(credential.locked_tools) locked(item)
            WHERE locked.item ->> 'toolId' = record.tool_id::text
          )
        WHERE record.return_id = ${row.id}
      `,
    ]);
    const versions = versionRows.map(mapVersion);
    const current = versions.at(-1);
    if (!current) throw new Error("回传记录缺少版本");
    const history = [
      ...events(versions),
      ...decisionRows.map((decision) => ({
        id: `${String(decision.id)}-review`,
        at: iso(decision.decided_at),
        type: "review" as const,
        title: decision.decision === "approved"
          ? "维护人员审核通过"
          : "维护人员审核未通过",
        detail: decision.decision === "approved"
          ? `回传 ${`v${Number(decision.version_number)}`} 已通过审核。`
          : String(decision.reason),
      })),
      ...(publishRows[0] ? [{
        id: `${String(row.id)}-published`,
        at: iso(publishRows[0].published_at),
        type: "published" as const,
        title: "已自动发布",
        detail: `形成 ${publishRows.length} 个平台工具资产并上架。`,
      }] : []),
    ].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
    return returnRecordSchema.parse({
      id: String(row.id),
      name: String(row.name),
      sourceDownloadId: String(row.source_download_id),
      sourceObjectName: String(row.source_object_name),
      sourcePackageVersion: row.source_package_version_number
        ? `v${Number(row.source_package_version_number)}`
        : null,
      sourceToolVersion: row.source_tool_version
        ? String(row.source_tool_version)
        : null,
      version: current.version,
      state: row.state,
      updatedAt: iso(row.updated_at),
      createdAt: iso(row.created_at),
      findings: current.findings,
      fixPrompt: current.fixPrompt,
      events: history,
      versions,
      assets: Array.isArray(row.assets)
        ? row.assets.map((asset) => {
            const value = asset as { toolId?: unknown };
            const published = publishRows.find(
              (entry) => String(entry.tool_id) === String(value.toolId),
            );
            return published ? { ...value, slug: String(published.slug) } : value;
          })
        : [],
      adoptedCount: Number(adoptionRows[0]?.adopted_count ?? 0),
      listed: Boolean(row.listed),
      reviewReason: row.review_reason ? String(row.review_reason) : null,
    });
  }

  private async mapReviewRecord(row: Row): Promise<ReturnReviewRecord> {
    return returnReviewRecordSchema.parse({
      submission: await this.mapRecord(row),
      uploader: {
        id: String(row.user_id),
        displayName: String(row.uploader_display_name),
        account: String(row.uploader_account),
      },
    });
  }
}
