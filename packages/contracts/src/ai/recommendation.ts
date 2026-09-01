import { z } from "zod";

export const recommendedToolSchema = z.object({
  toolId: z.uuid(),
  toolSlug: z.string(),
  toolName: z.string(),
  toolVersionId: z.uuid(),
  version: z.string(),
  purpose: z.string(),
  source: z.enum(["ai", "user-selected"]),
});

export const capabilityGapSchema = z.object({
  name: z.string(),
  goal: z.string(),
  reason: z.string(),
  productionPrompt: z.string(),
});

export const recommendationCardSchema = z.object({
  id: z.string(),
  kind: z.enum(["primary", "alternative"]),
  title: z.string(),
  summary: z.string(),
  reason: z.string(),
  coverage: z.enum(["complete", "partial"]),
  tools: z.array(recommendedToolSchema),
  deliverables: z.array(z.string()),
  limitations: z.array(z.string()),
  gaps: z.array(capabilityGapSchema),
});

export const recommendationResultSchema = z.object({
  briefVersion: z.number().int().positive(),
  primary: recommendationCardSchema.nullable(),
  alternatives: z.array(recommendationCardSchema).max(3),
  generatedAt: z.iso.datetime(),
});

export type RecommendedTool = z.infer<typeof recommendedToolSchema>;
export type RecommendationCard = z.infer<typeof recommendationCardSchema>;
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;
