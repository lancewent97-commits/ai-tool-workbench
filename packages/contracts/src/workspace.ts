import { z } from "zod";

export const taskStageSchema = z.enum([
  "clarifying",
  "brief-review",
  "recommended",
  "package-review",
  "ready",
  "completed",
]);

export const taskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  input: z.string(),
  deliverables: z.array(z.string()),
  stage: taskStageSchema,
  updatedAt: z.iso.datetime(),
  needsUserAction: z.boolean(),
  packageVersionIds: z.array(z.string()),
  result: z.enum(["complete", "partial", "failed"]).optional(),
});

export const packageToolSelectionSchema = z.object({
  toolId: z.string().min(1),
  versionId: z.string().min(1),
  purpose: z.string(),
  replaceable: z.boolean(),
});

export const plannedComponentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),
  name: z.string().min(1),
  goal: z.string().min(1),
  acceptance: z.array(z.string()),
  prompt: z.string(),
});

export const packageDraftSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/),
  source: z.enum(["ai", "manual"]),
  taskId: z.string().optional(),
  name: z.string().min(1).max(200),
  goal: z.string().max(4_000).optional(),
  deliverables: z.array(z.string()).max(100),
  tools: z.array(packageToolSelectionSchema).max(50),
  plannedComponents: z.array(plannedComponentSchema).max(50),
  confirmedSections: z.array(z.string()).max(20),
  userConfirmedFields: z.array(z.string()).max(50),
}).superRefine((draft, context) => {
  if (draft.source === "ai" && !draft.taskId) {
    context.addIssue({
      code: "custom",
      path: ["taskId"],
      message: "AI工具包草稿必须关联任务",
    });
  } else if (draft.source === "ai" && !z.uuid().safeParse(draft.taskId).success) {
    context.addIssue({
      code: "custom",
      path: ["taskId"],
      message: "AI任务ID格式不正确",
    });
  }
});

export const packageDraftUpsertRequestSchema = z.object({
  draft: packageDraftSchema,
});

export const packageDraftRecordSchema = z.object({
  draft: packageDraftSchema,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

export const lockedPackageToolSchema = z.object({
  toolId: z.uuid(),
  toolSlug: z.string().min(1),
  toolName: z.string().min(1),
  toolKind: z.enum([
    "executable",
    "knowledge",
    "template",
    "application",
    "composite",
  ]),
  versionId: z.uuid(),
  version: z.string().min(1),
  purpose: z.string(),
  replaceable: z.boolean(),
  problem: z.string(),
  result: z.string(),
  verification: z.enum(["verified", "partly-verified", "unverified"]),
  standardVersion: z.string(),
  risks: z.array(z.string()),
});

export const packageVersionStatusSchema = z.enum([
  "generating",
  "ready",
  "failed",
]);

export const packageVersionRecordSchema = z.object({
  id: z.uuid(),
  draftId: z.string(),
  taskId: z.uuid().nullable(),
  source: z.enum(["ai", "manual"]),
  name: z.string(),
  goal: z.string().nullable(),
  deliverables: z.array(z.string()),
  lockedTools: z.array(lockedPackageToolSchema),
  plannedComponents: z.array(plannedComponentSchema),
  version: z.string(),
  status: packageVersionStatusSchema,
  startPrompt: z.string(),
  downloadUrl: z.string(),
  archiveBytes: z.number().int().nonnegative().nullable(),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
});

export const packageGenerationResponseSchema = z.object({
  packageVersion: packageVersionRecordSchema,
});

export const downloadKindSchema = z.enum([
  "tool",
  "ai-package",
  "manual-package",
  "historical",
  "derived",
]);

export const downloadCredentialSchema = z.object({
  id: z.uuid(),
  kind: downloadKindSchema,
  objectName: z.string(),
  downloadedAt: z.iso.datetime(),
  packageVersionId: z.uuid().nullable(),
  packageVersion: z.string().nullable(),
  toolVersionId: z.uuid().nullable(),
  toolVersion: z.string().nullable(),
  sourceTaskId: z.uuid().nullable(),
  lockedTools: z.array(packageToolSelectionSchema),
  lockedToolDetails: z.array(lockedPackageToolSchema),
  lockedToolStatuses: z.array(z.object({
    toolId: z.uuid(),
    toolSlug: z.string(),
    status: z.enum(["published", "offline", "missing"]),
    latestVersion: z.string().nullable(),
    derivedCount: z.number().int().nonnegative(),
  })),
  downloadUrl: z.string(),
  feedbackState: z.enum(["none", "submitted"]),
  feedbackResult: z.enum(["complete", "partial", "failed"]).nullable(),
  feedbackRating: z.number().int().min(1).max(5).nullable(),
  feedbackComment: z.string().nullable(),
  feedbackSubmittedAt: z.iso.datetime().nullable(),
});

export const downloadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const downloadListResponseSchema = z.object({
  items: z.array(downloadCredentialSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const downloadFeedbackRequestSchema = z.object({
  feedbackState: z.literal("submitted"),
  result: z.enum(["complete", "partial", "failed"]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(2000).default(""),
}).refine((input) => input.result !== undefined || input.rating !== undefined, {
  message: "任务结果或工具评分至少填写一项",
});

export type DownloadFeedbackRequest = z.infer<typeof downloadFeedbackRequestSchema>;

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const taskListResponseSchema = z.object({
  items: z.array(taskSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type PackageDraftRecord = z.infer<typeof packageDraftRecordSchema>;
export type LockedPackageTool = z.infer<typeof lockedPackageToolSchema>;
export type PackageVersionRecord = z.infer<typeof packageVersionRecordSchema>;
export type DownloadCredential = z.infer<typeof downloadCredentialSchema>;
