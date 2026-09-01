import type {
  PackageDraft,
  PackageDraftRecord,
  PageResult,
  Task,
} from "@ai-tool-workbench/contracts";
import {
  type TaskWorkspaceRepository,
  WorkspaceTaskNotFoundError,
} from "@ai-tool-workbench/db";

export class MemoryTaskWorkspaceRepository implements TaskWorkspaceRepository {
  private readonly tasks = new Map<string, Task[]>();
  private readonly drafts = new Map<string, PackageDraftRecord>();

  async healthCheck() {}

  seedTask(userId: string, task: Task) {
    this.tasks.set(userId, [task, ...(this.tasks.get(userId) ?? [])]);
  }

  async listTasks(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<Task>> {
    const items = this.tasks.get(userId) ?? [];
    const start = (input.page - 1) * input.pageSize;
    return {
      items: items.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: items.length,
    };
  }

  async getPackageDraft(userId: string, draftId: string) {
    return this.drafts.get(`${userId}:${draftId}`) ?? null;
  }

  async savePackageDraft(userId: string, draft: PackageDraft) {
    if (
      draft.source === "ai"
      && !(this.tasks.get(userId) ?? []).some((task) => task.id === draft.taskId)
    ) {
      throw new WorkspaceTaskNotFoundError("没有找到关联的AI任务");
    }
    const key = `${userId}:${draft.id}`;
    const existing = this.drafts.get(key);
    const record: PackageDraftRecord = {
      draft,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.drafts.set(key, record);
    if (draft.taskId) {
      this.tasks.set(userId, (this.tasks.get(userId) ?? []).map((task) =>
        task.id === draft.taskId
          ? {
              ...task,
              stage: "package-review",
              needsUserAction: true,
              updatedAt: record.updatedAt,
            }
          : task));
    }
    return record;
  }
}
