import {
  returnListQuerySchema,
  returnListResponseSchema,
  returnListingRequestSchema,
  returnParamsSchema,
  returnPrecheckQuerySchema,
  returnRecordSchema,
  returnVersionParamsSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import { AppError } from "../lib/app-error.js";
import type { AccountService } from "../services/account-service.js";
import type { ReturnService } from "../services/return-service.js";

function disposition(fileName: string) {
  return `attachment; filename="return-package.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function registerReturnRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  returns: ReturnService,
) {
  app.get("/v1/returns", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const query = returnListQuerySchema.parse(request.query);
    return returnListResponseSchema.parse(await returns.list(user.id, query));
  });

  app.get("/v1/returns/:returnId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { returnId } = returnParamsSchema.parse(request.params);
    return returnRecordSchema.parse(await returns.get(user.id, returnId));
  });

  app.post("/v1/returns/precheck", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const query = returnPrecheckQuerySchema.parse(request.query);
    const rawName = request.headers["x-upload-filename"];
    const fileName = Array.isArray(rawName) ? rawName[0] : rawName;
    if (!fileName) {
      throw new AppError(400, "BAD_REQUEST", "上传请求缺少文件名");
    }
    return returnRecordSchema.parse(await returns.precheck(user.id, {
      ...query,
      fileName,
      stream: request.body as Readable,
    }));
  });

  app.post("/v1/returns/:returnId/submit", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { returnId } = returnParamsSchema.parse(request.params);
    return returnRecordSchema.parse(await returns.submit(user.id, returnId));
  });

  app.patch("/v1/returns/:returnId/listing", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { returnId } = returnParamsSchema.parse(request.params);
    const { listed } = returnListingRequestSchema.parse(request.body);
    return returnRecordSchema.parse(
      await returns.setListing(user.id, returnId, listed),
    );
  });

  app.get("/v1/returns/:returnId/versions/:versionId/file", async (request, reply) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { returnId, versionId } = returnVersionParamsSchema.parse(request.params);
    const file = await returns.versionFile(user.id, returnId, versionId);
    return reply
      .header("content-type", "application/zip")
      .header("content-length", String(file.bytes))
      .header("content-disposition", disposition(file.fileName))
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, no-store")
      .send(file.stream);
  });
}
