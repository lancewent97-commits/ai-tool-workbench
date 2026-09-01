import type {
  CreateUploadSessionRequest,
  UploadSession,
} from "@ai-tool-workbench/contracts";
import type { UploadSessionRepository } from "@ai-tool-workbench/db";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { AppError } from "../lib/app-error.js";

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

function safeFileName(value: string) {
  const name = path.basename(value).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return name || "upload.zip";
}

function writable(session: UploadSession) {
  if (session.status !== "uploading") {
    throw new AppError(409, "CONFLICT", "这个上传任务已经不能继续写入");
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    throw new AppError(409, "CONFLICT", "这个上传任务已过期，请重新开始");
  }
}

export class UploadSessionService {
  constructor(
    private readonly repository: UploadSessionRepository,
    private readonly rootDirectory: string,
    private readonly chunkSizeBytes = DEFAULT_CHUNK_SIZE,
  ) {}

  healthCheck() {
    return this.repository.healthCheck();
  }

  async create(ownerId: string, input: CreateUploadSessionRequest) {
    const session = await this.repository.create({
      id: crypto.randomUUID(),
      ownerId,
      purpose: input.purpose,
      fileName: safeFileName(input.fileName),
      expectedBytes: input.expectedBytes,
      chunkSizeBytes: this.chunkSizeBytes,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    });
    await mkdir(this.partDirectory(session.id), { recursive: true });
    return session;
  }

  async get(ownerId: string, uploadId: string) {
    const session = await this.repository.find(ownerId, uploadId);
    if (!session) throw new AppError(404, "NOT_FOUND", "没有找到这个上传任务");
    return session;
  }

  async uploadPart(
    ownerId: string,
    uploadId: string,
    partNumber: number,
    input: Readable,
  ) {
    const session = await this.get(ownerId, uploadId);
    writable(session);
    const expectedPartCount = Math.ceil(session.expectedBytes / session.chunkSizeBytes);
    if (partNumber > expectedPartCount) {
      throw new AppError(400, "BAD_REQUEST", "分片编号超过文件需要的分片数量");
    }

    const directory = this.partDirectory(uploadId);
    await mkdir(directory, { recursive: true });
    const destination = path.join(directory, `${partNumber}.part`);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    const output = createWriteStream(temporary, { flags: "wx" });
    const hash = createHash("sha256");
    let sizeBytes = 0;

    try {
      for await (const chunk of input) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += buffer.length;
        if (sizeBytes > session.chunkSizeBytes) {
          throw new AppError(413, "BAD_REQUEST", "单个上传分片超过允许大小");
        }
        hash.update(buffer);
        if (!output.write(buffer)) {
          await new Promise<void>((resolve) => output.once("drain", resolve));
        }
      }
      await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => (
        error ? reject(error) : resolve()
      )));
      if (sizeBytes === 0) {
        throw new AppError(400, "BAD_REQUEST", "上传分片不能为空");
      }
      await rename(temporary, destination);
    } catch (error) {
      output.destroy();
      await rm(temporary, { force: true });
      throw error;
    }

    try {
      return await this.repository.savePart({
        uploadId,
        ownerId,
        partNumber,
        sizeBytes,
        sha256: hash.digest("hex"),
        storageKey: path.relative(this.rootDirectory, destination),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "UPLOAD_EXPIRED") {
        throw new AppError(409, "CONFLICT", "这个上传任务已过期，请重新开始");
      }
      if (error instanceof Error && error.message === "UPLOAD_NOT_WRITABLE") {
        throw new AppError(409, "CONFLICT", "这个上传任务已经不能继续写入");
      }
      throw error;
    }
  }

  async complete(ownerId: string, uploadId: string) {
    const session = await this.get(ownerId, uploadId);
    writable(session);
    const expectedPartCount = Math.ceil(session.expectedBytes / session.chunkSizeBytes);
    const actualNumbers = session.uploadedParts.map((item) => item.partNumber);
    const expectedNumbers = Array.from({ length: expectedPartCount }, (_, index) => index + 1);
    if (
      actualNumbers.length !== expectedNumbers.length
      || actualNumbers.some((value, index) => value !== expectedNumbers[index])
    ) {
      throw new AppError(409, "CONFLICT", "仍有分片未上传，暂时不能合并文件");
    }
    if (session.uploadedBytes !== session.expectedBytes) {
      throw new AppError(409, "CONFLICT", "已上传大小与原文件不一致，请重新上传异常分片");
    }

    const completedDirectory = path.join(this.rootDirectory, "completed");
    await mkdir(completedDirectory, { recursive: true });
    const destination = path.join(
      completedDirectory,
      `${uploadId}-${safeFileName(session.fileName)}`,
    );
    const temporary = `${destination}.assembling`;
    const output = createWriteStream(temporary, { flags: "w" });
    const hash = createHash("sha256");

    try {
      for (const partNumber of expectedNumbers) {
        const source = createReadStream(path.join(this.partDirectory(uploadId), `${partNumber}.part`));
        for await (const chunk of source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          hash.update(buffer);
          if (!output.write(buffer)) {
            await new Promise<void>((resolve) => output.once("drain", resolve));
          }
        }
      }
      await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => (
        error ? reject(error) : resolve()
      )));
      const file = await stat(temporary);
      if (file.size !== session.expectedBytes) {
        throw new AppError(409, "CONFLICT", "合并后的文件大小不一致");
      }
      await rename(temporary, destination);
    } catch (error) {
      output.destroy();
      await rm(temporary, { force: true });
      throw error;
    }

    const completed = await this.repository.complete(
      ownerId,
      uploadId,
      path.relative(this.rootDirectory, destination),
      hash.digest("hex"),
    );
    await rm(this.partDirectory(uploadId), { recursive: true, force: true });
    return completed;
  }

  async abort(ownerId: string, uploadId: string) {
    await this.get(ownerId, uploadId);
    try {
      const session = await this.repository.abort(ownerId, uploadId);
      await rm(this.partDirectory(uploadId), { recursive: true, force: true });
      return session;
    } catch (error) {
      if (error instanceof Error && error.message === "UPLOAD_NOT_WRITABLE") {
        throw new AppError(409, "CONFLICT", "这个上传任务已经不能取消");
      }
      throw error;
    }
  }

  async consume<T>(
    ownerId: string,
    uploadId: string,
    purpose: "tool" | "return",
    operation: (fileName: string, stream: Readable) => Promise<T>,
  ) {
    const session = await this.get(ownerId, uploadId);
    if (session.status !== "completed" || !session.artifactStorageKey) {
      throw new AppError(409, "CONFLICT", "文件尚未完成上传");
    }
    if (session.purpose !== purpose) {
      throw new AppError(400, "BAD_REQUEST", "上传用途与当前操作不一致");
    }
    const root = path.resolve(this.rootDirectory);
    const artifactPath = path.resolve(root, session.artifactStorageKey);
    if (!artifactPath.startsWith(`${root}${path.sep}`)) {
      throw new AppError(400, "BAD_REQUEST", "上传文件路径不合法");
    }
    try {
      return await operation(session.fileName, createReadStream(artifactPath));
    } finally {
      await rm(artifactPath, { force: true });
    }
  }

  private partDirectory(uploadId: string) {
    return path.join(this.rootDirectory, "parts", uploadId);
  }
}
