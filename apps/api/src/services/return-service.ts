import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  DownloadCredential,
  ReturnAssetCandidate,
} from "@ai-tool-workbench/contracts";
import { MAX_UPLOAD_BYTES } from "@ai-tool-workbench/contracts";
import type { DownloadHistoryRepository, ReturnSubmissionRepository } from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";
import { buildFixPrompt, precheckReturnArchive } from "./return-precheck-service.js";

function safeFileName(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new AppError(400, "BAD_REQUEST", "上传文件名格式不正确");
  }
  const name = path.basename(decoded).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180);
  if (!name.toLowerCase().endsWith(".zip")) {
    throw new AppError(400, "BAD_REQUEST", "只允许上传ZIP格式的净化回传包");
  }
  return name || "return-package.zip";
}

function defaultAssetCandidate(
  source: DownloadCredential,
  standardVersion: string,
): ReturnAssetCandidate {
  const locked = source.lockedToolDetails[0];
  const derived = Boolean(source.toolVersionId && locked);
  return {
    id: "complete-return-package",
    type: derived ? "derived" : "composite",
    name: `${source.objectName} · 回传版`,
    problem: locked?.problem || `复用本次回传沉淀的${source.objectName}能力`,
    result: locked?.result || "可下载并交给本地 Agent 使用的完整工具包",
    principle: "保留回传包中的目标、工具、约束、说明和验证记录，按统一入口交给本地 Agent 使用。",
    kind: derived ? locked?.toolKind ?? "executable" : "composite",
    version: "v1.0.0",
    verification: locked?.verification ?? "unverified",
    standardVersion,
    risks: locked?.risks ?? [],
    reason: derived
      ? "本次回传来源于单个工具版本，完整成果作为该主工具的衍生工具发布。"
      : "完整回传包能够复用本次目标、工具组合与验收要求，作为组合工具发布。",
    artifactPath: null,
    sourceToolId: derived ? locked?.toolId ?? null : null,
    sourceVersionId: derived ? locked?.versionId ?? null : null,
    difference: derived ? "用户基于来源版本完成本地调整并回传。" : null,
    moduleSlugs: [],
    categorySlug: derived ? null : "composite",
    tagSlugs: [],
  };
}

export class ReturnService {
  constructor(
    private readonly returns: ReturnSubmissionRepository,
    private readonly downloads: DownloadHistoryRepository,
    private readonly options: {
      uploadDirectory: string;
      standardVersion: string;
    },
  ) {}

  healthCheck() {
    return this.returns.healthCheck();
  }

  list(userId: string, input: { page: number; pageSize: number }) {
    return this.returns.list(userId, input);
  }

  async get(userId: string, returnId: string) {
    const record = await this.returns.findById(userId, returnId);
    if (!record) throw new AppError(404, "NOT_FOUND", "没有找到这条回传记录");
    return record;
  }

  async precheck(
    userId: string,
    input: {
      sourceDownloadId: string;
      returnId?: string;
      fileName: string;
      stream: Readable;
    },
  ) {
    const source = await this.downloads.findById(userId, input.sourceDownloadId);
    if (!source) throw new AppError(404, "NOT_FOUND", "没有找到来源下载凭证");
    if (input.returnId) await this.get(userId, input.returnId);

    const fileName = safeFileName(input.fileName);
    await mkdir(this.options.uploadDirectory, { recursive: true });
    const archivePath = path.join(
      this.options.uploadDirectory,
      `${crypto.randomUUID()}-${fileName}`,
    );
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD_BYTES) {
          callback(new AppError(400, "BAD_REQUEST", "回传包超过当前 20GB 上传上限"));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(input.stream, meter, createWriteStream(archivePath, { flags: "wx" }));
      if (!bytes) throw new AppError(400, "BAD_REQUEST", "上传的ZIP文件为空");
      const expectedSourceIds = [
        source.packageVersionId,
        source.toolVersionId,
        ...source.lockedToolDetails.map((tool) => tool.versionId),
      ].filter((value): value is string => Boolean(value));
      const precheck = await precheckReturnArchive(archivePath, expectedSourceIds);
      const candidates = precheck.assetCandidates.length
        ? precheck.assetCandidates
        : [defaultAssetCandidate(source, this.options.standardVersion)];
      const fixPrompt = buildFixPrompt(precheck.findings, this.options.standardVersion);
      const required = precheck.findings.filter((item) => item.level === "required");
      if (precheck.containsSensitiveContent) {
        await rm(archivePath, { force: true });
      }
      return await this.returns.addVersion({
        userId,
        returnId: input.returnId,
        sourceDownloadId: source.id,
        name: `${source.objectName} · 回传版`,
        fileName,
        archivePath: precheck.containsSensitiveContent ? undefined : archivePath,
        archiveBytes: bytes,
        archiveSha256: hash.digest("hex"),
        precheckStatus: required.length ? "failed" : "passed",
        findings: precheck.findings,
        assetCandidates: candidates,
        fixPrompt,
      });
    } catch (error) {
      await rm(archivePath, { force: true });
      if (error instanceof AppError) throw error;
      if (error instanceof Error) {
        if (error.message === "RETURN_NOT_FOUND") {
          throw new AppError(404, "NOT_FOUND", "没有找到要更新的回传记录");
        }
        if (error.message === "RETURN_SOURCE_MISMATCH") {
          throw new AppError(409, "CONFLICT", "新版本必须沿用原回传的下载凭证");
        }
      }
      throw error;
    }
  }

  async submit(userId: string, returnId: string) {
    const record = await this.returns.submitForReview(userId, returnId);
    if (!record) {
      throw new AppError(
        409,
        "CONFLICT",
        "只有当前版本自动检查通过后才能提交人工审核",
      );
    }
    return record;
  }

  async setListing(userId: string, returnId: string, listed: boolean) {
    const record = await this.returns.setListing(userId, returnId, listed);
    if (!record) {
      throw new AppError(
        409,
        "CONFLICT",
        "只有已经发布或已经下架的回传贡献可以调整上架状态",
      );
    }
    return record;
  }

  async versionFile(userId: string, returnId: string, versionId: string) {
    const file = await this.returns.findVersionFile(userId, returnId, versionId);
    if (!file) {
      throw new AppError(404, "NOT_FOUND", "回传文件不存在或因敏感风险已被删除");
    }
    const info = await stat(file.path).catch(() => null);
    if (!info?.isFile()) throw new AppError(410, "NOT_FOUND", "回传文件已丢失");
    return {
      stream: createReadStream(file.path),
      fileName: file.fileName,
      bytes: info.size,
    };
  }
}
