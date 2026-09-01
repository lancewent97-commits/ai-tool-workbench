import type {
  AdminToolAssetDetail,
  AdminToolAssetSummary,
  CatalogStatus,
  CreateToolAssetRequest,
  CreateToolAssetVersionRequest,
  ToolAssetAdminQuery,
  ToolAssetEventType,
  ToolAssetOrigin,
  ToolKind,
  UpdateToolAssetRequest,
  VerificationState,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import {
  ToolAssetInvariantError,
  type ToolAssetRepository,
} from "./tool-asset-repository.js";

type JsonRecord = Record<string, unknown>;

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

function mapSummary(row: Row): AdminToolAssetSummary {
  const parentToolId = row.parent_tool_id ? String(row.parent_tool_id) : null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    problem: String(row.problem),
    result: String(row.result),
    principle: String(row.principle),
    kind: String(row.kind) as ToolKind,
    status: String(row.status) as CatalogStatus,
    origin: String(row.origin_type) as ToolAssetOrigin,
    sourceReturnId: row.source_return_id ? String(row.source_return_id) : null,
    sourceCandidateId: row.source_candidate_id
      ? String(row.source_candidate_id)
      : null,
    latestVersionId: row.latest_version_id ? String(row.latest_version_id) : null,
    latestVersion: row.latest_version ? String(row.latest_version) : null,
    categorySlug: row.category_slug ? String(row.category_slug) : null,
    moduleSlugs: strings(row.module_slugs),
    tagSlugs: strings(row.tag_slugs),
    parent: parentToolId
      ? {
          toolId: parentToolId,
          toolSlug: String(row.parent_tool_slug),
          toolName: String(row.parent_tool_name),
          versionId: String(row.parent_version_id),
          version: String(row.parent_version),
          difference: String(row.parent_difference),
        }
      : null,
    versionCount: Number(row.version_count ?? 0),
    derivedCount: Number(row.derived_count ?? 0),
    downloads: Number(row.download_count ?? 0),
    rating: row.rating_average === null || row.rating_average === undefined
      ? null
      : Number(row.rating_average),
    ratingCount: Number(row.rating_count ?? 0),
    featured: Boolean(row.featured),
    featuredOrder: row.featured_order === null || row.featured_order === undefined
      ? null
      : Number(row.featured_order),
    publishedAt: nullableIso(row.published_at),
    offlineAt: nullableIso(row.offline_at),
    offlineReason: row.offline_reason ? String(row.offline_reason) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function assetSelect(sql: Sql) {
  return sql`
    SELECT
      tool.*,
      latest.version AS latest_version,
      category.slug AS category_slug,
      COALESCE((
        SELECT array_agg(module.slug ORDER BY placement.is_primary DESC, placement.sort_order, module.slug)
        FROM tool_module_placements placement
        JOIN tool_modules module ON module.id = placement.module_id
        WHERE placement.tool_id = tool.id
      ), ARRAY[]::text[]) AS module_slugs,
      COALESCE((
        SELECT array_agg(tag.slug ORDER BY tag.sort_order, tag.slug)
        FROM tool_tag_assignments assignment
        JOIN tool_tags tag ON tag.id = assignment.tag_id
        WHERE assignment.tool_id = tool.id
      ), ARRAY[]::text[]) AS tag_slugs,
      parent.id AS parent_tool_id,
      parent.slug AS parent_tool_slug,
      parent.name AS parent_tool_name,
      parent_version.id AS parent_version_id,
      parent_version.version AS parent_version,
      lineage.difference AS parent_difference,
      (SELECT count(*) FROM tool_versions version WHERE version.tool_id = tool.id) AS version_count,
      (SELECT count(*) FROM tool_lineage child WHERE child.parent_tool_id = tool.id) AS derived_count,
      COALESCE(metrics.download_count, 0) AS download_count,
      metrics.rating_average,
      COALESCE(metrics.rating_count, 0) AS rating_count
    FROM tools tool
    LEFT JOIN tool_versions latest ON latest.id = tool.latest_version_id
    LEFT JOIN tool_categories category ON category.id = tool.primary_category_id
    LEFT JOIN tool_lineage lineage ON lineage.child_tool_id = tool.id
    LEFT JOIN tools parent ON parent.id = lineage.parent_tool_id
    LEFT JOIN tool_versions parent_version ON parent_version.id = lineage.parent_version_id
    LEFT JOIN tool_metrics metrics ON metrics.tool_id = tool.id
  `;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: string }).code === "23505",
  );
}

export class PostgresToolAssetRepository implements ToolAssetRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresToolAssetRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async listAssets(query: ToolAssetAdminQuery) {
    const q = query.q ? `%${query.q}%` : null;
    const offset = (query.page - 1) * query.pageSize;
    const [count] = await this.sql`
      SELECT count(*) AS total
      FROM tools tool
      WHERE (${q}::text IS NULL
        OR tool.name ILIKE ${q}
        OR tool.slug ILIKE ${q}
        OR tool.problem ILIKE ${q})
        AND (${query.status ?? null}::text IS NULL OR tool.status = ${query.status ?? null})
        AND (${query.origin ?? null}::text IS NULL OR tool.origin_type = ${query.origin ?? null})
    `;
    const base = assetSelect(this.sql);
    const rows = await this.sql`
      ${base}
      WHERE (${q}::text IS NULL
        OR tool.name ILIKE ${q}
        OR tool.slug ILIKE ${q}
        OR tool.problem ILIKE ${q})
        AND (${query.status ?? null}::text IS NULL OR tool.status = ${query.status ?? null})
        AND (${query.origin ?? null}::text IS NULL OR tool.origin_type = ${query.origin ?? null})
      ORDER BY tool.updated_at DESC, tool.id
      LIMIT ${query.pageSize}
      OFFSET ${offset}
    `;
    return { items: rows.map(mapSummary), total: Number(count?.total ?? 0) };
  }

  async findAsset(toolId: string) {
    const base = assetSelect(this.sql);
    const [row] = await this.sql`
      ${base}
      WHERE tool.id = ${toolId}
      LIMIT 1
    `;
    if (!row) return null;
    const [versions, events] = await Promise.all([
      this.sql`
        SELECT *
        FROM tool_versions
        WHERE tool_id = ${toolId}
        ORDER BY released_at DESC NULLS LAST, created_at DESC, id
      `,
      this.sql`
        SELECT *
        FROM tool_asset_events
        WHERE tool_id = ${toolId}
        ORDER BY created_at DESC, id DESC
      `,
    ]);
    return {
      ...mapSummary(row),
      versions: versions.map((version) => ({
        id: String(version.id),
        version: String(version.version),
        status: String(version.status) as CatalogStatus,
        verification: String(version.verification) as VerificationState,
        changeSummary: String(version.change_summary),
        standardVersion: String(version.standard_version),
        risks: strings(version.risks),
        artifactStorageKey: version.artifact_storage_key
          ? String(version.artifact_storage_key)
          : null,
        artifactSizeBytes: version.artifact_size_bytes === null
          ? null
          : Number(version.artifact_size_bytes),
        artifactSha256: version.artifact_sha256
          ? String(version.artifact_sha256)
          : null,
        downloadUrl: version.download_url ? String(version.download_url) : null,
        source: String(version.source_type) as "maintainer-upload" | "return",
        sourceReturnVersionId: version.source_return_version_id
          ? String(version.source_return_version_id)
          : null,
        releasedAt: nullableIso(version.released_at),
        offlineAt: nullableIso(version.offline_at),
        offlineReason: version.offline_reason ? String(version.offline_reason) : null,
        createdAt: iso(version.created_at),
      })),
      events: events.map((event) => ({
        id: String(event.id),
        type: String(event.event_type) as ToolAssetEventType,
        actorUserId: event.actor_user_id ? String(event.actor_user_id) : null,
        toolVersionId: event.tool_version_id ? String(event.tool_version_id) : null,
        reason: String(event.reason),
        metadata: (event.metadata ?? {}) as JsonRecord,
        createdAt: iso(event.created_at),
      })),
    };
  }

  async createAsset(actorUserId: string, input: CreateToolAssetRequest) {
    let toolId = "";
    try {
      toolId = await this.sql.begin(async (transaction) => {
        const [existing] = await transaction`
          SELECT id FROM tools WHERE slug = ${input.slug} LIMIT 1
        `;
        if (existing) {
          throw new ToolAssetInvariantError("SLUG_EXISTS", "工具标识已存在");
        }
        const categoryId = await this.resolveCategory(
          transaction as unknown as Sql,
          input.categorySlug,
        );
        const moduleIds = await this.resolveIds(
          transaction as unknown as Sql,
          "tool_modules",
          input.moduleSlugs,
        );
        const tagIds = await this.resolveIds(
          transaction as unknown as Sql,
          "tool_tags",
          input.tagSlugs,
        );
        const id = crypto.randomUUID();
        if (input.lineage) {
          const [parent] = await transaction`
            SELECT version.id
            FROM tools parent
            JOIN tool_versions version ON version.tool_id = parent.id
            WHERE parent.id = ${input.lineage.parentToolId}
              AND version.id = ${input.lineage.parentVersionId}
              AND version.status <> 'draft'
            LIMIT 1
          `;
          if (!parent) {
            throw new ToolAssetInvariantError(
              "LINEAGE_SOURCE_INVALID",
              "衍生来源工具或来源版本无效",
            );
          }
        }
        await transaction`
          INSERT INTO tools (
            id, slug, name, problem, result, principle, kind, status,
            primary_category_id, created_by_user_id, origin_type,
            featured, featured_order
          )
          VALUES (
            ${id}, ${input.slug}, ${input.name}, ${input.problem}, ${input.result},
            ${input.principle}, ${input.kind}, 'draft', ${categoryId},
            ${actorUserId}, 'maintainer-upload', false, null
          )
        `;
        await this.replaceTaxonomy(
          transaction as unknown as Sql,
          id,
          moduleIds,
          tagIds,
        );
        if (input.lineage) {
          await transaction`
            INSERT INTO tool_lineage (
              child_tool_id, parent_tool_id, parent_version_id, difference
            )
            VALUES (
              ${id}, ${input.lineage.parentToolId},
              ${input.lineage.parentVersionId}, ${input.lineage.difference}
            )
          `;
        }
        await transaction`INSERT INTO tool_metrics (tool_id) VALUES (${id})`;
        await this.recordEvent(
          transaction as unknown as Sql,
          id,
          null,
          actorUserId,
          "created",
          "",
          { origin: "maintainer-upload" },
        );
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ToolAssetInvariantError("SLUG_EXISTS", "工具标识已存在");
      }
      throw error;
    }
    const result = await this.findAsset(toolId);
    if (!result) throw new Error("新建工具后无法读取");
    return result;
  }

  async updateAsset(
    actorUserId: string,
    toolId: string,
    input: UpdateToolAssetRequest,
  ) {
    const updated = await this.sql.begin(async (transaction) => {
      const [tool] = await transaction`
        SELECT tool.id, tool.status, tool.featured, tool.featured_order,
               version.verification AS latest_verification
        FROM tools tool
        LEFT JOIN tool_versions version ON version.id = tool.latest_version_id
        WHERE tool.id = ${toolId}
        FOR UPDATE OF tool
      `;
      if (!tool) return false;
      if (
        input.featured
        && (
          tool.status !== "published"
          || !["verified", "partly-verified"].includes(String(tool.latest_verification))
        )
      ) {
        throw new ToolAssetInvariantError(
          "FEATURED_INELIGIBLE",
          "只有已上架且至少部分验证的工具可以进入首批推荐",
        );
      }
      const categoryId = await this.resolveCategory(
        transaction as unknown as Sql,
        input.categorySlug,
      );
      const moduleIds = await this.resolveIds(
        transaction as unknown as Sql,
        "tool_modules",
        input.moduleSlugs,
      );
      const tagIds = await this.resolveIds(
        transaction as unknown as Sql,
        "tool_tags",
        input.tagSlugs,
      );
      await transaction`
        UPDATE tools
        SET name = ${input.name},
            problem = ${input.problem},
            result = ${input.result},
            principle = ${input.principle},
            kind = ${input.kind},
            primary_category_id = ${categoryId},
            featured = ${input.featured},
            featured_order = ${input.featured ? input.featuredOrder : null},
            updated_at = now()
        WHERE id = ${toolId}
      `;
      await this.replaceTaxonomy(
        transaction as unknown as Sql,
        toolId,
        moduleIds,
        tagIds,
      );
      await this.recordEvent(
        transaction as unknown as Sql,
        toolId,
        null,
        actorUserId,
        "metadata-updated",
      );
      if (
        Boolean(tool.featured) !== input.featured
        || (tool.featured_order === null ? null : Number(tool.featured_order))
          !== (input.featured ? input.featuredOrder : null)
      ) {
        await this.recordEvent(
          transaction as unknown as Sql,
          toolId,
          null,
          actorUserId,
          "placement-updated",
          input.featured ? "加入首批推荐" : "移出首批推荐",
          {
            featured: input.featured,
            featuredOrder: input.featured ? input.featuredOrder : null,
          },
        );
      }
      return true;
    });
    return updated ? this.findAsset(toolId) : null;
  }

  async addVersion(
    actorUserId: string,
    toolId: string,
    input: CreateToolAssetVersionRequest,
  ) {
    let versionId = "";
    try {
      versionId = await this.sql.begin(async (transaction) => {
        const [tool] = await transaction`
          SELECT id FROM tools WHERE id = ${toolId} FOR UPDATE
        `;
        if (!tool) return "";
        const id = crypto.randomUUID();
        await transaction`
          INSERT INTO tool_versions (
            id, tool_id, version, status, verification, change_summary,
            standard_version, risks, artifact_storage_key,
            artifact_size_bytes, artifact_sha256, download_url,
            created_by_user_id, source_type
          )
          VALUES (
            ${id}, ${toolId}, ${input.version}, 'draft', ${input.verification},
            ${input.changeSummary}, ${input.standardVersion},
            ${transaction.json(input.risks)}, ${input.artifactStorageKey},
            ${input.artifactSizeBytes}, ${input.artifactSha256.toLowerCase()},
            ${input.downloadUrl}, ${actorUserId}, 'maintainer-upload'
          )
        `;
        await transaction`
          UPDATE tools SET updated_at = now() WHERE id = ${toolId}
        `;
        await this.recordEvent(
          transaction as unknown as Sql,
          toolId,
          id,
          actorUserId,
          "version-created",
        );
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ToolAssetInvariantError("VERSION_EXISTS", "这个版本号已经存在");
      }
      throw error;
    }
    if (!versionId) return null;
    return this.findAsset(toolId);
  }

  async publishVersion(actorUserId: string, toolId: string, versionId: string) {
    const updated = await this.sql.begin(async (transaction) => {
      const [version] = await transaction`
        SELECT version.*, tool.status AS tool_status
        FROM tool_versions version
        JOIN tools tool ON tool.id = version.tool_id
        WHERE version.id = ${versionId} AND version.tool_id = ${toolId}
        FOR UPDATE OF version, tool
      `;
      if (!version) return false;
      if (version.status !== "draft" && version.status !== "offline") {
        throw new ToolAssetInvariantError(
          "VERSION_NOT_DRAFT",
          "只有草稿或已下架版本可以发布",
        );
      }
      if (
        !version.artifact_storage_key
        || version.artifact_size_bytes === null
        || !version.artifact_sha256
        || !version.download_url
      ) {
        throw new ToolAssetInvariantError(
          "ARTIFACT_INCOMPLETE",
          "工具文件、大小、校验值或下载地址不完整",
        );
      }
      await transaction`
        UPDATE tool_versions
        SET status = 'published',
            released_at = COALESCE(released_at, now()),
            offline_at = null,
            offline_reason = null,
            updated_at = now()
        WHERE id = ${versionId}
      `;
      await transaction`
        UPDATE tools
        SET status = 'published',
            latest_version_id = ${versionId},
            published_at = COALESCE(published_at, now()),
            offline_at = null,
            offline_reason = null,
            updated_at = now()
        WHERE id = ${toolId}
      `;
      await this.recordEvent(
        transaction as unknown as Sql,
        toolId,
        versionId,
        actorUserId,
        "version-published",
      );
      return true;
    });
    return updated ? this.findAsset(toolId) : null;
  }

  async publishAsset(actorUserId: string, toolId: string) {
    const updated = await this.sql.begin(async (transaction) => {
      const [tool] = await transaction`
        SELECT tool.id, tool.latest_version_id
        FROM tools tool
        JOIN tool_versions version
          ON version.id = tool.latest_version_id
         AND version.status = 'published'
        WHERE tool.id = ${toolId}
        FOR UPDATE OF tool
      `;
      if (!tool) return false;
      await transaction`
        UPDATE tools
        SET status = 'published',
            offline_at = null,
            offline_reason = null,
            published_at = COALESCE(published_at, now()),
            updated_at = now()
        WHERE id = ${toolId}
      `;
      await this.recordEvent(
        transaction as unknown as Sql,
        toolId,
        String(tool.latest_version_id),
        actorUserId,
        "tool-published",
        "工具重新上架",
      );
      return true;
    });
    return updated ? this.findAsset(toolId) : null;
  }

  async offlineVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
    reason: string,
  ) {
    const updated = await this.sql.begin(async (transaction) => {
      const [version] = await transaction`
        SELECT version.*, tool.latest_version_id
        FROM tool_versions version
        JOIN tools tool ON tool.id = version.tool_id
        WHERE version.id = ${versionId} AND version.tool_id = ${toolId}
        FOR UPDATE OF version, tool
      `;
      if (!version) return false;
      if (version.status !== "published") {
        throw new ToolAssetInvariantError(
          "VERSION_NOT_PUBLISHED",
          "只有已发布版本可以下架",
        );
      }
      await transaction`
        UPDATE tool_versions
        SET status = 'offline',
            offline_at = now(),
            offline_reason = ${reason},
            updated_at = now()
        WHERE id = ${versionId}
      `;
      if (String(version.latest_version_id) === versionId) {
        const [fallback] = await transaction`
          SELECT id
          FROM tool_versions
          WHERE tool_id = ${toolId}
            AND status = 'published'
            AND id <> ${versionId}
          ORDER BY released_at DESC NULLS LAST, created_at DESC, id
          LIMIT 1
        `;
        await transaction`
          UPDATE tools
          SET latest_version_id = ${fallback?.id ?? null},
              status = ${fallback ? "published" : "offline"},
              featured = false,
              featured_order = null,
              offline_at = ${fallback ? null : new Date()},
              offline_reason = ${fallback ? null : reason},
              updated_at = now()
          WHERE id = ${toolId}
        `;
      } else {
        await transaction`UPDATE tools SET updated_at = now() WHERE id = ${toolId}`;
      }
      await this.recordEvent(
        transaction as unknown as Sql,
        toolId,
        versionId,
        actorUserId,
        "version-offline",
        reason,
      );
      return true;
    });
    return updated ? this.findAsset(toolId) : null;
  }

  async offlineAsset(actorUserId: string, toolId: string, reason: string) {
    const updated = await this.sql.begin(async (transaction) => {
      const [row] = await transaction`
        UPDATE tools
        SET status = 'offline',
            featured = false,
            featured_order = null,
            offline_at = now(),
            offline_reason = ${reason},
            updated_at = now()
        WHERE id = ${toolId}
        RETURNING id
      `;
      if (!row) return false;
      await this.recordEvent(
        transaction as unknown as Sql,
        toolId,
        null,
        actorUserId,
        "tool-offline",
        reason,
      );
      return true;
    });
    return updated ? this.findAsset(toolId) : null;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }

  private async resolveCategory(sql: Sql, slug: string | null) {
    if (!slug) return null;
    const [row] = await sql`
      SELECT id FROM tool_categories
      WHERE slug = ${slug} AND status = 'published'
      LIMIT 1
    `;
    if (!row) {
      throw new ToolAssetInvariantError(
        "TAXONOMY_NOT_FOUND",
        `功能分类 ${slug} 不存在或未启用`,
      );
    }
    return String(row.id);
  }

  private async resolveIds(
    sql: Sql,
    table: "tool_modules" | "tool_tags",
    slugs: string[],
  ) {
    if (!slugs.length) return [];
    const rows = table === "tool_modules"
      ? await sql`
          SELECT id, slug FROM tool_modules
          WHERE slug = ANY(${slugs}) AND status = 'published'
        `
      : await sql`
          SELECT id, slug FROM tool_tags
          WHERE slug = ANY(${slugs}) AND status = 'published'
        `;
    if (rows.length !== slugs.length) {
      const found = new Set(rows.map((row) => String(row.slug)));
      const missing = slugs.filter((slug) => !found.has(slug));
      throw new ToolAssetInvariantError(
        "TAXONOMY_NOT_FOUND",
        `以下分类项不存在或未启用：${missing.join("、")}`,
      );
    }
    const bySlug = new Map(rows.map((row) => [String(row.slug), String(row.id)]));
    return slugs.map((slug) => bySlug.get(slug) as string);
  }

  private async replaceTaxonomy(
    sql: Sql,
    toolId: string,
    moduleIds: string[],
    tagIds: string[],
  ) {
    await sql`DELETE FROM tool_module_placements WHERE tool_id = ${toolId}`;
    for (const [index, moduleId] of moduleIds.entries()) {
      await sql`
        INSERT INTO tool_module_placements (
          tool_id, module_id, is_primary, sort_order
        )
        VALUES (${toolId}, ${moduleId}, ${index === 0}, ${index})
      `;
    }
    await sql`DELETE FROM tool_tag_assignments WHERE tool_id = ${toolId}`;
    for (const tagId of tagIds) {
      await sql`
        INSERT INTO tool_tag_assignments (tool_id, tag_id)
        VALUES (${toolId}, ${tagId})
      `;
    }
  }

  private async recordEvent(
    sql: Sql,
    toolId: string,
    toolVersionId: string | null,
    actorUserId: string,
    type: ToolAssetEventType,
    reason = "",
    metadata: JsonRecord = {},
  ) {
    await sql`
      INSERT INTO tool_asset_events (
        tool_id, tool_version_id, actor_user_id, event_type, reason, metadata
      )
      VALUES (
        ${toolId}, ${toolVersionId}, ${actorUserId},
        ${type}, ${reason}, ${sql.json(json(metadata))}
      )
    `;
  }
}
