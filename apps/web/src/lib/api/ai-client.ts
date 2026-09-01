import {
  aiConversationResponseSchema,
  aiConversationStateResponseSchema,
} from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";

export function createAiConversation(
  message: string,
  selectedToolVersionIds: string[] = [],
) {
  return apiRequest("/v1/ai/conversations", aiConversationResponseSchema, {
    method: "POST",
    body: JSON.stringify({ message, selectedToolVersionIds }),
  });
}

export function continueAiConversation(conversationId: string, message: string) {
  return apiRequest(
    `/v1/ai/conversations/${conversationId}/messages`,
    aiConversationResponseSchema,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}

export function confirmAiBrief(conversationId: string) {
  return apiRequest(
    `/v1/ai/conversations/${conversationId}/confirm`,
    aiConversationResponseSchema,
    { method: "POST" },
  );
}

export function retryAiConversation(conversationId: string) {
  return apiRequest(
    `/v1/ai/conversations/${conversationId}/retry`,
    aiConversationResponseSchema,
    { method: "POST" },
  );
}

export function getAiConversation(conversationId: string) {
  return apiRequest(
    `/v1/ai/conversations/${conversationId}`,
    aiConversationStateResponseSchema,
  );
}
