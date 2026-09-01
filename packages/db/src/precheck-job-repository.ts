import type {
  PrecheckJob,
  PrecheckJobKind,
} from "@ai-tool-workbench/contracts";
import type { JsonValue } from "./identity-repository.js";

export interface ClaimedPrecheckJob extends PrecheckJob {
  ownerId: string;
  context: Record<string, JsonValue>;
}
export interface PrecheckJobRepository {
  healthCheck(): Promise<void>;
  create(input: {
    id: string;
    ownerId: string;
    uploadId: string;
    kind: PrecheckJobKind;
    context: Record<string, JsonValue>;
  }): Promise<PrecheckJob>;
  find(ownerId: string, jobId: string): Promise<PrecheckJob | null>;
  recoverInterrupted(): Promise<number>;
  claimNext(): Promise<ClaimedPrecheckJob | null>;
  succeed(jobId: string, result: JsonValue): Promise<void>;
  fail(jobId: string, message: string): Promise<void>;
  close(): Promise<void>;
}
