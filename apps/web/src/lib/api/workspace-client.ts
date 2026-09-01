import type {
  DownloadCredential,
  DownloadFeedbackRequest,
  DownloadRecord,
  PackageDraft,
  ReturnRecord,
  ReturnSubmission,
} from "@ai-tool-workbench/contracts";
import {
  downloadCredentialSchema,
  downloadListResponseSchema,
  packageGenerationResponseSchema,
  packageDraftRecordSchema,
  returnListResponseSchema,
  returnRecordSchema,
  taskListResponseSchema,
} from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";
import { resumePrecheckJob, runPrecheckJob, uploadFileInParts } from "./resumable-upload-client";

export function listTasks(page = 1, pageSize = 50) {
  return apiRequest(
    `/v1/tasks?page=${page}&pageSize=${pageSize}`,
    taskListResponseSchema,
  );
}

export function getPackageDraft(draftId: string) {
  return apiRequest(
    `/v1/package-drafts/${draftId}`,
    packageDraftRecordSchema,
  );
}

export function savePackageDraft(draft: PackageDraft) {
  return apiRequest(
    `/v1/package-drafts/${draft.id}`,
    packageDraftRecordSchema,
    { method: "PUT", body: JSON.stringify({ draft }) },
  );
}

export function generatePackage(draftId: string) {
  return apiRequest(
    `/v1/package-drafts/${draftId}/generate`,
    packageGenerationResponseSchema,
    { method: "POST" },
  );
}

export function getPackageVersion(packageVersionId: string) {
  return apiRequest(
    `/v1/package-versions/${packageVersionId}`,
    packageGenerationResponseSchema,
  );
}

export function packageDownloadUrl(downloadUrl: string) {
  return `/api/backend${downloadUrl}`;
}

function toDownloadRecord(record: DownloadCredential): DownloadRecord {
  return {
    id: record.id,
    kind: record.kind,
    objectName: record.objectName,
    downloadedAt: record.downloadedAt,
    packageVersionId: record.packageVersionId ?? undefined,
    packageVersion: record.packageVersion ?? undefined,
    toolVersionId: record.toolVersionId ?? undefined,
    toolVersion: record.toolVersion ?? undefined,
    sourceTaskId: record.sourceTaskId ?? undefined,
    lockedTools: record.lockedTools,
    lockedToolDetails: record.lockedToolDetails.map((tool) => ({
      toolId: tool.toolId,
      toolSlug: tool.toolSlug,
      toolName: tool.toolName,
      versionId: tool.versionId,
      version: tool.version,
      purpose: tool.purpose,
    })),
    lockedToolStatuses: record.lockedToolStatuses,
    downloadUrl: packageDownloadUrl(record.downloadUrl),
    feedbackState: record.feedbackState,
    feedbackResult: record.feedbackResult ?? undefined,
    feedbackRating: record.feedbackRating ?? undefined,
    feedbackComment: record.feedbackComment ?? undefined,
    feedbackSubmittedAt: record.feedbackSubmittedAt ?? undefined,
  };
}

export async function listDownloads(page = 1, pageSize = 100) {
  const response = await apiRequest(
    `/v1/downloads?page=${page}&pageSize=${pageSize}`,
    downloadListResponseSchema,
  );
  return { ...response, items: response.items.map(toDownloadRecord) };
}

export async function submitDownloadFeedback(
  downloadId: string,
  input: Omit<DownloadFeedbackRequest, "feedbackState">,
) {
  const record = await apiRequest(
    `/v1/downloads/${downloadId}/feedback`,
    downloadCredentialSchema,
    {
      method: "PATCH",
      body: JSON.stringify({ feedbackState: "submitted", ...input }),
    },
  );
  return toDownloadRecord(record);
}

export function toolDownloadUrl(slug: string, version: string) {
  return `/api/backend/v1/tools/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/download`;
}

export function toReturnSubmission(record: ReturnRecord): ReturnSubmission {
  return {
    id: record.id,
    name: record.name,
    sourceDownloadId: record.sourceDownloadId,
    version: record.version,
    state: record.state,
    updatedAt: record.updatedAt,
    findings: record.findings.map((item) => ({
      id: item.id,
      level: item.level,
      title: item.title,
      completion: item.completion,
    })),
    events: record.events,
    assets: record.assets,
    adoptedCount: record.adoptedCount,
    listed: record.listed,
    reviewReason: record.reviewReason,
  };
}

export function listReturns(page = 1, pageSize = 50) {
  return apiRequest(
    `/v1/returns?page=${page}&pageSize=${pageSize}`,
    returnListResponseSchema,
  );
}

export function getReturn(returnId: string) {
  return apiRequest(`/v1/returns/${returnId}`, returnRecordSchema);
}

export async function precheckReturn(
  file: File,
  sourceDownloadId: string,
  returnId?: string,
  onProgress?: (percent: number) => void,
  onJobStarted?: (jobId: string) => void,
) {
  const query = new URLSearchParams({ sourceDownloadId });
  if (returnId) query.set("returnId", returnId);
  const upload = await uploadFileInParts(file, "return", onProgress);
  return returnRecordSchema.parse(
    await runPrecheckJob(
      `/v1/uploads/${upload.id}/return-precheck-jobs?${query}`,
      (job) => onJobStarted?.(job.id),
    ),
  );
}

export async function resumeReturnPrecheck(jobId: string) {
  return returnRecordSchema.parse(await resumePrecheckJob(jobId));
}

export function submitReturn(returnId: string) {
  return apiRequest(
    `/v1/returns/${returnId}/submit`,
    returnRecordSchema,
    { method: "POST" },
  );
}

export function updateReturnListing(returnId: string, listed: boolean) {
  return apiRequest(
    `/v1/returns/${returnId}/listing`,
    returnRecordSchema,
    {
      method: "PATCH",
      body: JSON.stringify({ listed }),
    },
  );
}

export function returnVersionDownloadUrl(returnId: string, versionId: string) {
  return `/api/backend/v1/returns/${returnId}/versions/${versionId}/file`;
}
