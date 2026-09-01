import { z } from "zod";

export const aiConversationPhaseSchema = z.enum([
  "clarifying",
  "brief-review",
  "recommended",
]);

export const aiMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  why: z.string(),
  options: z.array(z.string()).max(4),
});

export const createAiConversationRequestSchema = z.object({
  message: z.string().trim().min(2).max(4_000),
  selectedToolVersionIds: z.array(z.uuid()).max(20).default([]),
});

export const continueAiConversationRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
});

export type AiConversationPhase = z.infer<typeof aiConversationPhaseSchema>;
export type AiMessage = z.infer<typeof aiMessageSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
