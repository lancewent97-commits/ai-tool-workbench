import {
  AiBriefNotReadyError,
  AiConversationNotFoundError,
  AiProviderOutputError,
  AiRecommendationRejectedError,
  DeepSeekProviderError,
  ExternalModelDataPolicyError,
  type AiOrchestrator,
} from "@ai-tool-workbench/ai";
import {
  aiConversationResponseSchema,
  aiConversationStateResponseSchema,
  continueAiConversationRequestSchema,
  createAiConversationRequestSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import type { AccountService } from "../services/account-service.js";

const conversationParamsSchema = z.object({
  conversationId: z.uuid(),
});

async function translateDomainError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AiConversationNotFoundError) {
      throw new AppError(404, "NOT_FOUND", "没有找到这个AI任务");
    }
    if (error instanceof AiBriefNotReadyError) {
      throw new AppError(409, "CONFLICT", error.message);
    }
    if (error instanceof ExternalModelDataPolicyError) {
      throw new AppError(400, "BAD_REQUEST", error.message);
    }
    if (
      error instanceof DeepSeekProviderError
      || error instanceof AiProviderOutputError
      || error instanceof AiRecommendationRejectedError
    ) {
      throw new AppError(
        503,
        "AI_UNAVAILABLE",
        `${error.message}。你可以直接重试，已保存的任务内容不会丢失。`,
      );
    }
    throw error;
  }
}

export function registerAiRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  orchestrator: AiOrchestrator,
) {
  app.post("/v1/ai/conversations", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const body = createAiConversationRequestSchema.parse(request.body);
    return aiConversationResponseSchema.parse(await translateDomainError(() =>
      orchestrator.start(user.id, body.message, body.selectedToolVersionIds)));
  });

  app.post("/v1/ai/conversations/:conversationId/messages", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    const body = continueAiConversationRequestSchema.parse(request.body);
    return aiConversationResponseSchema.parse(await translateDomainError(() =>
      orchestrator.continue(user.id, conversationId, body.message)));
  });

  app.post("/v1/ai/conversations/:conversationId/confirm", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    return aiConversationResponseSchema.parse(await translateDomainError(() =>
      orchestrator.confirm(user.id, conversationId)));
  });

  app.post("/v1/ai/conversations/:conversationId/retry", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    return aiConversationResponseSchema.parse(await translateDomainError(() =>
      orchestrator.retry(user.id, conversationId)));
  });

  app.get("/v1/ai/conversations/:conversationId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { conversationId } = conversationParamsSchema.parse(request.params);
    return aiConversationStateResponseSchema.parse(await translateDomainError(() =>
      orchestrator.getState(user.id, conversationId)));
  });
}
