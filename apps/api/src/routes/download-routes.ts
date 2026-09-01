import { createReadStream } from "node:fs";
import {
  downloadCredentialSchema,
  downloadFeedbackRequestSchema,
  downloadListQuerySchema,
  downloadListResponseSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AccountService } from "../services/account-service.js";
import type { DownloadFile, DownloadService } from "../services/download-service.js";

const packageParamsSchema = z.object({
  packageVersionId: z.uuid(),
});

const toolParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/),
});

const downloadParamsSchema = z.object({
  downloadId: z.uuid(),
});

function disposition(fileName: string) {
  return `attachment; filename="tool-download.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function sendDownload(reply: FastifyReply, file: DownloadFile) {
  reply
    .header("content-type", "application/zip")
    .header("content-length", String(file.bytes))
    .header("content-disposition", disposition(file.fileName))
    .header("x-download-credential-id", file.credential.id)
    .header("x-content-type-options", "nosniff")
    .header("cache-control", "private, no-store");
  return reply.send(createReadStream(file.filePath));
}

export function registerDownloadRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  downloads: DownloadService,
) {
  app.get("/v1/downloads", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const query = downloadListQuerySchema.parse(request.query);
    return downloadListResponseSchema.parse(await downloads.list(user.id, query));
  });

  app.patch("/v1/downloads/:downloadId/feedback", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { downloadId } = downloadParamsSchema.parse(request.params);
    const input = downloadFeedbackRequestSchema.parse(request.body);
    return downloadCredentialSchema.parse(
      await downloads.submitFeedback(user.id, downloadId, input),
    );
  });

  app.get("/v1/downloads/:downloadId/file", async (request, reply) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { downloadId } = downloadParamsSchema.parse(request.params);
    return sendDownload(reply, await downloads.redownload(user.id, downloadId));
  });

  app.get("/v1/package-versions/:packageVersionId/download", async (request, reply) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { packageVersionId } = packageParamsSchema.parse(request.params);
    return sendDownload(reply, await downloads.downloadPackage(user.id, packageVersionId));
  });

  app.get("/v1/tools/:slug/versions/:version/download", async (request, reply) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { slug, version } = toolParamsSchema.parse(request.params);
    return sendDownload(reply, await downloads.downloadTool(user.id, slug, version));
  });
}
