import {
  createUploadSessionRequestSchema,
  uploadPartParamsSchema,
  uploadSessionParamsSchema,
  uploadSessionSchema,
  precheckJobParamsSchema,
  precheckJobSchema,
  adminToolUploadResponseSchema,
  returnPrecheckQuerySchema,
  returnRecordSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import type { AccountService } from "../services/account-service.js";
import type { UploadSessionService } from "../services/upload-session-service.js";
import type { ToolAssetService } from "../services/tool-asset-service.js";
import type { ReturnService } from "../services/return-service.js";
import type { PrecheckJobService } from "../services/precheck-job-service.js";

export function registerUploadSessionRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  uploads: UploadSessionService,
  toolAssets?: ToolAssetService,
  returns?: ReturnService,
  precheckJobs?: PrecheckJobService,
) {
  app.post("/v1/uploads", async (request, reply) => {
    const user = await accounts.authenticate(request.sessionToken);
    const body = createUploadSessionRequestSchema.parse(request.body);
    return reply.status(201).send(
      uploadSessionSchema.parse(await uploads.create(user.id, body)),
    );
  });

  app.get("/v1/uploads/:uploadId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { uploadId } = uploadSessionParamsSchema.parse(request.params);
    return uploadSessionSchema.parse(await uploads.get(user.id, uploadId));
  });

  app.put("/v1/uploads/:uploadId/parts/:partNumber", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { uploadId, partNumber } = uploadPartParamsSchema.parse(request.params);
    return uploadSessionSchema.parse(
      await uploads.uploadPart(user.id, uploadId, partNumber, request.body as Readable),
    );
  });

  app.post("/v1/uploads/:uploadId/complete", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { uploadId } = uploadSessionParamsSchema.parse(request.params);
    return uploadSessionSchema.parse(await uploads.complete(user.id, uploadId));
  });

  app.delete("/v1/uploads/:uploadId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { uploadId } = uploadSessionParamsSchema.parse(request.params);
    return uploadSessionSchema.parse(await uploads.abort(user.id, uploadId));
  });

  if (toolAssets) {
    app.post("/v1/uploads/:uploadId/tool-precheck", async (request) => {
      const actor = await accounts.authorize(request.sessionToken, ["maintainer", "admin"]);
      const { uploadId } = uploadSessionParamsSchema.parse(request.params);
      return adminToolUploadResponseSchema.parse(
        await uploads.consume(actor.id, uploadId, "tool", (fileName, stream) =>
          toolAssets.upload(actor.id, encodeURIComponent(fileName), stream)),
      );
    });
  }

  if (precheckJobs) {
    app.post("/v1/uploads/:uploadId/tool-precheck-jobs", async (request, reply) => {
      const actor = await accounts.authorize(request.sessionToken, ["maintainer", "admin"]);
      const { uploadId } = uploadSessionParamsSchema.parse(request.params);
      return reply.status(202).send(
        precheckJobSchema.parse(await precheckJobs.createToolJob(actor.id, uploadId)),
      );
    });

    app.post("/v1/uploads/:uploadId/return-precheck-jobs", async (request, reply) => {
      const user = await accounts.authenticate(request.sessionToken);
      const { uploadId } = uploadSessionParamsSchema.parse(request.params);
      const query = returnPrecheckQuerySchema.parse(request.query);
      return reply.status(202).send(
        precheckJobSchema.parse(
          await precheckJobs.createReturnJob(user.id, uploadId, query),
        ),
      );
    });

    app.get("/v1/precheck-jobs/:jobId", async (request) => {
      const user = await accounts.authenticate(request.sessionToken);
      const { jobId } = precheckJobParamsSchema.parse(request.params);
      return precheckJobSchema.parse(await precheckJobs.get(user.id, jobId));
    });
  }

  if (returns) {
    app.post("/v1/uploads/:uploadId/return-precheck", async (request) => {
      const user = await accounts.authenticate(request.sessionToken);
      const { uploadId } = uploadSessionParamsSchema.parse(request.params);
      const query = returnPrecheckQuerySchema.parse(request.query);
      return returnRecordSchema.parse(
        await uploads.consume(user.id, uploadId, "return", (fileName, stream) =>
          returns.precheck(user.id, {
            ...query,
            fileName: encodeURIComponent(fileName),
            stream,
          })),
      );
    });
  }
}
