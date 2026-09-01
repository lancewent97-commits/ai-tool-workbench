import cookie from "@fastify/cookie";
import {
  AiBriefNotReadyError,
  AiConversationNotFoundError,
  SelectedToolUnavailableError,
  type AiOrchestrator,
} from "@ai-tool-workbench/ai";
import {
  activateAccountRequestSchema,
  apiErrorResponseSchema,
  authResponseSchema,
  healthResponseSchema,
  importUsersRequestSchema,
  importUsersResponseSchema,
  loginRequestSchema,
  readinessResponseSchema,
} from "@ai-tool-workbench/contracts";
import {
  IdentityConflictError,
  type IdentityRepository,
  type TaskWorkspaceRepository,
  type ToolCatalogRepository,
} from "@ai-tool-workbench/db";
import Fastify from "fastify";
import { ZodError, type ZodType } from "zod";
import type { ApiConfig } from "./config.js";
import { AppError } from "./lib/app-error.js";
import { registerAiRoutes } from "./routes/ai-routes.js";
import { registerToolCatalogRoutes } from "./routes/tool-catalog-routes.js";
import { registerTaskWorkspaceRoutes } from "./routes/task-workspace-routes.js";
import { registerPackageGenerationRoutes } from "./routes/package-generation-routes.js";
import { registerDownloadRoutes } from "./routes/download-routes.js";
import { registerReturnRoutes } from "./routes/return-routes.js";
import { registerReturnReviewRoutes } from "./routes/return-review-routes.js";
import { registerAdminPlatformRoutes } from "./routes/admin-platform-routes.js";
import { registerAdminToolAssetRoutes } from "./routes/admin-tool-asset-routes.js";
import { registerUploadSessionRoutes } from "./routes/upload-session-routes.js";
import { AccountService } from "./services/account-service.js";
import type { PackageGenerationService } from "./services/package-generation-service.js";
import type { DownloadService } from "./services/download-service.js";
import type { ReturnService } from "./services/return-service.js";
import type { ReturnReviewService } from "./services/return-review-service.js";
import { ToolCatalogService } from "./services/tool-catalog-service.js";
import type { ToolAssetService } from "./services/tool-asset-service.js";
import type { UploadSessionService } from "./services/upload-session-service.js";
import type { PrecheckJobService } from "./services/precheck-job-service.js";

declare module "fastify" {
  interface FastifyRequest {
    sessionToken?: string;
  }
}

function parse<T>(schema: ZodType<T>, value: unknown) {
  return schema.parse(value);
}

export function buildApp(
  repository: IdentityRepository,
  config: ApiConfig,
  toolRepository?: ToolCatalogRepository,
  aiOrchestrator?: AiOrchestrator,
  taskWorkspace?: TaskWorkspaceRepository,
  packageGeneration?: PackageGenerationService,
  downloads?: DownloadService,
  returns?: ReturnService,
  returnReviews?: ReturnReviewService,
  toolAssets?: ToolAssetService,
  uploads?: UploadSessionService,
  precheckJobs?: PrecheckJobService,
) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    genReqId: () => crypto.randomUUID(),
  });
  const accounts = new AccountService(repository, {
    sessionHours: config.SESSION_HOURS,
    activationHours: config.ACTIVATION_HOURS,
  });
  const catalog = toolRepository ? new ToolCatalogService(toolRepository) : null;
  const runtimeConfig = config as ApiConfig & {
    PLATFORM_ENV?: "test" | "production";
    SESSION_COOKIE_NAME?: string;
    AI_PROVIDER?: "mock" | "external-dev" | "internal";
    EXTERNAL_AI_DATA_MODE?: "disabled" | "sanitized-test";
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
  };
  const platformEnvironment = runtimeConfig.PLATFORM_ENV ?? "test";
  const sessionCookieName = runtimeConfig.SESSION_COOKIE_NAME ?? "atw_test_session";

  app.register(cookie);
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.headers({
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    });
    return payload;
  });
  app.decorateRequest("sessionToken", undefined);
  app.addHook("preHandler", async (request) => {
    request.sessionToken = request.cookies[sessionCookieName];
  });
  app.addContentTypeParser(
    ["application/zip", "application/octet-stream"],
    (_request, payload, done) => done(null, payload),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(apiErrorResponseSchema.parse({
        error: {
          code: "VALIDATION_FAILED",
          message: "请求内容不符合要求",
          requestId: request.id,
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      }));
    }
    if (error instanceof IdentityConflictError) {
      return reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: error.message,
          requestId: request.id,
        },
      });
    }
    if (error instanceof AiConversationNotFoundError) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "没有找到这个AI任务", requestId: request.id },
      });
    }
    if (error instanceof AiBriefNotReadyError) {
      return reply.status(409).send({
        error: { code: "CONFLICT", message: error.message, requestId: request.id },
      });
    }
    if (error instanceof SelectedToolUnavailableError) {
      return reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: "手动选择的某个工具版本当前不可用，请重新选择",
          requestId: request.id,
        },
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }
    request.log.error({ error }, "Unhandled request error");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用",
        requestId: request.id,
      },
    });
  });

  app.get("/health", async () => healthResponseSchema.parse({
    status: "ok",
    service: "api",
    environment: platformEnvironment,
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async () => {
    await Promise.all([
      repository.healthCheck(),
      toolRepository?.healthCheck(),
      aiOrchestrator?.healthCheck(),
      taskWorkspace?.healthCheck(),
      packageGeneration?.healthCheck(),
      downloads?.healthCheck(),
      returns?.healthCheck(),
      toolAssets?.healthCheck(),
      uploads?.healthCheck(),
    ]);
    return readinessResponseSchema.parse({
      status: "ready",
      service: "api",
      environment: platformEnvironment,
      dependencies: { database: "ok" },
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/v1/auth/activate", async (request) => {
    const body = parse(activateAccountRequestSchema, request.body);
    const user = await accounts.activate(body.activationToken, body.password);
    return authResponseSchema.parse({ user });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = parse(loginRequestSchema, request.body);
    const { token, expiresAt, user } = await accounts.login(
      body.account,
      body.password,
      request.ip,
    );
    reply.setCookie(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.COOKIE_SECURE,
      path: "/",
      expires: expiresAt,
    });
    return authResponseSchema.parse({ user });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    await accounts.logout(request.cookies[sessionCookieName]);
    reply.clearCookie(sessionCookieName, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/v1/me", async (request) => {
    const user = await accounts.authenticate(request.cookies[sessionCookieName]);
    return authResponseSchema.parse({ user });
  });

  app.post("/v1/admin/users/import", async (request) => {
    const actor = await accounts.authorize(
      request.cookies[sessionCookieName],
      ["admin"],
    );
    const body = parse(importUsersRequestSchema, request.body);
    if (body.organizationId !== actor.organizationId) {
      throw new AppError(403, "FORBIDDEN", "不能为其他组织创建账号");
    }
    const imported = await accounts.inviteUsers(
      actor.id,
      body.organizationId,
      body.users,
    );
    return importUsersResponseSchema.parse({ imported });
  });

  if (catalog) registerToolCatalogRoutes(app, catalog);
  if (aiOrchestrator) registerAiRoutes(app, accounts, aiOrchestrator);
  if (taskWorkspace) registerTaskWorkspaceRoutes(app, accounts, taskWorkspace);
  if (packageGeneration) registerPackageGenerationRoutes(app, accounts, packageGeneration);
  if (downloads) registerDownloadRoutes(app, accounts, downloads);
  if (returns) registerReturnRoutes(app, accounts, returns);
  if (returnReviews) registerReturnReviewRoutes(app, accounts, returnReviews);
  if (toolAssets) registerAdminToolAssetRoutes(app, accounts, toolAssets);
  if (uploads) {
    registerUploadSessionRoutes(
      app,
      accounts,
      uploads,
      toolAssets,
      returns,
      precheckJobs,
    );
  }
  registerAdminPlatformRoutes(app, accounts, repository, {
    provider: runtimeConfig.AI_PROVIDER ?? "mock",
    model: runtimeConfig.AI_PROVIDER === "external-dev"
      ? runtimeConfig.DEEPSEEK_MODEL ?? "deepseek-v4-flash"
      : runtimeConfig.AI_PROVIDER === "internal"
        ? "company-internal"
        : "deterministic-mock",
    externalDataMode: runtimeConfig.EXTERNAL_AI_DATA_MODE ?? "disabled",
    keyConfigured: Boolean(runtimeConfig.DEEPSEEK_API_KEY?.trim()),
  });

  return { app, accounts, catalog };
}
