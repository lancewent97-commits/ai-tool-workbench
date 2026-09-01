import { z } from "zod";
import { aiConversationPhaseSchema, aiMessageSchema, clarificationQuestionSchema } from "./conversation.js";
import { recommendationResultSchema } from "./recommendation.js";
import { requirementBriefSchema } from "./requirement-brief.js";

export const contextSnapshotSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  briefVersion: z.number().int().positive(),
  summary: z.string(),
  confirmedFacts: z.array(z.string()),
  rejectedOptions: z.array(z.string()),
  selectedToolVersionIds: z.array(z.uuid()),
  lastMessageId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const aiConversationResponseSchema = z.object({
  conversationId: z.uuid(),
  phase: aiConversationPhaseSchema,
  assistantMessage: aiMessageSchema,
  brief: requirementBriefSchema,
  questions: z.array(clarificationQuestionSchema).max(3),
  recommendation: recommendationResultSchema.nullable(),
  contextVersion: z.number().int().nonnegative(),
});

export const aiConversationStateResponseSchema = z.object({
  conversationId: z.uuid(),
  phase: aiConversationPhaseSchema,
  messages: z.array(aiMessageSchema),
  brief: requirementBriefSchema,
  questions: z.array(clarificationQuestionSchema).max(3),
  recommendation: recommendationResultSchema.nullable(),
  contextVersion: z.number().int().nonnegative(),
});

export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>;
export type AiConversationResponse = z.infer<typeof aiConversationResponseSchema>;
export type AiConversationStateResponse = z.infer<typeof aiConversationStateResponseSchema>;
