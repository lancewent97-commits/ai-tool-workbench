import type {
  ToolCatalogItem,
  ToolCatalogQuery,
  ToolTaxonomy,
  ToolReview,
  ToolVersionSummary,
} from "@ai-tool-workbench/contracts";

export interface ToolCatalogRepository {
  healthCheck(): Promise<void>;
  listTools(query: ToolCatalogQuery): Promise<{
    items: ToolCatalogItem[];
    total: number;
  }>;
  findToolBySlug(slug: string): Promise<ToolCatalogItem | null>;
  findToolsByVersionIds(versionIds: string[]): Promise<Array<{
    tool: ToolCatalogItem;
    version: ToolVersionSummary;
  }>>;
  listVersions(slug: string): Promise<ToolVersionSummary[] | null>;
  listDerivedTools(slug: string): Promise<ToolCatalogItem[] | null>;
  listReviews(slug: string, limit?: number): Promise<ToolReview[] | null>;
  listTaxonomy(): Promise<ToolTaxonomy>;
  close(): Promise<void>;
}
