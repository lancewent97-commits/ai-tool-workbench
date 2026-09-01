import {
  packageDraftRecordSchema,
  packageDraftUpsertRequestSchema,
  taskListQuerySchema,
  taskListResponseSchema,
} from "@ai-tool-workbench/contracts";
import {
  type TaskWorkspaceRepository,
  WorkspaceTaskNotFoundError,
} from "@ai-tool-workbench/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import type { AccountService } from "../services/account-service.js";

const draftParamsSchema = z.object({
  draftId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/),
});

export function registerTaskWorkspaceRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  workspace: TaskWorkspaceRepository,
) {
  app.get("/v1/tasks", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const query = taskListQuerySchema.parse(request.query);
    return taskListResponseSchema.parse(await workspace.listTasks(user.id, query));
  });

  app.get("/v1/package-drafts/:draftId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { draftId } = draftParamsSchema.parse(request.params);
    const record = await workspace.getPackageDraft(user.id, draftId);
    if (!record) throw new AppError(404, "NOT_FOUND", "没有找到这个工具包草稿");
    return packageDraftRecordSchema.parse(record);
  });

  app.put("/v1/package-drafts/:draftId", async (request) => {
    const user = await accounts.authenticate(request.sessionToken);
    const { draftId } = draftParamsSchema.parse(request.params);
    const { draft } = packageDraftUpsertRequestSchema.parse(request.body);
    if (draft.id !== draftId) {
      throw new AppError(400, "BAD_REQUEST", "草稿ID与请求路径不一致");
    }
    try {
      return packageDraftRecordSchema.parse(
        await workspace.savePackageDraft(user.id, draft),
      );
    } catch (error) {
      if (error instanceof WorkspaceTaskNotFoundError) {
        throw new AppError(404, "NOT_FOUND", error.message);
      }
      throw error;
    }
  });
}
