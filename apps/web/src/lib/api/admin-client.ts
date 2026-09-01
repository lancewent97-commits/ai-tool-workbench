import {
  adminAiStatusSchema,
  adminAuditListResponseSchema,
  adminToolAssetDetailResponseSchema,
  adminToolAssetListResponseSchema,
  adminToolUploadResponseSchema,
  adminUserListResponseSchema,
  importUsersResponseSchema,
  returnListQuerySchema,
  returnRecordSchema,
  returnReviewListResponseSchema,
  returnReviewRecordSchema,
  type ReturnReviewDecision,
  type CreateToolAssetRequest,
  type CreateToolAssetVersionRequest,
  type UpdateToolAssetRequest,
} from "@ai-tool-workbench/contracts";
import type { ImportUsersRequest } from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";
import { runPrecheckJob, uploadFileInParts } from "./resumable-upload-client";

export function listReturnReviews(page = 1, pageSize = 50) {
  const query = returnListQuerySchema.parse({ page, pageSize });
  return apiRequest(
    `/v1/admin/returns?page=${query.page}&pageSize=${query.pageSize}`,
    returnReviewListResponseSchema,
  );
}

export async function listAllReturnReviews() {
  const pageSize = 100;
  const first = await listReturnReviews(1, pageSize);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await listReturnReviews(page, pageSize);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return { ...first, items, page: 1, pageSize: items.length };
}

export function getReturnReview(returnId: string) {
  return apiRequest(
    `/v1/admin/returns/${returnId}`,
    returnReviewRecordSchema,
  );
}

export function decideReturnReview(
  returnId: string,
  decision: ReturnReviewDecision,
) {
  return apiRequest(
    `/v1/admin/returns/${returnId}/decision`,
    returnRecordSchema,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(decision),
    },
  );
}

export function adminReturnVersionDownloadUrl(
  returnId: string,
  versionId: string,
) {
  return `/api/backend/v1/admin/returns/${returnId}/versions/${versionId}/file`;
}

export function listAdminUsers() {
  return apiRequest("/v1/admin/users", adminUserListResponseSchema);
}

export function listAdminAuditEvents(limit = 100) {
  return apiRequest(
    `/v1/admin/audit-events?limit=${Math.max(1, Math.min(limit, 200))}`,
    adminAuditListResponseSchema,
  );
}

export function getAdminAiStatus() {
  return apiRequest("/v1/admin/ai/status", adminAiStatusSchema);
}

export function importAdminUsers(input: ImportUsersRequest) {
  return apiRequest("/v1/admin/users/import", importUsersResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listAdminTools(input?: {
  q?: string;
  status?: "draft" | "published" | "offline";
  origin?: "maintainer-upload" | "return-composite" | "return-derived" | "return-new" | "seed";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams({
    page: String(input?.page ?? 1),
    pageSize: String(input?.pageSize ?? 100),
  });
  if (input?.q) query.set("q", input.q);
  if (input?.status) query.set("status", input.status);
  if (input?.origin) query.set("origin", input.origin);
  return apiRequest(
    `/v1/admin/tools?${query}`,
    adminToolAssetListResponseSchema,
  );
}

export async function listAllAdminTools(input?: Omit<Parameters<typeof listAdminTools>[0], "page" | "pageSize">) {
  const pageSize = 100;
  const first = await listAdminTools({ ...input, page: 1, pageSize });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await listAdminTools({ ...input, page, pageSize });
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return { ...first, items, page: 1, pageSize: items.length };
}

export function getAdminTool(toolId: string) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}`,
    adminToolAssetDetailResponseSchema,
  );
}

export async function getAdminToolBySlug(slug: string) {
  const list = await listAdminTools({ q: slug, pageSize: 100 });
  const match = list.items.find((tool) => tool.slug === slug);
  return match ? getAdminTool(match.id) : null;
}

export function createAdminTool(input: CreateToolAssetRequest) {
  return apiRequest("/v1/admin/tools", adminToolAssetDetailResponseSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminTool(toolId: string, input: UpdateToolAssetRequest) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}`,
    adminToolAssetDetailResponseSchema,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export async function uploadAdminTool(
  file: File,
  onProgress?: (percent: number) => void,
) {
  const upload = await uploadFileInParts(file, "tool", onProgress);
  return adminToolUploadResponseSchema.parse(
    await runPrecheckJob(
      `/v1/uploads/${upload.id}/tool-precheck-jobs`,
    ),
  );
}

export function uploadAdminToolLegacy(file: File) {
  return apiRequest("/v1/admin/tool-uploads", adminToolUploadResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/zip",
      "x-upload-filename": encodeURIComponent(file.name),
    },
    body: file,
  });
}

export function createAdminToolVersion(
  toolId: string,
  input: CreateToolAssetVersionRequest,
) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}/versions`,
    adminToolAssetDetailResponseSchema,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function publishAdminToolVersion(toolId: string, versionId: string) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}/versions/${encodeURIComponent(versionId)}/publish`,
    adminToolAssetDetailResponseSchema,
    { method: "POST" },
  );
}

export function offlineAdminToolVersion(
  toolId: string,
  versionId: string,
  reason: string,
) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}/versions/${encodeURIComponent(versionId)}/offline`,
    adminToolAssetDetailResponseSchema,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function publishAdminTool(toolId: string) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}/publish`,
    adminToolAssetDetailResponseSchema,
    { method: "POST" },
  );
}

export function offlineAdminTool(toolId: string, reason: string) {
  return apiRequest(
    `/v1/admin/tools/${encodeURIComponent(toolId)}/offline`,
    adminToolAssetDetailResponseSchema,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
