import type {
  AdminToolAssetDetail,
  CreateToolAssetRequest,
  CreateToolAssetVersionRequest,
  ToolAssetAdminQuery,
  UpdateToolAssetRequest,
} from "@ai-tool-workbench/contracts";
import {
  ToolAssetInvariantError,
  type ToolAssetRepository,
} from "@ai-tool-workbench/db";
import { randomUUID } from "node:crypto";

function now() {
  return new Date().toISOString();
}

export class MemoryToolAssetRepository implements ToolAssetRepository {
  private readonly tools = new Map<string, AdminToolAssetDetail>();

  async healthCheck() {}

  async listAssets(query: ToolAssetAdminQuery) {
    const q = query.q?.toLowerCase();
    const items = [...this.tools.values()]
      .filter((tool) => !q || `${tool.slug} ${tool.name} ${tool.problem}`.toLowerCase().includes(q))
      .filter((tool) => !query.status || tool.status === query.status)
      .filter((tool) => !query.origin || tool.origin === query.origin)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize).map(this.summary),
      total: items.length,
    };
  }

  async findAsset(toolId: string) {
    const tool = this.tools.get(toolId);
    return tool ? structuredClone(tool) : null;
  }

  async createAsset(actorUserId: string, input: CreateToolAssetRequest) {
    if ([...this.tools.values()].some((tool) => tool.slug === input.slug)) {
      throw new ToolAssetInvariantError("SLUG_EXISTS", "工具标识已存在");
    }
    let parent: AdminToolAssetDetail["parent"] = null;
    if (input.lineage) {
      const source = this.tools.get(input.lineage.parentToolId);
      const version = source?.versions.find(
        (item) =>
          item.id === input.lineage?.parentVersionId
          && item.status !== "draft",
      );
      if (!source || !version) {
        throw new ToolAssetInvariantError(
          "LINEAGE_SOURCE_INVALID",
          "衍生来源工具或来源版本无效",
        );
      }
      parent = {
        toolId: source.id,
        toolSlug: source.slug,
        toolName: source.name,
        versionId: version.id,
        version: version.version,
        difference: input.lineage.difference,
      };
      source.derivedCount += 1;
    }
    const createdAt = now();
    const tool: AdminToolAssetDetail = {
      id: randomUUID(),
      slug: input.slug,
      name: input.name,
      problem: input.problem,
      result: input.result,
      principle: input.principle,
      kind: input.kind,
      status: "draft",
      origin: "maintainer-upload",
      sourceReturnId: null,
      sourceCandidateId: null,
      latestVersionId: null,
      latestVersion: null,
      categorySlug: input.categorySlug,
      moduleSlugs: input.moduleSlugs,
      tagSlugs: input.tagSlugs,
      parent,
      versionCount: 0,
      derivedCount: 0,
      downloads: 0,
      rating: null,
      ratingCount: 0,
      featured: false,
      featuredOrder: null,
      publishedAt: null,
      offlineAt: null,
      offlineReason: null,
      createdAt,
      updatedAt: createdAt,
      versions: [],
      events: [{
        id: randomUUID(),
        type: "created",
        actorUserId,
        toolVersionId: null,
        reason: "",
        metadata: { origin: "maintainer-upload" },
        createdAt,
      }],
    };
    this.tools.set(tool.id, tool);
    return structuredClone(tool);
  }

  async updateAsset(
    actorUserId: string,
    toolId: string,
    input: UpdateToolAssetRequest,
  ) {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    const latest = tool.versions.find((version) => version.id === tool.latestVersionId);
    if (
      input.featured
      && (
        tool.status !== "published"
        || !latest
        || latest.verification === "unverified"
      )
    ) {
      throw new ToolAssetInvariantError(
        "FEATURED_INELIGIBLE",
        "只有已上架且至少部分验证的工具可以进入首批推荐",
      );
    }
    const placementChanged = tool.featured !== input.featured
      || tool.featuredOrder !== (input.featured ? input.featuredOrder : null);
    Object.assign(tool, {
      ...input,
      featuredOrder: input.featured ? input.featuredOrder : null,
      updatedAt: now(),
    });
    tool.events.unshift({
      id: randomUUID(),
      type: "metadata-updated",
      actorUserId,
      toolVersionId: null,
      reason: "",
      metadata: {},
      createdAt: tool.updatedAt,
    });
    if (placementChanged) {
      tool.events.unshift({
        id: randomUUID(),
        type: "placement-updated",
        actorUserId,
        toolVersionId: null,
        reason: input.featured ? "加入首批推荐" : "移出首批推荐",
        metadata: {
          featured: input.featured,
          featuredOrder: input.featured ? input.featuredOrder : null,
        },
        createdAt: tool.updatedAt,
      });
    }
    return structuredClone(tool);
  }

  async addVersion(
    actorUserId: string,
    toolId: string,
    input: CreateToolAssetVersionRequest,
  ) {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    if (tool.versions.some((version) => version.version === input.version)) {
      throw new ToolAssetInvariantError("VERSION_EXISTS", "这个版本号已经存在");
    }
    const createdAt = now();
    const id = randomUUID();
    tool.versions.unshift({
      id,
      version: input.version,
      status: "draft",
      verification: input.verification,
      changeSummary: input.changeSummary,
      standardVersion: input.standardVersion,
      risks: input.risks,
      artifactStorageKey: input.artifactStorageKey,
      artifactSizeBytes: input.artifactSizeBytes,
      artifactSha256: input.artifactSha256.toLowerCase(),
      downloadUrl: input.downloadUrl,
      source: "maintainer-upload",
      sourceReturnVersionId: null,
      releasedAt: null,
      offlineAt: null,
      offlineReason: null,
      createdAt,
    });
    tool.versionCount = tool.versions.length;
    tool.updatedAt = createdAt;
    tool.events.unshift({
      id: randomUUID(),
      type: "version-created",
      actorUserId,
      toolVersionId: id,
      reason: "",
      metadata: {},
      createdAt,
    });
    return structuredClone(tool);
  }

  async publishVersion(actorUserId: string, toolId: string, versionId: string) {
    const tool = this.tools.get(toolId);
    const version = tool?.versions.find((item) => item.id === versionId);
    if (!tool || !version) return null;
    if (version.status !== "draft" && version.status !== "offline") {
      throw new ToolAssetInvariantError(
        "VERSION_NOT_DRAFT",
        "只有草稿或已下架版本可以发布",
      );
    }
    const at = now();
    version.status = "published";
    version.releasedAt ??= at;
    version.offlineAt = null;
    version.offlineReason = null;
    tool.status = "published";
    tool.offlineAt = null;
    tool.offlineReason = null;
    tool.latestVersionId = version.id;
    tool.latestVersion = version.version;
    tool.publishedAt ??= at;
    tool.updatedAt = at;
    tool.events.unshift({
      id: randomUUID(),
      type: "version-published",
      actorUserId,
      toolVersionId: versionId,
      reason: "",
      metadata: {},
      createdAt: at,
    });
    return structuredClone(tool);
  }

  async publishAsset(actorUserId: string, toolId: string) {
    const tool = this.tools.get(toolId);
    const latest = tool?.versions.find(
      (version) => version.id === tool.latestVersionId,
    );
    if (!tool || !latest || latest.status !== "published") return null;
    const at = now();
    tool.status = "published";
    tool.offlineAt = null;
    tool.offlineReason = null;
    tool.updatedAt = at;
    tool.events.unshift({
      id: randomUUID(),
      type: "tool-published",
      actorUserId,
      toolVersionId: latest.id,
      reason: "工具重新上架",
      metadata: {},
      createdAt: at,
    });
    return structuredClone(tool);
  }

  async offlineVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
    reason: string,
  ) {
    const tool = this.tools.get(toolId);
    const version = tool?.versions.find((item) => item.id === versionId);
    if (!tool || !version) return null;
    if (version.status !== "published") {
      throw new ToolAssetInvariantError(
        "VERSION_NOT_PUBLISHED",
        "只有已发布版本可以下架",
      );
    }
    const at = now();
    version.status = "offline";
    version.offlineAt = at;
    version.offlineReason = reason;
    if (tool.latestVersionId === versionId) {
      const fallback = tool.versions.find((item) => item.status === "published");
      tool.latestVersionId = fallback?.id ?? null;
      tool.latestVersion = fallback?.version ?? null;
      tool.status = fallback ? "published" : "offline";
      tool.featured = false;
      tool.featuredOrder = null;
      tool.offlineAt = fallback ? null : at;
      tool.offlineReason = fallback ? null : reason;
    }
    tool.updatedAt = at;
    tool.events.unshift({
      id: randomUUID(),
      type: "version-offline",
      actorUserId,
      toolVersionId: versionId,
      reason,
      metadata: {},
      createdAt: at,
    });
    return structuredClone(tool);
  }

  async offlineAsset(actorUserId: string, toolId: string, reason: string) {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    const at = now();
    tool.status = "offline";
    tool.featured = false;
    tool.featuredOrder = null;
    tool.offlineAt = at;
    tool.offlineReason = reason;
    tool.updatedAt = at;
    tool.events.unshift({
      id: randomUUID(),
      type: "tool-offline",
      actorUserId,
      toolVersionId: null,
      reason,
      metadata: {},
      createdAt: at,
    });
    return structuredClone(tool);
  }

  async close() {}

  private summary(tool: AdminToolAssetDetail) {
    const { versions: _, events: __, ...summary } = tool;
    return structuredClone(summary);
  }
}
