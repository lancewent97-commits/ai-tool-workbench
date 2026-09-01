import { z } from "zod";
import { userProfileSchema } from "./auth.js";

export const adminUserListResponseSchema = z.object({
  items: z.array(userProfileSchema),
  total: z.number().int().nonnegative(),
});

export const adminAuditEventSchema = z.object({
  id: z.uuid(),
  actorDisplayName: z.string().nullable(),
  actorAccount: z.string().nullable(),
  action: z.string(),
  objectType: z.string(),
  objectId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const adminAuditListResponseSchema = z.object({
  items: z.array(adminAuditEventSchema),
  total: z.number().int().nonnegative(),
});

export const adminPromptStatusSchema = z.object({
  key: z.enum([
    "requirement-understanding",
    "recommendation",
    "context-compression",
  ]),
  version: z.string(),
  outputContract: z.string(),
  status: z.literal("active"),
});

export const adminAiStatusSchema = z.object({
  provider: z.enum(["mock", "external-dev", "internal"]),
  model: z.string(),
  externalDataMode: z.enum(["disabled", "sanitized-test"]),
  keyConfigured: z.boolean(),
  prompts: z.array(adminPromptStatusSchema),
  constraints: z.object({
    maxClarificationRounds: z.number().int().positive(),
    maxQuestionsPerRound: z.number().int().positive(),
    contextCompression: z.boolean(),
    recommendationGuard: z.boolean(),
  }),
});

export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;
export type AdminAiStatus = z.infer<typeof adminAiStatusSchema>;
