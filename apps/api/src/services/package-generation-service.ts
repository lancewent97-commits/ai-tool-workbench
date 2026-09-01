import type {
  LockedPackageTool,
  PackageDraft,
  PackageToolSelection,
  ToolCatalogItem,
  ToolVersionSummary,
} from "@ai-tool-workbench/contracts";
import type {
  PackageGenerationRepository,
  TaskWorkspaceRepository,
  ToolCatalogRepository,
} from "@ai-tool-workbench/db";
import {
  buildPackageArchive,
  createStartPrompt,
  type LockedTool,
  type PackageBuildInput,
} from "@ai-tool-workbench/package-builder";
import { AppError } from "../lib/app-error.js";
import type { PlatformArtifactStore } from "./platform-artifact-store.js";

type PackageGenerationPaths = {
  outputDirectory: string;
  productionStandard: string;
};

export function assertPackageDraftSafe(draft: PackageDraft) {
  const text = JSON.stringify({
    name: draft.name,
    goal: draft.goal,
    deliverables: draft.deliverables,
    toolPurposes: draft.tools.map((tool) => tool.purpose),
    plannedComponents: draft.plannedComponents,
  });
  const credentials = [
    /\b(?:sk|api)[-_][a-z0-9_-]{16,}\b/i,
    /(?:password|passwd|密码)\s*[:=：]\s*\S+/i,
    /(?:token|secret|api[_ -]?key)\s*[:=：]\s*\S+/i,
    /authorization\s*:\s*bearer\s+\S+/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  if (credentials.some((pattern) => pattern.test(text))) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "工具包任务中疑似包含密钥、密码或认证信息，请删除或改成占位符后再生成",
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicLockedTool(tool: LockedTool): LockedPackageTool {
  return {
    toolId: tool.toolId,
    toolSlug: tool.toolSlug,
    toolName: tool.toolName,
    toolKind: tool.toolKind,
    versionId: tool.versionId,
    version: tool.version,
    purpose: tool.purpose,
    replaceable: tool.replaceable,
    problem: tool.problem,
    result: tool.result,
    verification: tool.verification,
    standardVersion: tool.standardVersion,
    risks: tool.risks,
  };
}

export class PackageGenerationService {
  private readonly activeBuilds = new Set<Promise<void>>();

  constructor(
    private readonly workspace: TaskWorkspaceRepository,
    private readonly catalog: ToolCatalogRepository,
    private readonly repository: PackageGenerationRepository,
    private readonly paths: PackageGenerationPaths,
    private readonly artifactStore: PlatformArtifactStore,
  ) {}

  healthCheck() {
    return this.repository.healthCheck();
  }

  recoverInterrupted() {
    return this.repository.recoverInterrupted(
      "生成服务在工具包完成前重启，本次生成已终止，请重新生成",
    );
  }

  async stop() {
    await Promise.allSettled(this.activeBuilds);
  }

  getVersion(userId: string, packageVersionId: string) {
    return this.repository.getVersion(userId, packageVersionId);
  }

  async generate(userId: string, draftId: string) {
    const draftRecord = await this.workspace.getPackageDraft(userId, draftId);
    if (!draftRecord) throw new AppError(404, "NOT_FOUND", "没有找到这个工具包草稿");
    assertPackageDraftSafe(draftRecord.draft);
    const lockedTools = await Promise.all(
      draftRecord.draft.tools.map((selection) => this.resolveTool(selection)),
    );
    const provisional: PackageBuildInput = {
      packageVersionId: crypto.randomUUID(),
      packageVersion: "pending",
      createdAt: new Date().toISOString(),
      draft: draftRecord.draft,
      tools: lockedTools,
      productionStandard: this.paths.productionStandard,
    };
    const reserved = await this.repository.reserveVersion(
      userId,
      draftRecord.draft,
      lockedTools.map(publicLockedTool),
      createStartPrompt(provisional),
    );
    const buildInput: PackageBuildInput = {
      ...provisional,
      packageVersionId: reserved.record.id,
      packageVersion: reserved.record.version,
      createdAt: reserved.record.createdAt,
      draft: reserved.draft,
    };
    const build = this.buildAndFinalize(userId, reserved.record.id, buildInput);
    this.activeBuilds.add(build);
    void build.then(
      () => this.activeBuilds.delete(build),
      () => this.activeBuilds.delete(build),
    );
    return reserved.record;
  }

  private async buildAndFinalize(
    userId: string,
    packageVersionId: string,
    buildInput: PackageBuildInput,
  ) {
    try {
      const artifact = await buildPackageArchive(buildInput, this.paths.outputDirectory);
      await this.repository.markReady(userId, packageVersionId, {
        startPrompt: artifact.startPrompt,
        archivePath: artifact.archivePath,
        archiveBytes: artifact.bytes,
        archiveSha256: artifact.sha256,
      });
    } catch (error) {
      await this.repository.markFailed(
        userId,
        packageVersionId,
        error instanceof Error ? error.message : "生成工具包失败",
      );
    }
  }

  private async resolveTool(selection: PackageToolSelection): Promise<LockedTool> {
    let match: { tool: ToolCatalogItem; version: ToolVersionSummary } | undefined;
    if (isUuid(selection.versionId)) {
      const [byVersion] = await this.catalog.findToolsByVersionIds([selection.versionId]);
      if (byVersion && (
        byVersion.tool.id === selection.toolId
        || byVersion.tool.slug === selection.toolId
      )) match = byVersion;
    } else {
      const tool = await this.catalog.findToolBySlug(selection.toolId);
      const versions = tool ? await this.catalog.listVersions(tool.slug) : null;
      const version = versions?.find((item) =>
        item.id === selection.versionId
        || `${tool?.slug}-${item.version}` === selection.versionId,
      );
      if (tool && version) match = { tool, version };
    }
    if (!match || match.version.status !== "published" || !match.version.downloadUrl) {
      throw new AppError(409, "CONFLICT", "工具包中的某个锁定版本已不可用，请返回重新选择");
    }
    const artifact = await this.artifactStore.resolvePublishedArtifact(
      match.version.downloadUrl,
    );
    return {
      toolId: match.tool.id,
      toolSlug: match.tool.slug,
      toolName: match.tool.name,
      toolKind: match.tool.kind,
      versionId: match.version.id,
      version: match.version.version,
      purpose: selection.purpose,
      replaceable: selection.replaceable,
      problem: match.tool.problem,
      result: match.tool.result,
      principle: match.tool.principle,
      verification: match.version.verification,
      standardVersion: match.version.standardVersion,
      risks: match.version.risks,
      artifactPath: artifact.path,
      artifactDownloadUrl: match.version.downloadUrl,
    };
  }

}
