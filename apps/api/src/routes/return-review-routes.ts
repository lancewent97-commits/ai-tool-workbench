import {
  returnListQuerySchema,
  returnParamsSchema,
  returnRecordSchema,
  returnReviewDecisionSchema,
  returnReviewListResponseSchema,
  returnReviewRecordSchema,
  returnVersionParamsSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import type { AccountService } from "../services/account-service.js";
import type { ReturnReviewService } from "../services/return-review-service.js";

function disposition(fileName: string) {
  return `attachment; filename="return-package.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function registerReturnReviewRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  reviews: ReturnReviewService,
) {
  app.get("/v1/admin/returns", async (request) => {
    await accounts.authorize(request.sessionToken, ["maintainer", "admin"]);
    const query = returnListQuerySchema.parse(request.query);
    return returnReviewListResponseSchema.parse(await reviews.list(query));
  });

  app.get("/v1/admin/returns/:returnId", async (request) => {
    await accounts.authorize(request.sessionToken, ["maintainer", "admin"]);
    const { returnId } = returnParamsSchema.parse(request.params);
    return returnReviewRecordSchema.parse(await reviews.get(returnId));
  });

  app.post("/v1/admin/returns/:returnId/decision", async (request) => {
    const reviewer = await accounts.authorize(
      request.sessionToken,
      ["maintainer", "admin"],
    );
    const { returnId } = returnParamsSchema.parse(request.params);
    const decision = returnReviewDecisionSchema.parse(request.body);
    return returnRecordSchema.parse(
      await reviews.decide(reviewer.id, returnId, decision),
    );
  });

  app.get(
    "/v1/admin/returns/:returnId/versions/:versionId/file",
    async (request, reply) => {
      await accounts.authorize(request.sessionToken, ["maintainer", "admin"]);
      const { returnId, versionId } = returnVersionParamsSchema.parse(request.params);
      const file = await reviews.versionFile(returnId, versionId);
      return reply
        .header("content-type", "application/zip")
        .header("content-length", String(file.bytes))
        .header("content-disposition", disposition(file.fileName))
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, no-store")
        .send(file.stream);
    },
  );
}
