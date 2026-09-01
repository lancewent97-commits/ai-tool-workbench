import { z } from "zod";

export const toolKindSchema = z.enum([
  "executable",
  "knowledge",
  "template",
  "application",
  "composite",
]);

export const verificationStateSchema = z.enum([
  "verified",
  "partly-verified",
  "unverified",
]);

export const catalogStatusSchema = z.enum(["draft", "published", "offline"]);
export const toolCatalogSortSchema = z.enum(["newest", "popular", "rating", "name"]);

export const taxonomyItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const toolModulePlacementSchema = taxonomyItemSchema.extend({
  isPrimary: z.boolean(),
});

export const toolVersionSummarySchema = z.object({
  id: z.uuid(),
  version: z.string(),
  status: catalogStatusSchema,
  verification: verificationStateSchema,
  releasedAt: z.iso.datetime().nullable(),
  downloadUrl: z.string().nullable(),
  risks: z.array(z.string()),
  changeSummary: z.string(),
  standardVersion: z.string(),
  artifactSizeBytes: z.number().int().nonnegative().nullable(),
});

export const toolParentSchema = z.object({
  toolId: z.uuid(),
  toolSlug: z.string(),
  toolName: z.string(),
  versionId: z.uuid(),
  version: z.string(),
  difference: z.string(),
});

export const toolCatalogItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  problem: z.string(),
  result: z.string(),
  principle: z.string(),
  kind: toolKindSchema,
  status: catalogStatusSchema,
  modules: z.array(toolModulePlacementSchema),
  category: taxonomyItemSchema.nullable(),
  tags: z.array(taxonomyItemSchema),
  departments: z.array(z.string()),
  roles: z.array(z.string()),
  downloads: z.number().int().nonnegative(),
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().nonnegative(),
  latestVersion: toolVersionSummarySchema,
  parent: toolParentSchema.nullable(),
  derivedCount: z.number().int().nonnegative(),
  featured: z.boolean(),
  featuredOrder: z.number().int().positive().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const toolCatalogListResponseSchema = z.object({
  items: z.array(toolCatalogItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const toolReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  author: z.string(),
  createdAt: z.iso.datetime(),
});

export const toolCatalogDetailResponseSchema = z.object({
  tool: toolCatalogItemSchema,
  reviews: z.array(toolReviewSchema),
});

export const toolVersionsResponseSchema = z.object({
  items: z.array(toolVersionSummarySchema),
});

export const derivedToolsResponseSchema = z.object({
  items: z.array(toolCatalogItemSchema),
});

export const toolTaxonomyResponseSchema = z.object({
  modules: z.array(taxonomyItemSchema),
  categories: z.array(taxonomyItemSchema),
  tags: z.array(taxonomyItemSchema),
});

export const toolCatalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  module: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().max(80)).max(20).default([]),
  ids: z.array(z.uuid()).max(100).default([]),
  parent: z.string().trim().max(100).optional(),
  featured: z.coerce.boolean().optional(),
  verification: verificationStateSchema.optional(),
  sort: toolCatalogSortSchema.default("newest"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type ToolCatalogQuery = z.infer<typeof toolCatalogQuerySchema>;
export type ToolCatalogItem = z.infer<typeof toolCatalogItemSchema>;
export type ToolVersionSummary = z.infer<typeof toolVersionSummarySchema>;
export type ToolTaxonomy = z.infer<typeof toolTaxonomyResponseSchema>;
export type ToolReview = z.infer<typeof toolReviewSchema>;
export type CatalogStatus = z.infer<typeof catalogStatusSchema>;
