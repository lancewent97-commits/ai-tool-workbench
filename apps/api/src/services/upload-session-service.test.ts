import type {
  UploadSession,
} from "@ai-tool-workbench/contracts";
import type {
  CreateUploadSessionInput,
  SaveUploadPartInput,
  UploadSessionRepository,
} from "@ai-tool-workbench/db";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { UploadSessionService } from "./upload-session-service.js";

class MemoryUploads implements UploadSessionRepository {
  readonly sessions = new Map<string, UploadSession>();

  async healthCheck() {}
  async close() {}

  async create(input: CreateUploadSessionInput) {
    const session: UploadSession = {
      id: input.id,
      purpose: input.purpose,
      fileName: input.fileName,
      expectedBytes: input.expectedBytes,
      chunkSizeBytes: input.chunkSizeBytes,
      status: "uploading",
      uploadedParts: [],
      uploadedBytes: 0,
      expiresAt: input.expiresAt.toISOString(),
      artifactStorageKey: null,
      artifactSha256: null,
    };
    this.sessions.set(`${input.ownerId}:${input.id}`, session);
    return structuredClone(session);
  }

  async find(ownerId: string, uploadId: string) {
    return structuredClone(this.sessions.get(`${ownerId}:${uploadId}`) ?? null);
  }

  async savePart(input: SaveUploadPartInput) {
    const key = `${input.ownerId}:${input.uploadId}`;
    const session = this.sessions.get(key)!;
    session.uploadedParts = [
      ...session.uploadedParts.filter((item) => item.partNumber !== input.partNumber),
      {
        partNumber: input.partNumber,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
      },
    ].sort((a, b) => a.partNumber - b.partNumber);
    session.uploadedBytes = session.uploadedParts.reduce(
      (sum, item) => sum + item.sizeBytes,
      0,
    );
    return structuredClone(session);
  }

  async complete(
    ownerId: string,
    uploadId: string,
    artifactStorageKey: string,
    artifactSha256: string,
  ) {
    const session = this.sessions.get(`${ownerId}:${uploadId}`)!;
    session.status = "completed";
    session.artifactStorageKey = artifactStorageKey;
    session.artifactSha256 = artifactSha256;
    return structuredClone(session);
  }

  async abort(ownerId: string, uploadId: string) {
    const session = this.sessions.get(`${ownerId}:${uploadId}`)!;
    session.status = "aborted";
    return structuredClone(session);
  }
}

test("resumable upload joins ordered parts and records checksum", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-upload-"));
  try {
    const repository = new MemoryUploads();
    const service = new UploadSessionService(repository, root, 4);
    const session = await service.create("owner", {
      purpose: "tool",
      fileName: "../example.zip",
      expectedBytes: 7,
    });

    await service.uploadPart("owner", session.id, 2, Readable.from(Buffer.from("efg")));
    const resumed = await service.uploadPart(
      "owner",
      session.id,
      1,
      Readable.from(Buffer.from("abcd")),
    );
    assert.deepEqual(resumed.uploadedParts.map((part) => part.partNumber), [1, 2]);

    const completed = await service.complete("owner", session.id);
    assert.equal(completed.status, "completed");
    assert.match(completed.artifactSha256!, /^[0-9a-f]{64}$/);
    assert.equal(
      await readFile(path.join(root, completed.artifactStorageKey!), "utf8"),
      "abcdefg",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resumable upload refuses completion with missing parts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workbench-upload-"));
  try {
    const service = new UploadSessionService(new MemoryUploads(), root, 4);
    const session = await service.create("owner", {
      purpose: "return",
      fileName: "return.zip",
      expectedBytes: 7,
    });
    await service.uploadPart("owner", session.id, 1, Readable.from(Buffer.from("abcd")));
    await assert.rejects(
      () => service.complete("owner", session.id),
      /仍有分片未上传/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
