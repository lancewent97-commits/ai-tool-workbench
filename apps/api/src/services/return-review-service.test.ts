import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type {
  ReturnAssetCandidate,
  ReturnRecord,
  ReturnReviewRecord,
} from "@ai-tool-workbench/contracts";
import type {
  IdentityRepository,
  PublishedReturnAssetInput,
  ReturnSubmissionRepository,
} from "@ai-tool-workbench/db";
import { ReturnReviewService } from "./return-review-service.js";

const execFileAsync = promisify(execFile);
const returnId = "10000000-0000-4000-8000-000000000001";
const versionId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";
const reviewerId = "10000000-0000-4000-8000-000000000004";
const sourceDownloadId = "10000000-0000-4000-8000-000000000005";

function candidate(): ReturnAssetCandidate {
  return {
    id: "derived-tool",
    type: "new",
    name: "教材字段工具",
    problem: "提取教材字段",
    result: "结构化字段",
    principle: "按字段规则提取",
    kind: "executable",
    version: "v1.0.0",
    verification: "verified",
    standardVersion: "v0.28",
    risks: [],
    reason: "可独立复用",
    artifactPath: "return-package/asset.zip",
    sourceToolId: null,
    sourceVersionId: null,
    difference: null,
    moduleSlugs: ["content-production"],
    categorySlug: "data-processing",
    tagSlugs: [],
  };
}

function submission(assetCandidate: ReturnAssetCandidate): ReturnRecord {
  const now = "2026-07-24T01:00:00.000Z";
  return {
    id: returnId,
    name: "教材工具回传",
    sourceDownloadId,
    sourceObjectName: "教材工具包",
    sourcePackageVersion: "v1",
    sourceToolVersion: null,
    version: "v1",
    state: "reviewing",
    updatedAt: now,
    createdAt: now,
    findings: [],
    fixPrompt: "",
    events: [],
    versions: [{
      id: versionId,
      version: "v1",
      fileName: "return.zip",
      archiveBytes: 1,
      archiveSha256: "a".repeat(64),
      retained: true,
      precheckStatus: "passed",
      findings: [],
      assetCandidates: [assetCandidate],
      fixPrompt: "",
      uploadedAt: now,
      submittedAt: now,
    }],
    assets: [],
    adoptedCount: 0,
    listed: false,
    reviewReason: null,
  };
}

test("审核通过时提取独立资产并交给发布事务", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "return-review-"));
  try {
    const sourceRoot = path.join(directory, "source");
    const nestedRoot = path.join(directory, "nested");
    const published = path.join(directory, "published");
    const sourceArchive = path.join(directory, "return.zip");
    const nestedArchive = path.join(sourceRoot, "return-package", "asset.zip");
    await mkdir(path.dirname(nestedArchive), { recursive: true });
    await mkdir(nestedRoot);
    await writeFile(path.join(nestedRoot, "README.md"), "# 可发布工具");
    await execFileAsync("zip", ["-q", "-r", nestedArchive, "."], { cwd: nestedRoot });
    await execFileAsync("zip", ["-q", "-r", sourceArchive, "."], { cwd: sourceRoot });

    const assetCandidate = candidate();
    const review: ReturnReviewRecord = {
      submission: submission(assetCandidate),
      uploader: { id: userId, displayName: "上传人", account: "uploader" },
    };
    let publishedInput: PublishedReturnAssetInput[] = [];
    const repository = {
      findForReview: async () => review,
      findVersionFile: async () => ({
        path: sourceArchive,
        fileName: "return.zip",
        bytes: 1,
      }),
      approveReview: async (input: { assets: PublishedReturnAssetInput[] }) => {
        publishedInput = input.assets;
        return { ...review.submission, state: "published" as const };
      },
    } as unknown as ReturnSubmissionRepository;
    const auditActions: string[] = [];
    const identity = {
      recordAuditEvent: async (input: { action: string }) => {
        auditActions.push(input.action);
      },
    } as unknown as IdentityRepository;
    const service = new ReturnReviewService(repository, identity, {
      publishedDirectory: published,
    });

    const result = await service.decide(reviewerId, returnId, {
      decision: "approved",
      reason: "",
    });
    assert.equal(result.state, "published");
    assert.equal(publishedInput.length, 1);
    assert.match(publishedInput[0]?.artifactSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(publishedInput[0]?.candidate.id, "derived-tool");
    const { stdout } = await execFileAsync(
      "unzip",
      ["-Z1", publishedInput[0]?.artifactPath ?? ""],
    );
    assert.match(stdout, /README\.md/);
    assert.deepEqual(auditActions, ["return.review.approved"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
