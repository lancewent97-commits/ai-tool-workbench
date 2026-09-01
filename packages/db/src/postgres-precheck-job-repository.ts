import type {
  PrecheckJob,
  PrecheckJobKind,
  PrecheckJobStatus,
} from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import type { JsonValue } from "./identity-repository.js";
import type {
  ClaimedPrecheckJob,
  PrecheckJobRepository,
} from "./precheck-job-repository.js";

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
function nullableIso(value: unknown) {
  return value ? iso(value) : null;
}

function mapJob(row: Row): PrecheckJob {
  return {
    id: String(row.id),
    uploadId: String(row.upload_id),
    kind: String(row.kind) as PrecheckJobKind,
    status: String(row.status) as PrecheckJobStatus,
    result: row.result ?? null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: iso(row.created_at),
    startedAt: nullableIso(row.started_at),
    finishedAt: nullableIso(row.finished_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresPrecheckJobRepository implements PrecheckJobRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresPrecheckJobRepository(postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async create(input: {
    id: string;
    ownerId: string;
    uploadId: string;
    kind: PrecheckJobKind;
    context: Record<string, JsonValue>;
  }) {
    const [row] = await this.sql`
      INSERT INTO precheck_jobs (id, owner_id, upload_id, kind, context)
      VALUES (
        ${input.id}, ${input.ownerId}, ${input.uploadId}, ${input.kind},
        ${this.sql.json(input.context)}
      )
      ON CONFLICT (upload_id) DO UPDATE SET updated_at = precheck_jobs.updated_at
      RETURNING *
    `;
    return mapJob(row!);
  }

  async find(ownerId: string, jobId: string) {
    const [row] = await this.sql`
      SELECT * FROM precheck_jobs
      WHERE id = ${jobId} AND owner_id = ${ownerId}
    `;
    return row ? mapJob(row) : null;
  }

  async recoverInterrupted() {
    const rows = await this.sql`
      UPDATE precheck_jobs
      SET status = 'queued',
          started_at = null,
          updated_at = now()
      WHERE status = 'running'
      RETURNING id
    `;
    return rows.length;
  }

  async claimNext(): Promise<ClaimedPrecheckJob | null> {
    return this.sql.begin(async (transaction) => {
      const [selected] = await transaction`
        SELECT id
        FROM precheck_jobs
        WHERE status = 'queued'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!selected) return null;
      const [row] = await transaction`
        UPDATE precheck_jobs
        SET status = 'running', started_at = now(), updated_at = now()
        WHERE id = ${selected.id}
        RETURNING *
      `;
      return {
        ...mapJob(row!),
        ownerId: String(row!.owner_id),
        context: (row!.context ?? {}) as Record<string, JsonValue>,
      };
    });
  }

  async succeed(jobId: string, result: JsonValue) {
    await this.sql`
      UPDATE precheck_jobs
      SET status = 'succeeded',
          result = ${this.sql.json(result)},
          error_message = null,
          finished_at = now(),
          updated_at = now()
      WHERE id = ${jobId}
    `;
  }

  async fail(jobId: string, message: string) {
    await this.sql`
      UPDATE precheck_jobs
      SET status = 'failed',
          error_message = ${message.slice(0, 2000)},
          finished_at = now(),
          updated_at = now()
      WHERE id = ${jobId}
    `;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
