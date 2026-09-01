import type {
  AdminToolUploadResponse,
  CreateToolAssetRequest,
  CreateToolAssetVersionRequest,
  ToolAssetAdminQuery,
  UpdateToolAssetRequest,
} from "@ai-tool-workbench/contracts";
import { MAX_UPLOAD_BYTES } from "@ai-tool-workbench/contracts";
import {
  ToolAssetInvariantError,
  type IdentityRepository,
  type ToolAssetRepository,
} from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  buildToolFixPrompt,
  precheckToolArchive,
} from "./return-precheck-service.js";

function safeZipName(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new AppError(400, "BAD_REQUEST", "上传文件名格式不正确");
  }
  const name = path.basename(decoded)
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(0, 180);
  if (!name.toLowerCase().endsWith(".zip")) {
    throw new AppError(400, "BAD_REQUEST", "只允许上传 ZIP 工具包");
  }
  return name || "tool-package.zip";
}

export class ToolAssetService {
  constructor(
    private readonly repository: ToolAssetRepository,
    private readonly identity: IdentityRepository,
    private readonly options?: {
      uploadDirectory: string;
      standardVersion?: string;
    },
  ) {}

  healthCheck() {
    return this.repository.healthCheck();
  }

  list(query: ToolAssetAdminQuery) {
    return this.repository.listAssets(query);
  }

  async get(toolId: string) {
    const tool = await this.repository.findAsset(toolId);
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具资产");
    return tool;
  }

  async create(actorUserId: string, input: CreateToolAssetRequest) {
    const tool = await this.run(() => this.repository.createAsset(actorUserId, input));
    await this.audit(actorUserId, "tool.created", tool.id, {
      slug: tool.slug,
      origin: tool.origin,
    });
    return tool;
  }

  async upload(
    actorUserId: string,
    fileNameInput: string,
    stream: Readable,
  ): Promise<AdminToolUploadResponse> {
    if (!this.options) {
      throw new AppError(503, "INTERNAL_ERROR", "工具文件存储尚未配置");
    }
    const fileName = safeZipName(fileNameInput);
    await mkdir(this.options.uploadDirectory, { recursive: true });
    const storedName = `${crypto.randomUUID()}-${fileName}`;
    const finalPath = path.join(this.options.uploadDirectory, storedName);
    const temporaryPath = `${finalPath}.part`;
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD_BYTES) {
          callback(new AppError(400, "BAD_REQUEST", "工具包超过当前 20GB 上传上限"));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(stream, meter, createWriteStream(temporaryPath, { flags: "wx" }));
      if (!bytes) throw new AppError(400, "BAD_REQUEST", "上传的 ZIP 文件为空");
      const artifactSha256 = hash.digest("hex");
      const precheck = await precheckToolArchive(temporaryPath);
      const blocked = precheck.containsSensitiveContent
        || precheck.findings.some((item) => item.level === "required");
      if (blocked) {
        await rm(temporaryPath, { force: true });
        await this.identity.recordAuditEvent({
          actorUserId,
          action: "tool.upload.rejected",
          objectType: "tool-upload",
          objectId: artifactSha256,
          metadata: {
          fileName,
          artifactSha256,
          },
        });
        return {
          accepted: false,
          fileName,
          artifactStorageKey: null,
          artifactSizeBytes: bytes,
          artifactSha256,
          downloadUrl: null,
          findings: precheck.findings,
          fixPrompt: buildToolFixPrompt(
            precheck.findings,
            this.options.standardVersion ?? "v0.28",
          ),
        };
      }
      await rename(temporaryPath, finalPath);
      await this.identity.recordAuditEvent({
        actorUserId,
        action: "tool.upload.accepted",
        objectType: "tool-upload",
        objectId: artifactSha256,
        metadata: {
          fileName,
          artifactSha256,
        },
      });
      return {
        accepted: true,
        fileName,
        artifactStorageKey: finalPath,
        artifactSizeBytes: bytes,
        artifactSha256,
        downloadUrl: `/published-tools/${encodeURIComponent(storedName)}`,
        findings: precheck.findings,
        fixPrompt: null,
      };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error instanceof AppError) throw error;
      throw error;
    }
  }

  async update(
    actorUserId: string,
    toolId: string,
    input: UpdateToolAssetRequest,
  ) {
    const tool = await this.run(() =>
      this.repository.updateAsset(actorUserId, toolId, input)
    );
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具资产");
    await this.audit(actorUserId, "tool.metadata.updated", tool.id, {
      slug: tool.slug,
    });
    return tool;
  }

  async addVersion(
    actorUserId: string,
    toolId: string,
    input: CreateToolAssetVersionRequest,
  ) {
    const tool = await this.run(() =>
      this.repository.addVersion(actorUserId, toolId, input)
    );
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具资产");
    const version = tool.versions.find((item) => item.version === input.version);
    await this.audit(actorUserId, "tool.version.created", tool.id, {
      versionId: version?.id,
      version: input.version,
    });
    return tool;
  }

  async publishVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
  ) {
    const tool = await this.run(() =>
      this.repository.publishVersion(actorUserId, toolId, versionId)
    );
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具版本");
    await this.audit(actorUserId, "tool.version.published", tool.id, {
      versionId,
      defaultLatestVersionId: tool.latestVersionId,
    });
    return tool;
  }

  async offlineVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
    reason: string,
  ) {
    const tool = await this.run(() =>
      this.repository.offlineVersion(actorUserId, toolId, versionId, reason)
    );
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具版本");
    await this.audit(actorUserId, "tool.version.offline", tool.id, {
      versionId,
      reason,
      fallbackLatestVersionId: tool.latestVersionId,
    });
    return tool;
  }

  async publish(actorUserId: string, toolId: string) {
    const tool = await this.repository.publishAsset(actorUserId, toolId);
    if (!tool) {
      throw new AppError(
        409,
        "CONFLICT",
        "工具没有可重新上架的默认版本，请先选择并上架一个版本",
      );
    }
    await this.audit(actorUserId, "tool.published", tool.id, {
      defaultLatestVersionId: tool.latestVersionId,
    });
    return tool;
  }

  async offline(actorUserId: string, toolId: string, reason: string) {
    const tool = await this.repository.offlineAsset(actorUserId, toolId, reason);
    if (!tool) throw new AppError(404, "NOT_FOUND", "没有找到这个工具资产");
    await this.audit(actorUserId, "tool.offline", tool.id, { reason });
    return tool;
  }

  private async run<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ToolAssetInvariantError) {
        throw new AppError(409, "CONFLICT", error.message);
      }
      throw error;
    }
  }

  private audit(
    actorUserId: string,
    action: string,
    objectId: string,
    metadata: Record<string, string | undefined | null>,
  ) {
    return this.identity.recordAuditEvent({
      actorUserId,
      action,
      objectType: "tool",
      objectId,
      metadata,
    });
  }
}
