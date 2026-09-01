import type {
  ToolCatalogItem,
  ToolCatalogQuery,
  ToolTaxonomy,
  ToolVersionSummary,
} from "@ai-tool-workbench/contracts";
import type { ToolCatalogRepository } from "@ai-tool-workbench/db";

const moduleItem = {
  id: "00000000-0000-4000-8000-000000000010",
  slug: "content-production",
  name: "内容生产",
  sortOrder: 10,
};

const categoryItem = {
  id: "00000000-0000-4000-8000-000000000020",
  slug: "pdf-processing",
  name: "PDF处理",
  sortOrder: 10,
};

const tagItems = [
  {
    id: "00000000-0000-4000-8000-000000000030",
    slug: "ocr",
    name: "OCR",
    sortOrder: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000031",
    slug: "derived",
    name: "衍生工具",
    sortOrder: 20,
  },
];

const mainVersion: ToolVersionSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  version: "v2.3",
  status: "published",
  verification: "verified",
  releasedAt: "2026-07-18T01:00:00.000Z",
  downloadUrl: "/demo-assets/pdf-content-extractor.zip",
  risks: [],
  changeSummary: "当前稳定版本",
  standardVersion: "1",
  artifactSizeBytes: null,
};

const mainTool: ToolCatalogItem = {
  id: "00000000-0000-4000-8000-000000000100",
  slug: "pdf-content-extractor",
  name: "PDF内容提取工具",
  problem: "从教材和文档中提取结构化文字与表格",
  result: "Markdown、Excel 和 JSON",
  principle: "本地解析与 OCR。",
  kind: "executable",
  status: "published",
  modules: [{ ...moduleItem, isPrimary: true }],
  category: categoryItem,
  tags: [tagItems[0]!],
  departments: ["教学研发"],
  roles: ["教研老师"],
  downloads: 1248,
  rating: 4.8,
  ratingCount: 20,
  latestVersion: mainVersion,
  parent: null,
  derivedCount: 1,
  featured: true,
  featuredOrder: 10,
  publishedAt: "2026-07-18T01:00:00.000Z",
  updatedAt: "2026-07-18T01:00:00.000Z",
};

const derivedTool: ToolCatalogItem = {
  ...mainTool,
  id: "00000000-0000-4000-8000-000000000200",
  slug: "pdf-scan-precision",
  name: "扫描件精准提取版",
  problem: "提升扫描教材识别准确率",
  downloads: 386,
  tags: [tagItems[0]!, tagItems[1]!],
  latestVersion: {
    ...mainVersion,
    id: "00000000-0000-4000-8000-000000000201",
    version: "v1.2",
  },
  parent: {
    toolId: mainTool.id,
    toolSlug: mainTool.slug,
    toolName: mainTool.name,
    versionId: mainVersion.id,
    version: mainVersion.version,
    difference: "增加扫描件增强和置信度检查",
  },
  derivedCount: 0,
  featured: false,
  featuredOrder: null,
};

export class MemoryToolCatalogRepository implements ToolCatalogRepository {
  private readonly tools = [mainTool, derivedTool];

  async healthCheck() {}

  async listTools(query: ToolCatalogQuery) {
    const filtered = this.tools.filter((tool) => {
      if (query.ids.length && !query.ids.includes(tool.id)) return false;
      const q = query.q?.toLowerCase();
      if (q && !`${tool.name} ${tool.problem}`.toLowerCase().includes(q)) return false;
      if (query.module && !tool.modules.some((item) => item.slug === query.module)) return false;
      if (query.category && tool.category?.slug !== query.category) return false;
      if (query.parent && tool.parent?.toolSlug !== query.parent) return false;
      if (query.featured !== undefined && tool.featured !== query.featured) return false;
      if (query.verification && tool.latestVersion.verification !== query.verification) return false;
      return query.tags.every((tag) => tool.tags.some((item) => item.slug === tag));
    });
    const sorted = [...filtered].sort((left, right) => {
      if (query.sort === "popular") return right.downloads - left.downloads;
      if (query.sort === "rating") return (right.rating ?? 0) - (left.rating ?? 0);
      if (query.sort === "name") return left.name.localeCompare(right.name, "zh-CN");
      return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: sorted.slice(start, start + query.pageSize),
      total: sorted.length,
    };
  }

  async findToolBySlug(slug: string) {
    return this.tools.find((tool) => tool.slug === slug) ?? null;
  }

  async findToolsByVersionIds(versionIds: string[]) {
    return versionIds.flatMap((versionId) => {
      const tool = this.tools.find((item) => item.latestVersion.id === versionId);
      return tool ? [{ tool, version: tool.latestVersion }] : [];
    });
  }

  async listVersions(slug: string) {
    const tool = await this.findToolBySlug(slug);
    return tool ? [tool.latestVersion] : null;
  }

  async listDerivedTools(slug: string) {
    const tool = await this.findToolBySlug(slug);
    if (!tool) return null;
    return this.tools.filter((candidate) => candidate.parent?.toolId === tool.id);
  }

  async listReviews(slug: string) {
    const tool = await this.findToolBySlug(slug);
    return tool ? [] : null;
  }

  async listTaxonomy(): Promise<ToolTaxonomy> {
    return {
      modules: [moduleItem],
      categories: [categoryItem],
      tags: tagItems,
    };
  }

  async close() {}
}
