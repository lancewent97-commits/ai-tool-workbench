import { stat } from "node:fs/promises";
import type {
  DownloadCredential,
  DownloadFeedbackRequest,
  LockedPackageTool,
  PackageVersionRecord,
  ToolCatalogItem,
  ToolVersionSummary,
} from "@ai-tool-workbench/contracts";
import type {
  DownloadHistoryRepository,
  PackageGenerationRepository,
  ToolCatalogRepository,
} from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";
import type { PlatformArtifactStore } from "./platform-artifact-store.js";

export type DownloadFile = {
  credential: DownloadCredential;
  filePath: string;
  fileName: string;
  bytes: number;
};

function lockedTool(
  tool: ToolCatalogItem,
  version: ToolVersionSummary,
  purpose: string,
): LockedPackageTool {
  return {
    toolId: tool.id,
    toolSlug: tool.slug,
    toolName: tool.name,
    toolKind: tool.kind,
    versionId: version.id,
    version: version.version,
    purpose,
    replaceable: false,
    problem: tool.problem,
    result: tool.result,
    verification: version.verification,
    standardVersion: version.standardVersion,
    risks: version.risks,
  };
}

export class DownloadService {
  constructor(
    private readonly history: DownloadHistoryRepository,
    private readonly packages: PackageGenerationRepository,
    private readonly catalog: ToolCatalogRepository,
    private readonly artifactStore: PlatformArtifactStore,
  ) {}

  healthCheck() {
    return this.history.healthCheck();
  }

  list(userId: string, input: { page: number; pageSize: number }) {
    return this.history.list(userId, input);
  }

  async submitFeedback(userId: string, downloadId: string, input: DownloadFeedbackRequest) {
    const record = await this.history.submitFeedback(userId, downloadId, input);
    if (!record) throw new AppError(404, "NOT_FOUND", "没有找到这条下载凭证");
    return record;
  }

  async downloadPackage(userId: string, packageVersionId: string) {
    const archive = await this.packages.getReadyArchive(userId, packageVersionId);
    if (!archive) throw new AppError(404, "NOT_FOUND", "工具包文件尚未准备好或不存在");
    const file = await stat(archive.archivePath).catch(() => null);
    if (!file?.isFile()) throw new AppError(410, "NOT_FOUND", "工具包文件已丢失，请重新生成");
    const record = await this.history.create({
      userId,
      kind: archive.record.source === "manual" ? "manual-package" : "ai-package",
      objectName: archive.record.name,
      packageVersionId: archive.record.id,
      sourceTaskId: archive.record.taskId ?? undefined,
      lockedTools: archive.record.lockedTools,
    });
    return this.packageFile(record, archive.record, archive.archivePath, file.size);
  }

  async downloadTool(userId: string, slug: string, versionLabel: string) {
    const tool = await this.catalog.findToolBySlug(slug);
    const versions = tool ? await this.catalog.listVersions(slug) : null;
    const version = versions?.find((item) => item.version === versionLabel);
    if (!tool || !version || version.status !== "published" || !version.downloadUrl) {
      throw new AppError(404, "NOT_FOUND", "没有找到可下载的工具版本");
    }
    const artifact = await this.artifactStore.resolvePublishedArtifact(version.downloadUrl);
    const record = await this.history.create({
      userId,
      kind: tool.parent ? "derived" : "tool",
      objectName: tool.name,
      toolVersionId: version.id,
      lockedTools: [lockedTool(tool, version, tool.problem)],
    });
    return {
      credential: record,
      filePath: artifact.path,
      fileName: `${tool.name}-${version.version}.zip`,
      bytes: artifact.bytes,
    };
  }

  async redownload(userId: string, downloadId: string) {
    const source = await this.history.findById(userId, downloadId);
    if (!source) throw new AppError(404, "NOT_FOUND", "没有找到这条下载凭证");
    if (source.packageVersionId) {
      const archive = await this.packages.getReadyArchive(userId, source.packageVersionId);
      if (!archive) throw new AppError(404, "NOT_FOUND", "原工具包版本已不可用");
      const file = await stat(archive.archivePath).catch(() => null);
      if (!file?.isFile()) throw new AppError(410, "NOT_FOUND", "原工具包文件已丢失");
      const record = await this.history.create({
        userId,
        kind: source.kind,
        objectName: source.objectName,
        packageVersionId: source.packageVersionId,
        sourceTaskId: source.sourceTaskId ?? undefined,
        lockedTools: source.lockedToolDetails,
      });
      return this.packageFile(record, archive.record, archive.archivePath, file.size);
    }
    if (!source.toolVersionId) throw new AppError(409, "CONFLICT", "下载凭证缺少锁定版本");
    const [match] = await this.catalog.findToolsByVersionIds([source.toolVersionId]);
    if (!match || !match.version.downloadUrl) {
      throw new AppError(404, "NOT_FOUND", "原工具版本已下架或不可用");
    }
    const artifact = await this.artifactStore.resolvePublishedArtifact(
      match.version.downloadUrl,
    );
    const record = await this.history.create({
      userId,
      kind: source.kind,
      objectName: source.objectName,
      toolVersionId: source.toolVersionId,
      lockedTools: source.lockedToolDetails,
    });
    return {
      credential: record,
      filePath: artifact.path,
      fileName: `${source.objectName}-${source.toolVersion ?? match.version.version}.zip`,
      bytes: artifact.bytes,
    };
  }

  private packageFile(
    credential: DownloadCredential,
    packageVersion: PackageVersionRecord,
    filePath: string,
    bytes: number,
  ): DownloadFile {
    return {
      credential,
      filePath,
      fileName: `${packageVersion.name}-${packageVersion.version}.zip`,
      bytes,
    };
  }
}
