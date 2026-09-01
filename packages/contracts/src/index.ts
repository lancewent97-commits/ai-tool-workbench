export type EntityId = string;
export type IsoDateTime = string;
export type ToolKind = "executable" | "knowledge" | "template" | "application" | "composite";
export type VerificationState = "verified" | "partly-verified" | "unverified";
export type TaskStage = "clarifying" | "brief-review" | "recommended" | "package-review" | "ready" | "completed";
export type DownloadKind = "tool" | "ai-package" | "manual-package" | "historical" | "derived";
export type ReturnState = "precheck-failed" | "precheck-passed" | "prechecking" | "reviewing" | "review-rejected" | "published" | "offline";

export interface PageResult<T> { items: T[]; page: number; pageSize: number; total: number; }

export interface ToolVersion {
  id: EntityId;
  version: string;
  releasedAt: IsoDateTime;
  verification: VerificationState;
  downloadUrl: string;
  risks: string[];
}

export interface Tool {
  id: EntityId;
  name: string;
  problem: string;
  result: string;
  principle: string;
  module: string;
  category: string;
  kind: ToolKind;
  tags: string[];
  departments: string[];
  roles: string[];
  downloads: number;
  rating: number;
  latestVersionId: EntityId;
  versions: ToolVersion[];
  parent?: { toolId: EntityId; versionId: EntityId; difference: string };
  derivedToolIds: EntityId[];
}

export interface PackageToolSelection { toolId: EntityId; versionId: EntityId; purpose: string; replaceable: boolean; }
export interface PlannedComponent { id: EntityId; name: string; goal: string; acceptance: string[]; prompt: string; }
export interface Task {
  id: EntityId;
  name: string;
  goal: string;
  input: string;
  deliverables: string[];
  stage: TaskStage;
  updatedAt: IsoDateTime;
  needsUserAction: boolean;
  packageVersionIds: EntityId[];
  result?: "complete" | "partial" | "failed";
}

export interface PackageDraft {
  id: EntityId;
  source: "ai" | "manual";
  taskId?: EntityId;
  name: string;
  goal?: string;
  deliverables: string[];
  tools: PackageToolSelection[];
  plannedComponents: PlannedComponent[];
  confirmedSections: string[];
  userConfirmedFields: string[];
}

export interface PackageVersion {
  id: EntityId;
  draftId: EntityId;
  version: string;
  createdAt: IsoDateTime;
  downloadUrl: string;
  startPrompt: string;
  lockedTools: PackageToolSelection[];
}

export interface DownloadRecord {
  id: EntityId;
  kind: DownloadKind;
  objectName: string;
  downloadedAt: IsoDateTime;
  packageVersionId?: EntityId;
  packageVersion?: string;
  toolVersionId?: EntityId;
  toolVersion?: string;
  sourceTaskId?: EntityId;
  lockedTools: PackageToolSelection[];
  lockedToolDetails?: Array<{
    toolId: EntityId;
    toolSlug: string;
    toolName: string;
    versionId: EntityId;
    version: string;
    purpose: string;
  }>;
  lockedToolStatuses?: Array<{
    toolId: EntityId;
    toolSlug: string;
    status: "published" | "offline" | "missing";
    latestVersion: string | null;
    derivedCount: number;
  }>;
  downloadUrl: string;
  feedbackState: "none" | "submitted";
  feedbackResult?: "complete" | "partial" | "failed";
  feedbackRating?: number;
  feedbackComment?: string;
  feedbackSubmittedAt?: IsoDateTime;
}

export interface CheckFinding { id: EntityId; level: "required" | "risk" | "suggestion"; title: string; completion: string; }
export interface ReturnEvent { id: EntityId; at: IsoDateTime; type: "uploaded" | "precheck" | "review" | "published"; title: string; detail: string; }
export interface ReturnSubmission {
  id: EntityId;
  name: string;
  sourceDownloadId: EntityId;
  version: string;
  state: ReturnState;
  updatedAt: IsoDateTime;
  findings: CheckFinding[];
  events: ReturnEvent[];
  assets: { type: "composite" | "derived" | "new"; toolId: EntityId; slug?: string | null; name: string; reason: string }[];
  adoptedCount: number;
  listed: boolean;
  reviewReason?: string | null;
}

export * from "./api.js";
export * from "./admin.js";
export * from "./admin-tool-assets.js";
export * from "./ai/index.js";
export * from "./auth.js";
export * from "./returns.js";
export * from "./tool-catalog.js";
export * from "./uploads.js";
export * from "./workspace.js";
