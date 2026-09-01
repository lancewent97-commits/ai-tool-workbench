import { packageGenerationResponseSchema } from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import type { AccountService } from "../services/account-service.js";
import type { PackageGenerationService } from "../services/package-generation-service.js";

const draftParamsSchema = z.object({
  draftId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/),
});

const versionParamsSchema = z.object({
  packageVersionId: z.uuid(),
});

export function registerPackageGenerationRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  service: PackageGenerationService,
) {
  app.post("/v1/package-drafts/:draftId/generate", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { draftId } = draftParamsSchema.parse(request.params);
    return packageGenerationResponseSchema.parse({
      packageVersion: await service.generate(user.id, draftId),
    });
  });

  app.get("/v1/package-versions/:packageVersionId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { packageVersionId } = versionParamsSchema.parse(request.params);
    const record = await service.getVersion(user.id, packageVersionId);
    if (!record) throw new AppError(404, "NOT_FOUND", "没有找到这个工具包版本");
    return packageGenerationResponseSchema.parse({ packageVersion: record });
  });
}
