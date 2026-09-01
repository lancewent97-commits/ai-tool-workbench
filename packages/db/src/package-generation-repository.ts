import type {
  LockedPackageTool,
  PackageDraft,
  PackageVersionRecord,
} from "@ai-tool-workbench/contracts";

export class PackageVersionNotFoundError extends Error {}
export class PackageDraftNotReadyError extends Error {}

export type ReservedPackageVersion = {
  record: PackageVersionRecord;
  draft: PackageDraft;
};

export interface PackageGenerationRepository {
  healthCheck(): Promise<void>;
  recoverInterrupted(errorMessage: string): Promise<number>;
  reserveVersion(
    userId: string,
    draft: PackageDraft,
    lockedTools: LockedPackageTool[],
    startPrompt: string,
  ): Promise<ReservedPackageVersion>;
  markReady(
    userId: string,
    packageVersionId: string,
    input: {
      startPrompt: string;
      archivePath: string;
      archiveBytes: number;
      archiveSha256: string;
    },
  ): Promise<PackageVersionRecord>;
  markFailed(
    userId: string,
    packageVersionId: string,
    errorMessage: string,
  ): Promise<void>;
  getVersion(userId: string, packageVersionId: string): Promise<PackageVersionRecord | null>;
  getReadyArchive(
    userId: string,
    packageVersionId: string,
  ): Promise<{ record: PackageVersionRecord; archivePath: string } | null>;
  close(): Promise<void>;
}
