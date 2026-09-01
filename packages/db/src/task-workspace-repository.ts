import type {
  PackageDraft,
  PackageDraftRecord,
  PageResult,
  Task,
} from "@ai-tool-workbench/contracts";

export class WorkspaceTaskNotFoundError extends Error {}
export class PackageDraftNotFoundError extends Error {}

export interface TaskWorkspaceRepository {
  healthCheck(): Promise<void>;
  listTasks(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<Task>>;
  getPackageDraft(userId: string, draftId: string): Promise<PackageDraftRecord | null>;
  savePackageDraft(userId: string, draft: PackageDraft): Promise<PackageDraftRecord>;
}
