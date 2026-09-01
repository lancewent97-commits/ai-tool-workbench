import type {
  PageResult,
  ReturnAssetCandidate,
  ReturnFinding,
  ReturnRecord,
  ReturnReviewRecord,
} from "@ai-tool-workbench/contracts";

export type ReturnVersionInput = {
  userId: string;
  returnId?: string;
  sourceDownloadId: string;
  name: string;
  fileName: string;
  archivePath?: string;
  archiveBytes: number;
  archiveSha256: string;
  precheckStatus: "failed" | "passed";
  findings: ReturnFinding[];
  assetCandidates: ReturnAssetCandidate[];
  fixPrompt: string;
};

export type PublishedReturnAssetInput = {
  candidate: ReturnAssetCandidate;
  slug: string;
  artifactPath: string;
  artifactBytes: number;
  artifactSha256: string;
  downloadUrl: string;
};

export interface ReturnSubmissionRepository {
  healthCheck(): Promise<void>;
  addVersion(input: ReturnVersionInput): Promise<ReturnRecord>;
  findById(userId: string, returnId: string): Promise<ReturnRecord | null>;
  list(
    userId: string,
    input: { page: number; pageSize: number },
  ): Promise<PageResult<ReturnRecord>>;
  setListing(
    userId: string,
    returnId: string,
    listed: boolean,
  ): Promise<ReturnRecord | null>;
  submitForReview(userId: string, returnId: string): Promise<ReturnRecord | null>;
  listForReview(input: {
    page: number;
    pageSize: number;
  }): Promise<PageResult<ReturnReviewRecord>>;
  findForReview(returnId: string): Promise<ReturnReviewRecord | null>;
  rejectReview(input: {
    reviewerUserId: string;
    returnId: string;
    reason: string;
  }): Promise<ReturnRecord | null>;
  approveReview(input: {
    reviewerUserId: string;
    returnId: string;
    assets: PublishedReturnAssetInput[];
  }): Promise<ReturnRecord | null>;
  findVersionFile(
    userId: string,
    returnId: string,
    versionId: string,
  ): Promise<{ path: string; fileName: string; bytes: number } | null>;
  close(): Promise<void>;
}
