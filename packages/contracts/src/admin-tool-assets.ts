import { z } from "zod";
import {
  catalogStatusSchema,
  toolKindSchema,
  verificationStateSchema,
} from "./tool-catalog.js";
import { returnFindingSchema } from "./returns.js";

export const toolAssetOriginSchema = z.enum([
  "maintainer-upload",
  "return-composite",
  "return-derived",
  "return-new",
  "seed",
]);

export const toolAssetEventTypeSchema = z.enum([
  "created",
  "metadata-updated",
  "version-created",
  "version-published",
  "version-offline",
  "tool-published",
  "tool-offline",
  "placement-updated",
]);

const slugSchema = z.string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "标识只能包含小写字母、数字和连字符");

const slugListSchema = z.array(slugSchema).max(30)
  .transform((items) => [...new Set(items)]);

export const toolAssetLineageInputSchema = z.object({
  parentToolId: z.uuid(),
  parentVersionId: z.uuid(),
  difference: z.string().trim().min(2).max(1000),
});

export const createToolAssetRequestSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  problem: z.string().trim().min(2).max(2000),
  result: z.string().trim().min(2).max(2000),
  principle: z.string().trim().min(2).max(4000),
  kind: toolKindSchema,
  categorySlug: slugSchema.nullable().default(null),
  moduleSlugs: slugListSchema.pipe(z.array(z.string()).min(1)),
  tagSlugs: slugListSchema.default([]),
  lineage: toolAssetLineageInputSchema.nullable().default(null),
});

export const updateToolAssetRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  problem: z.string().trim().min(2).max(2000),
  result: z.string().trim().min(2).max(2000),
  principle: z.string().trim().min(2).max(4000),
  kind: toolKindSchema,
  categorySlug: slugSchema.nullable(),
  moduleSlugs: slugListSchema.pipe(z.array(z.string()).min(1)),
  tagSlugs: slugListSchema,
  featured: z.boolean().default(false),
  featuredOrder: z.number().int().positive().nullable().default(null),
});

export const createToolAssetVersionRequestSchema = z.object({
  version: z.string().trim().min(1).max(80),
  verification: verificationStateSchema.default("unverified"),
  changeSummary: z.string().trim().min(2).max(2000),
  standardVersion: z.string().trim().min(1).max(80),
  risks: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  artifactStorageKey: z.string().trim().min(1).max(2000),
  artifactSizeBytes: z.number().int().nonnegative(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i, "文件校验值必须是 SHA-256"),
  downloadUrl: z.string().trim().min(1).max(2000),
});

export const offlineToolAssetRequestSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
});

export const adminToolUploadResponseSchema = z.object({
  accepted: z.boolean(),
  fileName: z.string(),
  artifactStorageKey: z.string().nullable(),
  artifactSizeBytes: z.number().int().nonnegative(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  downloadUrl: z.string().nullable(),
  findings: z.array(returnFindingSchema),
  fixPrompt: z.string().nullable(),
});

export type AdminToolUploadResponse = z.infer<
  typeof adminToolUploadResponseSchema
>;

export const toolAssetAdminQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: catalogStatusSchema.optional(),
  origin: toolAssetOriginSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const adminToolAssetVersionSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  status: catalogStatusSchema,
  verification: verificationStateSchema,
  changeSummary: z.string(),
  standardVersion: z.string(),
  risks: z.array(z.string()),
  artifactStorageKey: z.string().nullable(),
  artifactSizeBytes: z.number().int().nonnegative().nullable(),
  artifactSha256: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  source: z.enum(["maintainer-upload", "return"]),
  sourceReturnVersionId: z.uuid().nullable(),
  releasedAt: z.iso.datetime().nullable(),
  offlineAt: z.iso.datetime().nullable(),
  offlineReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const adminToolAssetParentSchema = z.object({
  toolId: z.uuid(),
  toolSlug: z.string(),
  toolName: z.string(),
  versionId: z.uuid(),
  version: z.string(),
  difference: z.string(),
});

export const adminToolAssetSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  problem: z.string(),
  result: z.string(),
  principle: z.string(),
  kind: toolKindSchema,
  status: catalogStatusSchema,
  origin: toolAssetOriginSchema,
  sourceReturnId: z.uuid().nullable(),
  sourceCandidateId: z.string().nullable(),
  latestVersionId: z.uuid().nullable(),
  latestVersion: z.string().nullable(),
  categorySlug: z.string().nullable(),
  moduleSlugs: z.array(z.string()),
  tagSlugs: z.array(z.string()),
  featured: z.boolean(),
  featuredOrder: z.number().int().positive().nullable(),
  parent: adminToolAssetParentSchema.nullable(),
  versionCount: z.number().int().nonnegative(),
  derivedCount: z.number().int().nonnegative(),
  downloads: z.number().int().nonnegative(),
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().nonnegative(),
  publishedAt: z.iso.datetime().nullable(),
  offlineAt: z.iso.datetime().nullable(),
  offlineReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const toolAssetEventSchema = z.object({
  id: z.uuid(),
  type: toolAssetEventTypeSchema,
  actorUserId: z.uuid().nullable(),
  toolVersionId: z.uuid().nullable(),
  reason: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const adminToolAssetDetailSchema = adminToolAssetSummarySchema.extend({
  versions: z.array(adminToolAssetVersionSchema),
  events: z.array(toolAssetEventSchema),
});

export const adminToolAssetListResponseSchema = z.object({
  items: z.array(adminToolAssetSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const adminToolAssetDetailResponseSchema = z.object({
  tool: adminToolAssetDetailSchema,
});

export type ToolAssetOrigin = z.infer<typeof toolAssetOriginSchema>;
export type ToolAssetEventType = z.infer<typeof toolAssetEventTypeSchema>;
export type CreateToolAssetRequest = z.infer<typeof createToolAssetRequestSchema>;
export type UpdateToolAssetRequest = z.infer<typeof updateToolAssetRequestSchema>;
export type CreateToolAssetVersionRequest = z.infer<
  typeof createToolAssetVersionRequestSchema
>;
export type ToolAssetAdminQuery = z.infer<typeof toolAssetAdminQuerySchema>;
export type AdminToolAssetSummary = z.infer<typeof adminToolAssetSummarySchema>;
export type AdminToolAssetDetail = z.infer<typeof adminToolAssetDetailSchema>;
export type AdminToolAssetVersion = z.infer<typeof adminToolAssetVersionSchema>;
