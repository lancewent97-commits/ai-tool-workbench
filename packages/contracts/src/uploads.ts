import { z } from "zod";

export const uploadPurposeSchema = z.enum(["tool", "return"]);
export const uploadStatusSchema = z.enum(["uploading", "completed", "aborted", "expired"]);
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024;

export const createUploadSessionRequestSchema = z.object({
  purpose: uploadPurposeSchema,
  fileName: z.string().trim().min(1).max(255),
  expectedBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const uploadSessionParamsSchema = z.object({
  uploadId: z.string().uuid(),
});

export const uploadPartParamsSchema = uploadSessionParamsSchema.extend({
  partNumber: z.coerce.number().int().min(1).max(10_000),
});

export const uploadPartSchema = z.object({
  partNumber: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const uploadSessionSchema = z.object({
  id: z.string().uuid(),
  purpose: uploadPurposeSchema,
  fileName: z.string(),
  expectedBytes: z.number().int().positive(),
  chunkSizeBytes: z.number().int().positive(),
  status: uploadStatusSchema,
  uploadedParts: z.array(uploadPartSchema),
  uploadedBytes: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  artifactStorageKey: z.string().nullable(),
  artifactSha256: z.string().nullable(),
});

export const precheckJobKindSchema = z.enum(["tool", "return"]);
export const precheckJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const precheckJobParamsSchema = z.object({
  jobId: z.string().uuid(),
});

export const precheckJobSchema = z.object({
  id: z.string().uuid(),
  uploadId: z.string().uuid(),
  kind: precheckJobKindSchema,
  status: precheckJobStatusSchema,
  result: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
export type CreateUploadSessionRequest = z.infer<typeof createUploadSessionRequestSchema>;
export type UploadPart = z.infer<typeof uploadPartSchema>;
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type PrecheckJob = z.infer<typeof precheckJobSchema>;
export type PrecheckJobKind = z.infer<typeof precheckJobKindSchema>;
export type PrecheckJobStatus = z.infer<typeof precheckJobStatusSchema>;
