import {
  adminToolAssetDetailResponseSchema,
  adminToolAssetListResponseSchema,
  adminToolUploadResponseSchema,
  createToolAssetRequestSchema,
  createToolAssetVersionRequestSchema,
  offlineToolAssetRequestSchema,
  toolAssetAdminQuerySchema,
  updateToolAssetRequestSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import type { AccountService } from "../services/account-service.js";
import type { ToolAssetService } from "../services/tool-asset-service.js";

const toolParamsSchema = z.object({ toolId: z.uuid() });
const versionParamsSchema = z.object({
  toolId: z.uuid(),
  versionId: z.uuid(),
});

export function registerAdminToolAssetRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  assets: ToolAssetService,
) {
  const authorize = (cookie: string | undefined) =>
    accounts.authorize(cookie, ["maintainer", "admin"]);

  app.get("/v1/admin/tools", async (request) => {
    await authorize(request.sessionToken);
    const query = toolAssetAdminQuerySchema.parse(request.query);
    const result = await assets.list(query);
    return adminToolAssetListResponseSchema.parse({ ...result, ...query });
  });

  app.get("/v1/admin/tools/:toolId", async (request) => {
    await authorize(request.sessionToken);
    const { toolId } = toolParamsSchema.parse(request.params);
    const tool = await assets.get(toolId);
    return adminToolAssetDetailResponseSchema.parse({ tool });
  });

  app.post("/v1/admin/tools", async (request, reply) => {
    const actor = await authorize(request.sessionToken);
    const input = createToolAssetRequestSchema.parse(request.body);
    const tool = await assets.create(actor.id, input);
    return reply.status(201).send(adminToolAssetDetailResponseSchema.parse({ tool }));
  });

  app.post("/v1/admin/tool-uploads", async (request) => {
    const actor = await authorize(request.sessionToken);
    const rawName = request.headers["x-upload-filename"];
    const fileName = Array.isArray(rawName) ? rawName[0] : rawName;
    if (!fileName) {
      throw new AppError(400, "BAD_REQUEST", "上传请求缺少文件名");
    }
    return adminToolUploadResponseSchema.parse(
      await assets.upload(actor.id, fileName, request.body as Readable),
    );
  });

  app.put("/v1/admin/tools/:toolId", async (request) => {
    const actor = await authorize(request.sessionToken);
    const { toolId } = toolParamsSchema.parse(request.params);
    const input = updateToolAssetRequestSchema.parse(request.body);
    const tool = await assets.update(actor.id, toolId, input);
    return adminToolAssetDetailResponseSchema.parse({ tool });
  });

  app.post("/v1/admin/tools/:toolId/versions", async (request, reply) => {
    const actor = await authorize(request.sessionToken);
    const { toolId } = toolParamsSchema.parse(request.params);
    const input = createToolAssetVersionRequestSchema.parse(request.body);
    const tool = await assets.addVersion(actor.id, toolId, input);
    return reply.status(201).send(adminToolAssetDetailResponseSchema.parse({ tool }));
  });

  app.post(
    "/v1/admin/tools/:toolId/versions/:versionId/publish",
    async (request) => {
      const actor = await authorize(request.sessionToken);
      const { toolId, versionId } = versionParamsSchema.parse(request.params);
      const tool = await assets.publishVersion(actor.id, toolId, versionId);
      return adminToolAssetDetailResponseSchema.parse({ tool });
    },
  );

  app.post(
    "/v1/admin/tools/:toolId/versions/:versionId/offline",
    async (request) => {
      const actor = await authorize(request.sessionToken);
      const { toolId, versionId } = versionParamsSchema.parse(request.params);
      const { reason } = offlineToolAssetRequestSchema.parse(request.body);
      const tool = await assets.offlineVersion(actor.id, toolId, versionId, reason);
      return adminToolAssetDetailResponseSchema.parse({ tool });
    },
  );

  app.post("/v1/admin/tools/:toolId/offline", async (request) => {
    const actor = await authorize(request.sessionToken);
    const { toolId } = toolParamsSchema.parse(request.params);
    const { reason } = offlineToolAssetRequestSchema.parse(request.body);
    const tool = await assets.offline(actor.id, toolId, reason);
    return adminToolAssetDetailResponseSchema.parse({ tool });
  });

  app.post("/v1/admin/tools/:toolId/publish", async (request) => {
    const actor = await authorize(request.sessionToken);
    const { toolId } = toolParamsSchema.parse(request.params);
    const tool = await assets.publish(actor.id, toolId);
    return adminToolAssetDetailResponseSchema.parse({ tool });
  });
}
