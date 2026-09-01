import {
  derivedToolsResponseSchema,
  toolCatalogDetailResponseSchema,
  toolCatalogListResponseSchema,
  toolTaxonomyResponseSchema,
  toolVersionsResponseSchema,
} from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";

export function listCatalogTools(input?: {
  q?: string;
  module?: string;
  category?: string;
  tags?: string[];
  ids?: string[];
  parent?: string;
  featured?: boolean;
  verification?: "verified" | "partly-verified" | "unverified";
  sort?: "newest" | "popular" | "rating" | "name";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (input?.q) query.set("q", input.q);
  if (input?.module) query.set("module", input.module);
  if (input?.category) query.set("category", input.category);
  for (const tag of input?.tags ?? []) query.append("tags", tag);
  for (const id of input?.ids ?? []) query.append("ids", id);
  if (input?.parent) query.set("parent", input.parent);
  if (input?.featured !== undefined) query.set("featured", String(input.featured));
  if (input?.verification) query.set("verification", input.verification);
  query.set("sort", input?.sort ?? "newest");
  query.set("page", String(input?.page ?? 1));
  query.set("pageSize", String(input?.pageSize ?? 100));
  return apiRequest(`/v1/tools?${query}`, toolCatalogListResponseSchema);
}

export async function listAllCatalogTools(input?: Omit<Parameters<typeof listCatalogTools>[0], "page" | "pageSize">) {
  const pageSize = 100;
  const first = await listCatalogTools({ ...input, page: 1, pageSize });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await listCatalogTools({ ...input, page, pageSize });
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return { ...first, items, page: 1, pageSize: items.length };
}

export function getCatalogTool(slug: string) {
  return apiRequest(
    `/v1/tools/${encodeURIComponent(slug)}`,
    toolCatalogDetailResponseSchema,
  );
}

export function listCatalogToolVersions(slug: string) {
  return apiRequest(
    `/v1/tools/${encodeURIComponent(slug)}/versions`,
    toolVersionsResponseSchema,
  );
}

export function listCatalogDerivedTools(slug: string) {
  return apiRequest(
    `/v1/tools/${encodeURIComponent(slug)}/derived`,
    derivedToolsResponseSchema,
  );
}

export function getCatalogTaxonomy() {
  return apiRequest("/v1/tool-taxonomy", toolTaxonomyResponseSchema);
}
