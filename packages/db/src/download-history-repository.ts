import type {
  DownloadCredential,
  DownloadFeedbackRequest,
  LockedPackageTool,
  PageResult,
} from "@ai-tool-workbench/contracts";

export type DownloadCredentialInput = {
  userId: string;
  kind: DownloadCredential["kind"];
  objectName: string;
  packageVersionId?: string;
  toolVersionId?: string;
  sourceTaskId?: string;
  lockedTools: LockedPackageTool[];
};

export interface DownloadHistoryRepository {
  healthCheck(): Promise<void>;
  create(input: DownloadCredentialInput): Promise<DownloadCredential>;
  findById(userId: string, id: string): Promise<DownloadCredential | null>;
  list(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<DownloadCredential>>;
  submitFeedback(
    userId: string,
    id: string,
    input: DownloadFeedbackRequest,
  ): Promise<DownloadCredential | null>;
  close(): Promise<void>;
}
