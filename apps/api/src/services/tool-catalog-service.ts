import {
  toolCatalogQuerySchema,
  type ToolCatalogQuery,
} from "@ai-tool-workbench/contracts";
import type { ToolCatalogRepository } from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";

export class ToolCatalogService {
  constructor(private readonly repository: ToolCatalogRepository) {}

  parseQuery(raw: Record<string, unknown>): ToolCatalogQuery {
    const values = Array.isArray(raw.tags)
      ? raw.tags
      : typeof raw.tags === "string"
        ? raw.tags.split(",")
        : [];
    const tags = values
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const rawIds = Array.isArray(raw.ids) ? raw.ids : typeof raw.ids === "string" ? raw.ids.split(",") : [];
    const ids = rawIds.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
    return toolCatalogQuerySchema.parse({ ...raw, tags, ids });
  }

  async list(query: ToolCatalogQuery) {
    const result = await this.repository.listTools(query);
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async detail(slug: string) {
    const [tool, reviews] = await Promise.all([
      this.repository.findToolBySlug(slug),
      this.repository.listReviews(slug),
    ]);
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具");
    return { tool, reviews: reviews ?? [] };
  }

  async versions(slug: string) {
    const items = await this.repository.listVersions(slug);
    if (!items) throw new AppError(404, "NOT_FOUND", "没有找到这个工具");
    return { items };
  }

  async derived(slug: string) {
    const items = await this.repository.listDerivedTools(slug);
    if (!items) throw new AppError(404, "NOT_FOUND", "没有找到这个工具");
    return { items };
  }

  taxonomy() {
    return this.repository.listTaxonomy();
  }
}
