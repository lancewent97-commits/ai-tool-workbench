import { readinessResponseSchema } from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";

export function checkPlatformReadiness() {
  return apiRequest("/ready", readinessResponseSchema);
}
