import {
  returnPrecheckQuerySchema,
  type PrecheckJob,
} from "@ai-tool-workbench/contracts";
import type {
  JsonValue,
  PrecheckJobRepository,
} from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";
import type { ReturnService } from "./return-service.js";
import type { ToolAssetService } from "./tool-asset-service.js";
import type { UploadSessionService } from "./upload-session-service.js";

function serializable(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
export class PrecheckJobService {
  private timer: NodeJS.Timeout | null = null;
  private working = false;

  constructor(
    private readonly repository: PrecheckJobRepository,
    private readonly uploads: UploadSessionService,
    private readonly toolAssets: ToolAssetService,
    private readonly returns: ReturnService,
  ) {}

  async start() {
    await this.repository.recoverInterrupted();
    await this.tick();
    this.timer = setInterval(() => void this.tick(), 500);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async createToolJob(ownerId: string, uploadId: string) {
    await this.uploads.get(ownerId, uploadId);
    return this.repository.create({
      id: crypto.randomUUID(),
      ownerId,
      uploadId,
      kind: "tool",
      context: {},
    });
  }

  async createReturnJob(
    ownerId: string,
    uploadId: string,
    context: { sourceDownloadId: string; returnId?: string },
  ) {
    await this.uploads.get(ownerId, uploadId);
    return this.repository.create({
      id: crypto.randomUUID(),
      ownerId,
      uploadId,
      kind: "return",
      context: serializable(context) as Record<string, JsonValue>,
    });
  }

  async get(ownerId: string, jobId: string): Promise<PrecheckJob> {
    const job = await this.repository.find(ownerId, jobId);
    if (!job) throw new AppError(404, "NOT_FOUND", "没有找到这个预检任务");
    return job;
  }

  private async tick() {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const job = await this.repository.claimNext();
        if (!job) break;
        try {
          const result = job.kind === "tool"
            ? await this.uploads.consume(
                job.ownerId,
                job.uploadId,
                "tool",
                (fileName, stream) =>
                  this.toolAssets.upload(
                    job.ownerId,
                    encodeURIComponent(fileName),
                    stream,
                  ),
              )
            : await this.uploads.consume(
                job.ownerId,
                job.uploadId,
                "return",
                (fileName, stream) => {
                  const query = returnPrecheckQuerySchema.parse(job.context);
                  return this.returns.precheck(job.ownerId, {
                    ...query,
                    fileName: encodeURIComponent(fileName),
                    stream,
                  });
                },
              );
          await this.repository.succeed(job.id, serializable(result));
        } catch (error) {
          await this.repository.fail(
            job.id,
            error instanceof Error ? error.message : "预检执行失败",
          );
        }
      }
    } finally {
      this.working = false;
    }
  }
}
