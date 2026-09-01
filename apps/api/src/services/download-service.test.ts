import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  DownloadCredential,
  LockedPackageTool,
  PackageVersionRecord,
} from "@ai-tool-workbench/contracts";
import type {
  DownloadCredentialInput,
  DownloadHistoryRepository,
  PackageGenerationRepository,
} from "@ai-tool-workbench/db";
import { MemoryToolCatalogRepository } from "../testing/memory-tool-catalog-repository.js";
import { DownloadService } from "./download-service.js";
import { PlatformArtifactStore } from "./platform-artifact-store.js";

const userId = "00000000-0000-4000-8000-000000000901";
const packageVersionId = "00000000-0000-4000-8000-000000000902";

class MemoryDownloadHistory implements DownloadHistoryRepository {
  readonly records: DownloadCredential[] = [];

  async healthCheck() {}

  async create(input: DownloadCredentialInput) {
    const sequence = this.records.length + 1;
    const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
    const record: DownloadCredential = {
      id,
      kind: input.kind,
      objectName: input.objectName,
      downloadedAt: new Date(sequence * 1_000).toISOString(),
      packageVersionId: input.packageVersionId ?? null,
      packageVersion: input.packageVersionId ? "v1" : null,
      toolVersionId: input.toolVersionId ?? null,
      toolVersion: input.toolVersionId ? "v2.3" : null,
      sourceTaskId: input.sourceTaskId ?? null,
      lockedTools: input.lockedTools.map((item) => ({
        toolId: item.toolId,
        versionId: item.versionId,
        purpose: item.purpose,
        replaceable: item.replaceable,
      })),
      lockedToolDetails: input.lockedTools,
      lockedToolStatuses: input.lockedTools.map((tool) => ({
        toolId: tool.toolId,
        toolSlug: tool.toolSlug,
        status: "published" as const,
        latestVersion: tool.version,
        derivedCount: 0,
      })),
      downloadUrl: `/v1/downloads/${id}/file`,
      feedbackState: "none",
      feedbackResult: null,
      feedbackRating: null,
      feedbackComment: null,
      feedbackSubmittedAt: null,
    };
    this.records.unshift(record);
    return record;
  }

  async findById(requestUserId: string, id: string) {
    return requestUserId === userId
      ? this.records.find((record) => record.id === id) ?? null
      : null;
  }

  async list(requestUserId: string, input: { page: number; pageSize: number }) {
    const items = requestUserId === userId ? this.records : [];
    const start = (input.page - 1) * input.pageSize;
    return {
      items: items.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: items.length,
    };
  }

  async submitFeedback(
    requestUserId: string,
    id: string,
    input: { result?: "complete" | "partial" | "failed"; rating?: number; comment: string },
  ) {
    const record = await this.findById(requestUserId, id);
    if (!record) return null;
    record.feedbackState = "submitted";
    record.feedbackResult = input.result ?? null;
    record.feedbackRating = input.rating ?? null;
    record.feedbackComment = input.comment || null;
    record.feedbackSubmittedAt = new Date().toISOString();
    return record;
  }

  async close() {}
}

function packageRecord(lockedTools: LockedPackageTool[]): PackageVersionRecord {
  return {
    id: packageVersionId,
    draftId: "manual-test",
    taskId: null,
    source: "manual",
    name: "教材音标工具包",
    goal: "提取教材单词并生成音标配音",
    deliverables: ["音标配音文件"],
    lockedTools,
    plannedComponents: [],
    version: "v1",
    status: "ready",
    startPrompt: "请按目标文件执行。",
    downloadUrl: `/v1/package-versions/${packageVersionId}/download`,
    archiveBytes: 12,
    archiveSha256: "a".repeat(64),
    errorMessage: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    readyAt: "2026-07-23T00:00:01.000Z",
  };
}

test("每次工具包、单工具和原版本重下都会生成独立服务端下载凭证", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workbench-download-"));
  try {
    const toolArchive = path.join(directory, "pdf-content-extractor.zip");
    const packageArchive = path.join(directory, "package.zip");
    await Promise.all([
      writeFile(toolArchive, "tool"),
      writeFile(packageArchive, "package"),
    ]);

    const catalog = new MemoryToolCatalogRepository();
    const tool = await catalog.findToolBySlug("pdf-content-extractor");
    assert.ok(tool);
    const lockedTools: LockedPackageTool[] = [{
      toolId: tool.id,
      toolSlug: tool.slug,
      toolName: tool.name,
      toolKind: tool.kind,
      versionId: tool.latestVersion.id,
      version: tool.latestVersion.version,
      purpose: tool.problem,
      replaceable: false,
      problem: tool.problem,
      result: tool.result,
      verification: tool.latestVersion.verification,
      standardVersion: tool.latestVersion.standardVersion,
      risks: tool.latestVersion.risks,
    }];
    const readyPackage = packageRecord(lockedTools);
    const packages = {
      async healthCheck() {},
      async getReadyArchive(requestUserId: string, requestedVersionId: string) {
        return requestUserId === userId && requestedVersionId === packageVersionId
          ? { record: readyPackage, archivePath: packageArchive }
          : null;
      },
      async close() {},
    } as unknown as PackageGenerationRepository;
    const history = new MemoryDownloadHistory();
    const service = new DownloadService(
      history,
      packages,
      catalog,
      new PlatformArtifactStore(directory),
    );

    const firstPackage = await service.downloadPackage(userId, packageVersionId);
    const toolDownload = await service.downloadTool(
      userId,
      "pdf-content-extractor",
      "v2.3",
    );
    const secondPackage = await service.redownload(userId, firstPackage.credential.id);
    const secondTool = await service.redownload(userId, toolDownload.credential.id);

    assert.equal(firstPackage.filePath, packageArchive);
    assert.equal(secondPackage.filePath, packageArchive);
    assert.equal(toolDownload.filePath, toolArchive);
    assert.equal(secondTool.filePath, toolArchive);
    assert.equal(history.records.length, 4);
    assert.equal(new Set(history.records.map((record) => record.id)).size, 4);
    assert.equal(secondPackage.credential.packageVersionId, packageVersionId);
    assert.equal(secondTool.credential.toolVersionId, tool.latestVersion.id);
    assert.deepEqual(
      secondPackage.credential.lockedToolDetails,
      firstPackage.credential.lockedToolDetails,
    );

    const rated = await service.submitFeedback(userId, toolDownload.credential.id, {
      feedbackState: "submitted",
      rating: 5,
      comment: "提取结果准确，结构也清楚",
    });
    const completed = await service.submitFeedback(userId, firstPackage.credential.id, {
      feedbackState: "submitted",
      result: "complete",
      comment: "三个交付文件都已生成",
    });
    assert.equal(rated.feedbackRating, 5);
    assert.equal(rated.feedbackComment, "提取结果准确，结构也清楚");
    assert.equal(completed.feedbackResult, "complete");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
