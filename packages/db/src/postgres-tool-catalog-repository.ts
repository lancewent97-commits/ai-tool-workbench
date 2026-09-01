import type {
  CatalogStatus,
  ToolCatalogItem,
  ToolCatalogQuery,
  ToolKind,
  ToolTaxonomy,
  ToolReview,
  ToolVersionSummary,
  VerificationState,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { ToolCatalogRepository } from "./tool-catalog-repository.js";

type JsonRecord = Record<string, unknown>;

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown) {
  return value ? iso(value) : null;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value as JsonRecord[] : [];
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapTaxonomyItem(row: JsonRecord) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    sortOrder: Number(row.sortOrder ?? 0),
  };
}

function mapVersion(row: Row | JsonRecord): ToolVersionSummary {
  const status = String(row.version_status ?? row.status) as CatalogStatus;
  return {
    id: String(row.version_id ?? row.id),
    version: String(row.version),
    status,
    verification: String(row.verification) as VerificationState,
    releasedAt: nullableIso(row.released_at),
    downloadUrl: status === "published" && row.download_url
      ? String(row.download_url)
      : null,
    risks: strings(row.risks),
    changeSummary: String(row.change_summary ?? ""),
    standardVersion: String(row.standard_version ?? "1"),
    artifactSizeBytes: row.artifact_size_bytes === null || row.artifact_size_bytes === undefined
      ? null
      : Number(row.artifact_size_bytes),
  };
}

function mapTool(row: Row): ToolCatalogItem {
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
    modules: records(row.modules).map((module) => ({
      ...mapTaxonomyItem(module),
      isPrimary: Boolean(module.isPrimary),
    })),
    category: row.category
      ? mapTaxonomyItem(row.category as JsonRecord)
      : null,
    tags: records(row.tags).map(mapTaxonomyItem),
    departments: strings(row.departments),
    roles: strings(row.roles),
    downloads: Number(row.download_count ?? 0),
    rating: row.rating_average === null || row.rating_average === undefined
      ? null
      : Number(row.rating_average),
    ratingCount: Number(row.rating_count ?? 0),
    latestVersion: mapVersion(row),
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
    derivedCount: Number(row.derived_count ?? 0),
    featured: Boolean(row.featured),
    featuredOrder: row.featured_order === null || row.featured_order === undefined
      ? null
      : Number(row.featured_order),
    publishedAt: nullableIso(row.published_at),
    updatedAt: iso(row.updated_at),
  };
}

function toolSelect(sql: Sql) {
  return sql`
    SELECT
      t.*,
      lv.id AS version_id,
      lv.version,
      lv.status AS version_status,
      lv.verification,
      lv.released_at,
      lv.download_url,
      lv.risks,
      lv.change_summary,
      lv.standard_version,
      lv.artifact_size_bytes,
      COALESCE(tm.download_count, 0) AS download_count,
      tm.rating_average,
      COALESCE(tm.rating_count, 0) AS rating_count,
      CASE WHEN tc.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tc.id,
        'slug', tc.slug,
        'name', tc.name,
        'sortOrder', tc.sort_order
      ) END AS category,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id,
          'slug', m.slug,
          'name', m.name,
          'sortOrder', mp.sort_order,
          'isPrimary', mp.is_primary
        ) ORDER BY mp.is_primary DESC, mp.sort_order, m.name)
        FROM tool_module_placements mp
        JOIN tool_modules m ON m.id = mp.module_id
        WHERE mp.tool_id = t.id AND m.status = 'published'
      ), '[]'::jsonb) AS modules,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', tag.id,
          'slug', tag.slug,
          'name', tag.name,
          'sortOrder', tag.sort_order
        ) ORDER BY tag.sort_order, tag.name)
        FROM tool_tag_assignments ta
        JOIN tool_tags tag ON tag.id = ta.tag_id
        WHERE ta.tool_id = t.id AND tag.status = 'published'
      ), '[]'::jsonb) AS tags,
      COALESCE((
        SELECT array_agg(DISTINCT d.name ORDER BY d.name)
        FROM tool_adoption_events ae
        JOIN departments d ON d.id = ae.department_id
        WHERE ae.tool_id = t.id
      ), ARRAY[]::text[]) AS departments,
      COALESCE((
        SELECT array_agg(DISTINCT jf.name ORDER BY jf.name)
        FROM tool_adoption_events ae
        JOIN job_functions jf ON jf.id = ae.job_function_id
        WHERE ae.tool_id = t.id
      ), ARRAY[]::text[]) AS roles,
      parent.id AS parent_tool_id,
      parent.slug AS parent_tool_slug,
      parent.name AS parent_tool_name,
      pv.id AS parent_version_id,
      pv.version AS parent_version,
      lineage.difference AS parent_difference,
      (
        SELECT count(*)
        FROM tool_lineage child_lineage
        JOIN tools child ON child.id = child_lineage.child_tool_id
        WHERE child_lineage.parent_tool_id = t.id
          AND child.status = 'published'
      ) AS derived_count
    FROM tools t
    JOIN tool_versions lv
      ON lv.id = t.latest_version_id
      AND lv.status = 'published'
    LEFT JOIN tool_categories tc ON tc.id = t.primary_category_id
    LEFT JOIN tool_metrics tm ON tm.tool_id = t.id
    LEFT JOIN tool_lineage lineage ON lineage.child_tool_id = t.id
    LEFT JOIN tools parent ON parent.id = lineage.parent_tool_id
    LEFT JOIN tool_versions pv ON pv.id = lineage.parent_version_id
  `;
}

export class PostgresToolCatalogRepository implements ToolCatalogRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresToolCatalogRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async listTools(query: ToolCatalogQuery) {
    const q = query.q ? `%${query.q}%` : null;
    const tags = query.tags;
    const ids = query.ids;
    const offset = (query.page - 1) * query.pageSize;

    const [countRow] = await this.sql`
      SELECT count(DISTINCT t.id) AS total
      FROM tools t
      JOIN tool_versions lv ON lv.id = t.latest_version_id AND lv.status = 'published'
      WHERE t.status = 'published'
        AND (cardinality(${ids}::uuid[]) = 0 OR t.id = ANY(${ids}::uuid[]))
        AND (${q}::text IS NULL OR t.name ILIKE ${q} OR t.problem ILIKE ${q})
        AND (${query.module ?? null}::text IS NULL OR EXISTS (
          SELECT 1
          FROM tool_module_placements mp
          JOIN tool_modules m ON m.id = mp.module_id
          WHERE mp.tool_id = t.id AND m.slug = ${query.module ?? null}
            AND m.status = 'published'
        ))
        AND (${query.category ?? null}::text IS NULL OR EXISTS (
          SELECT 1
          FROM tool_categories c
          WHERE c.id = t.primary_category_id AND c.slug = ${query.category ?? null}
            AND c.status = 'published'
        ))
        AND (${query.parent ?? null}::text IS NULL OR EXISTS (
          SELECT 1 FROM tool_lineage requested_lineage
          JOIN tools requested_parent ON requested_parent.id = requested_lineage.parent_tool_id
          WHERE requested_lineage.child_tool_id = t.id
            AND requested_parent.slug = ${query.parent ?? null}
        ))
        AND (${query.featured ?? null}::boolean IS NULL OR t.featured = ${query.featured ?? null})
        AND (${query.verification ?? null}::text IS NULL OR lv.verification = ${query.verification ?? null})
        AND (cardinality(${tags}::text[]) = 0 OR NOT EXISTS (
          SELECT 1
          FROM unnest(${tags}::text[]) selected_tag
          WHERE NOT EXISTS (
            SELECT 1
            FROM tool_tag_assignments ta
            JOIN tool_tags tag ON tag.id = ta.tag_id
            WHERE ta.tool_id = t.id AND tag.slug = selected_tag
              AND tag.status = 'published'
          )
        ))
    `;

    const base = toolSelect(this.sql);
    const rows = await this.sql`
      ${base}
      WHERE t.status = 'published'
        AND (cardinality(${ids}::uuid[]) = 0 OR t.id = ANY(${ids}::uuid[]))
        AND (${q}::text IS NULL OR t.name ILIKE ${q} OR t.problem ILIKE ${q})
        AND (${query.module ?? null}::text IS NULL OR EXISTS (
          SELECT 1
          FROM tool_module_placements mp2
          JOIN tool_modules m2 ON m2.id = mp2.module_id
          WHERE mp2.tool_id = t.id AND m2.slug = ${query.module ?? null}
            AND m2.status = 'published'
        ))
        AND (${query.category ?? null}::text IS NULL OR EXISTS (
          SELECT 1
          FROM tool_categories c2
          WHERE c2.id = t.primary_category_id AND c2.slug = ${query.category ?? null}
            AND c2.status = 'published'
        ))
        AND (${query.parent ?? null}::text IS NULL OR EXISTS (
          SELECT 1 FROM tool_lineage requested_lineage2
          JOIN tools requested_parent2 ON requested_parent2.id = requested_lineage2.parent_tool_id
          WHERE requested_lineage2.child_tool_id = t.id
            AND requested_parent2.slug = ${query.parent ?? null}
        ))
        AND (${query.featured ?? null}::boolean IS NULL OR t.featured = ${query.featured ?? null})
        AND (${query.verification ?? null}::text IS NULL OR lv.verification = ${query.verification ?? null})
        AND (cardinality(${tags}::text[]) = 0 OR NOT EXISTS (
          SELECT 1
          FROM unnest(${tags}::text[]) selected_tag
          WHERE NOT EXISTS (
            SELECT 1
            FROM tool_tag_assignments ta2
            JOIN tool_tags tag2 ON tag2.id = ta2.tag_id
            WHERE ta2.tool_id = t.id AND tag2.slug = selected_tag
              AND tag2.status = 'published'
          )
        ))
      ORDER BY
        CASE WHEN ${query.featured ?? false} THEN t.featured_order END ASC NULLS LAST,
        CASE WHEN ${query.sort} = 'popular' THEN COALESCE(tm.download_count, 0) END DESC,
        CASE WHEN ${query.sort} = 'rating' THEN tm.rating_average END DESC NULLS LAST,
        CASE WHEN ${query.sort} = 'name' THEN t.name END ASC,
        CASE WHEN ${query.sort} = 'newest' THEN t.published_at END DESC,
        t.published_at DESC,
        t.id
      LIMIT ${query.pageSize}
      OFFSET ${offset}
    `;

    return {
      items: rows.map(mapTool),
      total: Number(countRow?.total ?? 0),
    };
  }

  async findToolBySlug(slug: string) {
    const base = toolSelect(this.sql);
    const [row] = await this.sql`
      ${base}
      WHERE t.slug = ${slug} AND t.status = 'published'
      LIMIT 1
    `;
    return row ? mapTool(row) : null;
  }

  async findToolsByVersionIds(versionIds: string[]) {
    if (versionIds.length === 0) return [];
    const rows = await this.sql`
      SELECT v.*, t.slug
      FROM tool_versions v
      JOIN tools t ON t.id = v.tool_id
      WHERE v.id = ANY(${versionIds}::uuid[])
        AND v.status = 'published'
        AND t.status = 'published'
    `;
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    const result: Array<{ tool: ToolCatalogItem; version: ToolVersionSummary }> = [];
    for (const versionId of versionIds) {
      const row = byId.get(versionId);
      if (!row) continue;
      const tool = await this.findToolBySlug(String(row.slug));
      if (tool) result.push({ tool, version: mapVersion(row) });
    }
    return result;
  }

  async listVersions(slug: string) {
    const [tool] = await this.sql`
      SELECT id FROM tools WHERE slug = ${slug} AND status = 'published' LIMIT 1
    `;
    if (!tool) return null;
    const rows = await this.sql`
      SELECT *
      FROM tool_versions
      WHERE tool_id = ${tool.id} AND status <> 'draft'
      ORDER BY released_at DESC NULLS LAST, created_at DESC
    `;
    return rows.map(mapVersion);
  }

  async listDerivedTools(slug: string) {
    const [tool] = await this.sql`
      SELECT id FROM tools WHERE slug = ${slug} AND status = 'published' LIMIT 1
    `;
    if (!tool) return null;
    const base = toolSelect(this.sql);
    const rows = await this.sql`
      ${base}
      JOIN tool_lineage requested_lineage ON requested_lineage.child_tool_id = t.id
      WHERE requested_lineage.parent_tool_id = ${tool.id}
        AND t.status = 'published'
      ORDER BY COALESCE(tm.download_count, 0) DESC, t.published_at DESC
    `;
    return rows.map(mapTool);
  }

  async listReviews(slug: string, limit = 20): Promise<ToolReview[] | null> {
    const [tool] = await this.sql`
      SELECT id FROM tools WHERE slug = ${slug} LIMIT 1
    `;
    if (!tool) return null;
    const rows = await this.sql`
      SELECT review.id, review.rating, review.comment, review.created_at,
             COALESCE(NULLIF(user_account.display_name, ''), user_account.internal_account) AS author
      FROM tool_reviews review
      JOIN users user_account ON user_account.id = review.user_id
      WHERE review.tool_id = ${tool.id}
      ORDER BY review.created_at DESC, review.id DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      rating: Number(row.rating),
      comment: String(row.comment ?? ""),
      author: String(row.author),
      createdAt: iso(row.created_at),
    }));
  }

  async listTaxonomy(): Promise<ToolTaxonomy> {
    const [modules, categories, tags] = await Promise.all([
      this.sql`SELECT id, slug, name, sort_order FROM tool_modules
        WHERE status = 'published' ORDER BY sort_order, name`,
      this.sql`SELECT id, slug, name, sort_order FROM tool_categories
        WHERE status = 'published' ORDER BY sort_order, name`,
      this.sql`SELECT id, slug, name, sort_order FROM tool_tags
        WHERE status = 'published' ORDER BY sort_order, name`,
    ]);
    const mapRow = (row: Row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      sortOrder: Number(row.sort_order),
    });
    return {
      modules: modules.map(mapRow),
      categories: categories.map(mapRow),
      tags: tags.map(mapRow),
    };
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
