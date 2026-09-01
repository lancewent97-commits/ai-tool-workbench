import { platformAiPolicy, PromptRegistry } from "@ai-tool-workbench/ai";
import {
  adminAiStatusSchema,
  adminAuditListResponseSchema,
  adminUserListResponseSchema,
} from "@ai-tool-workbench/contracts";
import type { IdentityRepository } from "@ai-tool-workbench/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AccountService } from "../services/account-service.js";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export function registerAdminPlatformRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  identity: IdentityRepository,
  runtime: {
    provider: "mock" | "external-dev" | "internal";
    model: string;
    externalDataMode: "disabled" | "sanitized-test";
    keyConfigured: boolean;
  },
) {
  app.get("/v1/admin/users", async (request) => {
    await accounts.authorize(request.sessionToken, ["admin"]);
    const items = await identity.listUsers();
    return adminUserListResponseSchema.parse({ items, total: items.length });
  });

  app.get("/v1/admin/audit-events", async (request) => {
    await accounts.authorize(request.sessionToken, ["admin"]);
    const { limit } = auditQuerySchema.parse(request.query);
    const items = await identity.listAuditEvents(limit);
    return adminAuditListResponseSchema.parse({ items, total: items.length });
  });

  app.get("/v1/admin/ai/status", async (request) => {
    await accounts.authorize(
      request.sessionToken,
      ["maintainer", "admin"],
    );
    const prompts = await Promise.all(
      ([
        "requirement-understanding",
        "recommendation",
        "context-compression",
      ] as const).map(async (key) => {
        const prompt = await new PromptRegistry().get(key);
        return {
          key,
          version: prompt.version,
          outputContract: prompt.outputContract,
          status: "active" as const,
        };
      }),
    );
    return adminAiStatusSchema.parse({
      ...runtime,
      prompts,
      constraints: {
        maxClarificationRounds: platformAiPolicy.maxClarificationRounds,
        maxQuestionsPerRound: platformAiPolicy.maxQuestionsPerTurn,
        contextCompression: true,
        recommendationGuard: true,
      },
    });
  });
}
