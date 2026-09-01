import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type {
  ReturnAssetCandidate,
  ReturnReviewDecision,
} from "@ai-tool-workbench/contracts";
import type {
  IdentityRepository,
  PublishedReturnAssetInput,
  ReturnSubmissionRepository,
} from "@ai-tool-workbench/db";
import * as yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import { AppError } from "../lib/app-error.js";

function safeSegment(value: string) {
  const segment = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
  return segment || "asset";
}

function openArchive(archivePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("无法打开回传ZIP"));
      else resolve(zip);
    });
  });
}

async function extractEntry(
  archivePath: string,
  entryPath: string,
  destination: string,
) {
  const zip = await openArchive(archivePath);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        if (error) reject(error);
        else resolve();
      };
      zip.once("error", finish);
      zip.once("end", () => finish(new Error(`回传包中不存在资产文件：${entryPath}`)));
      zip.on("entry", (entry: Entry) => {
        const normalized = entry.fileName.replaceAll("\\", "/").replace(/^\.\/+/, "");
        if (normalized !== entryPath && !normalized.endsWith(`/${entryPath}`)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            finish(error ?? new Error("无法读取回传资产"));
            return;
          }
          void pipeline(stream, createWriteStream(destination, { flags: "wx" }))
            .then(() => finish())
            .catch(finish);
        });
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

async function fileFacts(filePath: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

export class ReturnReviewService {
  constructor(
    private readonly returns: ReturnSubmissionRepository,
    private readonly identity: IdentityRepository,
    private readonly options: { publishedDirectory: string },
  ) {}

  list(input: { page: number; pageSize: number }) {
    return this.returns.listForReview(input);
  }

  async get(returnId: string) {
    const record = await this.returns.findForReview(returnId);
    if (!record) throw new AppError(404, "NOT_FOUND", "没有找到这条回传记录");
    return record;
  }

  async decide(
    reviewerUserId: string,
    returnId: string,
    decision: ReturnReviewDecision,
  ) {
    const review = await this.get(returnId);
    if (review.submission.state !== "reviewing") {
      throw new AppError(409, "CONFLICT", "这条回传已经不在待审核队列");
    }
    if (decision.decision === "rejected") {
      const rejected = await this.returns.rejectReview({
        reviewerUserId,
        returnId,
        reason: decision.reason,
      });
      if (!rejected) throw new AppError(409, "CONFLICT", "审核状态已经变化，请刷新");
      await this.identity.recordAuditEvent({
        actorUserId: reviewerUserId,
        action: "return.review.rejected",
        objectType: "return",
        objectId: returnId,
        metadata: { version: rejected.version },
      });
      return rejected;
    }

    const version = review.submission.versions.at(-1);
    if (!version?.retained || !version.assetCandidates.length) {
      throw new AppError(409, "CONFLICT", "当前版本没有可发布的安全资产");
    }
    const source = await this.returns.findVersionFile(
      review.uploader.id,
      returnId,
      version.id,
    );
    if (!source) throw new AppError(410, "NOT_FOUND", "当前回传文件已经不存在");
    await mkdir(this.options.publishedDirectory, { recursive: true });
    const prepared: PublishedReturnAssetInput[] = [];
    const createdFiles: string[] = [];
    const temporaryFiles: string[] = [];
    try {
      for (const [index, candidate] of version.assetCandidates.entries()) {
        const fileName = `${returnId}-${safeSegment(candidate.id)}.zip`;
        const destination = path.join(this.options.publishedDirectory, fileName);
        const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
        temporaryFiles.push(temporary);
        if (candidate.artifactPath) {
          await extractEntry(source.path, candidate.artifactPath, temporary);
        } else {
          await copyFile(source.path, temporary);
        }
        await rename(temporary, destination);
        createdFiles.push(destination);
        const facts = await fileFacts(destination);
        prepared.push({
          candidate,
          slug: `return-${returnId.slice(0, 8)}-${index + 1}`,
          artifactPath: destination,
          artifactBytes: facts.bytes,
          artifactSha256: facts.sha256,
          downloadUrl: `/published-tools/${encodeURIComponent(fileName)}`,
        });
      }
      const published = await this.returns.approveReview({
        reviewerUserId,
        returnId,
        assets: prepared,
      });
      if (!published) throw new AppError(409, "CONFLICT", "审核状态已经变化，请刷新");
      await this.identity.recordAuditEvent({
        actorUserId: reviewerUserId,
        action: "return.review.approved",
        objectType: "return",
        objectId: returnId,
        metadata: {
          version: published.version,
          assetCount: published.assets.length,
        },
      });
      return published;
    } catch (error) {
      await Promise.all(
        [...createdFiles, ...temporaryFiles].map((file) => rm(file, { force: true })),
      );
      if (error instanceof AppError) throw error;
      if (
        error instanceof Error &&
        ["RETURN_ASSET_MISMATCH", "RETURN_DERIVED_SOURCE_INVALID"].includes(error.message)
      ) {
        throw new AppError(409, "CONFLICT", "发布清单与当前回传来源不一致，请重新预检查");
      }
      throw error;
    }
  }

  async versionFile(returnId: string, versionId: string) {
    const review = await this.get(returnId);
    const file = await this.returns.findVersionFile(
      review.uploader.id,
      returnId,
      versionId,
    );
    if (!file) throw new AppError(404, "NOT_FOUND", "回传文件不存在或已被安全删除");
    const info = await stat(file.path).catch(() => null);
    if (!info?.isFile()) throw new AppError(410, "NOT_FOUND", "回传文件已丢失");
    return {
      stream: createReadStream(file.path),
      fileName: file.fileName,
      bytes: info.size,
    };
  }
}
