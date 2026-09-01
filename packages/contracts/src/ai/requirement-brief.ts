import { z } from "zod";

export const requirementBriefSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "confirmed"]),
  goal: z.string(),
  input: z.string(),
  deliverables: z.array(z.string()),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  confirmedFacts: z.array(z.string()),
  rejectedOptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  selectedToolVersionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});

export type RequirementBrief = z.infer<typeof requirementBriefSchema>;
