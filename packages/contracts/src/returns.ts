import { z } from "zod";
import { toolKindSchema, verificationStateSchema } from "./tool-catalog.js";

export const returnStateSchema = z.enum([
  "precheck-failed",
  "precheck-passed",
  "reviewing",
  "review-rejected",
  "published",
  "offline",
]);

export const returnFindingSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["required", "risk", "suggestion"]),
  title: z.string().min(1),
  completion: z.string().min(1),
  path: z.string().nullable(),
  code: z.string().min(1),
});

export const returnAssetCandidateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["composite", "derived", "new"]),
  name: z.string().min(1),
  problem: z.string().min(1),
  result: z.string().min(1),
  principle: z.string().min(1),
  kind: toolKindSchema,
  version: z.string().min(1),
  verification: verificationStateSchema,
  standardVersion: z.string().min(1),
  risks: z.array(z.string()),
  reason: z.string().min(1),
  artifactPath: z.string().nullable(),
  sourceToolId: z.uuid().nullable(),
  sourceVersionId: z.uuid().nullable(),
  difference: z.string().nullable(),
  moduleSlugs: z.array(z.string().min(1)),
  categorySlug: z.string().min(1).nullable(),
  tagSlugs: z.array(z.string().min(1)),
});

export const returnEventSchema = z.object({
  id: z.string().min(1),
  at: z.iso.datetime(),
  type: z.enum(["uploaded", "precheck", "review", "published"]),
  title: z.string().min(1),
  detail: z.string(),
});

export const returnVersionSchema = z.object({
  id: z.uuid(),
  version: z.string().regex(/^v[1-9]\d*$/),
  fileName: z.string().min(1),
  archiveBytes: z.number().int().nonnegative(),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  retained: z.boolean(),
  precheckStatus: z.enum(["failed", "passed"]),
  findings: z.array(returnFindingSchema),
  assetCandidates: z.array(returnAssetCandidateSchema),
  fixPrompt: z.string(),
  uploadedAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
});

export const returnAssetSchema = z.object({
  type: z.enum(["composite", "derived", "new"]),
  toolId: z.uuid(),
  slug: z.string().min(1).nullable().optional(),
  name: z.string(),
  reason: z.string(),
});

export const returnRecordSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  sourceDownloadId: z.uuid(),
  sourceObjectName: z.string().min(1),
  sourcePackageVersion: z.string().nullable(),
  sourceToolVersion: z.string().nullable(),
  version: z.string().regex(/^v[1-9]\d*$/),
  state: returnStateSchema,
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  findings: z.array(returnFindingSchema),
  fixPrompt: z.string(),
  events: z.array(returnEventSchema),
  versions: z.array(returnVersionSchema),
  assets: z.array(returnAssetSchema),
  adoptedCount: z.number().int().nonnegative(),
  listed: z.boolean(),
  reviewReason: z.string().nullable(),
});

export const returnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const returnListResponseSchema = z.object({
  items: z.array(returnRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const returnReviewRecordSchema = z.object({
  submission: returnRecordSchema,
  uploader: z.object({
    id: z.uuid(),
    displayName: z.string().min(1),
    account: z.string().min(1),
  }),
});

export const returnReviewListResponseSchema = z.object({
  items: z.array(returnReviewRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const returnReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2_000).default(""),
}).superRefine((value, context) => {
  if (value.decision === "rejected" && value.reason.length < 2) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "不通过时必须说明原因",
    });
  }
});

export const returnPrecheckQuerySchema = z.object({
  sourceDownloadId: z.uuid(),
  returnId: z.uuid().optional(),
});

export const returnParamsSchema = z.object({
  returnId: z.uuid(),
});

export const returnListingRequestSchema = z.object({
  listed: z.boolean(),
});

export const returnVersionParamsSchema = returnParamsSchema.extend({
  versionId: z.uuid(),
});

export type ReturnFinding = z.infer<typeof returnFindingSchema>;
export type ReturnAssetCandidate = z.infer<typeof returnAssetCandidateSchema>;
export type ReturnVersionRecord = z.infer<typeof returnVersionSchema>;
export type ReturnRecord = z.infer<typeof returnRecordSchema>;
export type ReturnReviewRecord = z.infer<typeof returnReviewRecordSchema>;
export type ReturnReviewDecision = z.infer<typeof returnReviewDecisionSchema>;
export type ReturnListingRequest = z.infer<typeof returnListingRequestSchema>;
