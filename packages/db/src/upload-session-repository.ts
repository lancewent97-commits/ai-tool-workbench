import type {
  UploadPart,
  UploadPurpose,
  UploadSession,
} from "@ai-tool-workbench/contracts";

export interface CreateUploadSessionInput {
  id: string;
  ownerId: string;
  purpose: UploadPurpose;
  fileName: string;
  expectedBytes: number;
  chunkSizeBytes: number;
  expiresAt: Date;
}

export interface SaveUploadPartInput extends UploadPart {
  uploadId: string;
  ownerId: string;
  storageKey: string;
}

export interface UploadSessionRepository {
  healthCheck(): Promise<void>;
  create(input: CreateUploadSessionInput): Promise<UploadSession>;
  find(ownerId: string, uploadId: string): Promise<UploadSession | null>;
  savePart(input: SaveUploadPartInput): Promise<UploadSession>;
  complete(
    ownerId: string,
    uploadId: string,
    artifactStorageKey: string,
    artifactSha256: string,
  ): Promise<UploadSession>;
  abort(ownerId: string, uploadId: string): Promise<UploadSession>;
  close(): Promise<void>;
}
