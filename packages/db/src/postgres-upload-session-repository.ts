import type {
  UploadPart,
  UploadPurpose,
  UploadSession,
  UploadStatus,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type {
  CreateUploadSessionInput,
  SaveUploadPartInput,
  UploadSessionRepository,
} from "./upload-session-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function part(row: Row): UploadPart {
  return {
    partNumber: Number(row.part_number),
    sizeBytes: Number(row.size_bytes),
    sha256: String(row.sha256),
  };
}

async function findSession(sql: Sql, ownerId: string, uploadId: string) {
  const [row] = await sql`
    SELECT *
    FROM upload_sessions
    WHERE id = ${uploadId} AND owner_id = ${ownerId}
  `;
  if (!row) return null;
  const parts = await sql`
    SELECT part_number, size_bytes, sha256
    FROM upload_parts
    WHERE upload_id = ${uploadId}
    ORDER BY part_number
  `;
  const uploadedParts = parts.map(part);
  return {
    id: String(row.id),
    purpose: String(row.purpose) as UploadPurpose,
    fileName: String(row.file_name),
    expectedBytes: Number(row.expected_bytes),
    chunkSizeBytes: Number(row.chunk_size_bytes),
    status: String(row.status) as UploadStatus,
    uploadedParts,
    uploadedBytes: uploadedParts.reduce((sum, item) => sum + item.sizeBytes, 0),
    expiresAt: iso(row.expires_at),
    artifactStorageKey: row.artifact_storage_key
      ? String(row.artifact_storage_key)
      : null,
    artifactSha256: row.artifact_sha256 ? String(row.artifact_sha256) : null,
  } satisfies UploadSession;
}

export class PostgresUploadSessionRepository implements UploadSessionRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresUploadSessionRepository(postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async create(input: CreateUploadSessionInput) {
    await this.sql`
      INSERT INTO upload_sessions (
        id, owner_id, purpose, file_name, expected_bytes,
        chunk_size_bytes, expires_at
      ) VALUES (
        ${input.id}, ${input.ownerId}, ${input.purpose}, ${input.fileName},
        ${input.expectedBytes}, ${input.chunkSizeBytes}, ${input.expiresAt}
      )
    `;
    return (await findSession(this.sql, input.ownerId, input.id))!;
  }

  find(ownerId: string, uploadId: string) {
    return findSession(this.sql, ownerId, uploadId);
  }

  async savePart(input: SaveUploadPartInput) {
    await this.sql.begin(async (transaction) => {
      const [session] = await transaction`
        SELECT status, expires_at
        FROM upload_sessions
        WHERE id = ${input.uploadId} AND owner_id = ${input.ownerId}
        FOR UPDATE
      `;
      if (!session || session.status !== "uploading") {
        throw new Error("UPLOAD_NOT_WRITABLE");
      }
      if (new Date(session.expires_at as string).getTime() <= Date.now()) {
        await transaction`
          UPDATE upload_sessions SET status = 'expired', updated_at = now()
          WHERE id = ${input.uploadId}
        `;
        throw new Error("UPLOAD_EXPIRED");
      }
      await transaction`
        INSERT INTO upload_parts (
          upload_id, part_number, size_bytes, sha256, storage_key
        ) VALUES (
          ${input.uploadId}, ${input.partNumber}, ${input.sizeBytes},
          ${input.sha256}, ${input.storageKey}
        )
        ON CONFLICT (upload_id, part_number) DO UPDATE SET
          size_bytes = EXCLUDED.size_bytes,
          sha256 = EXCLUDED.sha256,
          storage_key = EXCLUDED.storage_key,
          created_at = now()
      `;
      await transaction`
        UPDATE upload_sessions SET updated_at = now() WHERE id = ${input.uploadId}
      `;
    });
    return (await findSession(this.sql, input.ownerId, input.uploadId))!;
  }

  async complete(
    ownerId: string,
    uploadId: string,
    artifactStorageKey: string,
    artifactSha256: string,
  ) {
    const [row] = await this.sql`
      UPDATE upload_sessions SET
        status = 'completed',
        artifact_storage_key = ${artifactStorageKey},
        artifact_sha256 = ${artifactSha256},
        updated_at = now()
      WHERE id = ${uploadId} AND owner_id = ${ownerId} AND status = 'uploading'
      RETURNING id
    `;
    if (!row) throw new Error("UPLOAD_NOT_WRITABLE");
    return (await findSession(this.sql, ownerId, uploadId))!;
  }

  async abort(ownerId: string, uploadId: string) {
    const [row] = await this.sql`
      UPDATE upload_sessions SET status = 'aborted', updated_at = now()
      WHERE id = ${uploadId} AND owner_id = ${ownerId} AND status = 'uploading'
      RETURNING id
    `;
    if (!row) throw new Error("UPLOAD_NOT_WRITABLE");
    return (await findSession(this.sql, ownerId, uploadId))!;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
