import type {
  AdminToolAssetDetail,
  AdminToolAssetSummary,
  CreateToolAssetRequest,
  CreateToolAssetVersionRequest,
  ToolAssetAdminQuery,
  UpdateToolAssetRequest,
} from "@ai-tool-workbench/contracts";

export type ToolAssetInvariantCode =
  | "SLUG_EXISTS"
  | "TAXONOMY_NOT_FOUND"
  | "LINEAGE_SOURCE_INVALID"
  | "VERSION_EXISTS"
  | "VERSION_NOT_DRAFT"
  | "VERSION_NOT_PUBLISHED"
  | "ARTIFACT_INCOMPLETE"
  | "FEATURED_INELIGIBLE";

export class ToolAssetInvariantError extends Error {
  constructor(
    readonly code: ToolAssetInvariantCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolAssetInvariantError";
  }
}

export interface ToolAssetRepository {
  healthCheck(): Promise<void>;
  listAssets(query: ToolAssetAdminQuery): Promise<{
    items: AdminToolAssetSummary[];
    total: number;
  }>;
  findAsset(toolId: string): Promise<AdminToolAssetDetail | null>;
  createAsset(
    actorUserId: string,
    input: CreateToolAssetRequest,
  ): Promise<AdminToolAssetDetail>;
  updateAsset(
    actorUserId: string,
    toolId: string,
    input: UpdateToolAssetRequest,
  ): Promise<AdminToolAssetDetail | null>;
  addVersion(
    actorUserId: string,
    toolId: string,
    input: CreateToolAssetVersionRequest,
  ): Promise<AdminToolAssetDetail | null>;
  publishVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
  ): Promise<AdminToolAssetDetail | null>;
  publishAsset(
    actorUserId: string,
    toolId: string,
  ): Promise<AdminToolAssetDetail | null>;
  offlineVersion(
    actorUserId: string,
    toolId: string,
    versionId: string,
    reason: string,
  ): Promise<AdminToolAssetDetail | null>;
  offlineAsset(
    actorUserId: string,
    toolId: string,
    reason: string,
  ): Promise<AdminToolAssetDetail | null>;
  close(): Promise<void>;
}
