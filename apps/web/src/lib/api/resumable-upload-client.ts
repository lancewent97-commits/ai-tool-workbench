import {
  precheckJobSchema,
  uploadSessionSchema,
  type PrecheckJob,
  type UploadPurpose,
} from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";

export async function uploadFileInParts(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (percent: number) => void,
) {
  const resumeKey = `upload:${purpose}:${file.name}:${file.size}:${file.lastModified}`;
  const savedId = window.sessionStorage.getItem(resumeKey);
  let session = savedId
    ? await apiRequest(`/v1/uploads/${savedId}`, uploadSessionSchema).catch(() => null)
    : null;
  if (
    !session
    || session.status !== "uploading"
    || session.expectedBytes !== file.size
    || session.fileName !== file.name
  ) {
    session = await apiRequest("/v1/uploads", uploadSessionSchema, {
      method: "POST",
      body: JSON.stringify({
        purpose,
        fileName: file.name,
        expectedBytes: file.size,
      }),
    });
    window.sessionStorage.setItem(resumeKey, session.id);
  }

  const uploaded = new Set(session.uploadedParts.map((part) => part.partNumber));
  const partCount = Math.ceil(file.size / session.chunkSizeBytes);
  for (let index = 0; index < partCount; index += 1) {
    const partNumber = index + 1;
    if (uploaded.has(partNumber)) continue;
    const start = index * session.chunkSizeBytes;
    const body = file.slice(start, Math.min(file.size, start + session.chunkSizeBytes));
    session = await apiRequest(
      `/v1/uploads/${session.id}/parts/${partNumber}`,
      uploadSessionSchema,
      {
        method: "PUT",
        body,
        headers: { "content-type": "application/octet-stream" },
      },
    );
    onProgress?.(Math.round((session.uploadedBytes / file.size) * 100));
  }

  const completed = await apiRequest(
    `/v1/uploads/${session.id}/complete`,
    uploadSessionSchema,
    { method: "POST" },
  );
  window.sessionStorage.removeItem(resumeKey);
  return completed;
}

async function pollPrecheckJob(initialJob: PrecheckJob) {
  let job = initialJob;
  const deadline = Date.now() + 30 * 60 * 1000;
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() >= deadline) {
      throw new Error("预检仍在后台执行，请稍后重新查看");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    job = await apiRequest(
      `/v1/precheck-jobs/${encodeURIComponent(job.id)}`,
      precheckJobSchema,
    );
  }
  if (job.status === "failed") {
    throw new Error(job.errorMessage || "预检执行失败");
  }
  return job.result;
}

export async function runPrecheckJob(
  endpoint: string,
  onStarted?: (job: PrecheckJob) => void,
) {
  const job = await apiRequest(endpoint, precheckJobSchema, { method: "POST" });
  onStarted?.(job);
  return pollPrecheckJob(job);
}

export async function resumePrecheckJob(jobId: string) {
  const job = await apiRequest(
    `/v1/precheck-jobs/${encodeURIComponent(jobId)}`,
    precheckJobSchema,
  );
  return pollPrecheckJob(job);
}
