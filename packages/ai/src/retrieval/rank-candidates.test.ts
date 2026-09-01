import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  RequirementBrief,
  ToolCatalogItem,
} from "@ai-tool-workbench/contracts";
import { rankToolCandidates } from "./rank-candidates.js";

function tool(
  id: string,
  slug: string,
  name: string,
  problem: string,
  result: string,
): ToolCatalogItem {
  return {
    id,
    slug,
    name,
    problem,
    result,
    principle: "本地执行",
    kind: "application",
    status: "published",
    modules: [{
      id: "00000000-0000-4000-8000-000000000010",
      slug: "operations",
      name: "产运工具",
      sortOrder: 10,
      isPrimary: true,
    }],
    category: null,
    tags: [],
    departments: [],
    roles: [],
    downloads: 0,
    rating: null,
    ratingCount: 0,
    latestVersion: {
      id: id.replace(/.$/, "9"),
      version: "v1.0.0",
      status: "published",
      verification: "verified",
      releasedAt: "2026-07-28T00:00:00.000Z",
      downloadUrl: "/published-tools/example.zip",
      risks: [],
      changeSummary: "首次发布",
      standardVersion: "v0.28",
      artifactSizeBytes: 1,
    },
    parent: null,
    derivedCount: 0,
    featured: false,
    featuredOrder: null,
    publishedAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

const brief: RequirementBrief = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  status: "confirmed",
  goal: "自动识别PDF每页配图，人工确认后统计每页、章节和全书的配图数量",
  input: "多本PDF教辅",
  deliverables: ["配图数量统计表", "人工核验记录"],
  constraints: ["需要按章节汇总"],
  assumptions: [],
  confirmedFacts: [],
  rejectedOptions: [],
  openQuestions: [],
  selectedToolVersionIds: [],
  createdAt: "2026-07-28T00:00:00.000Z",
};

describe("rankToolCandidates", () => {
  it("prioritizes a specific declared capability over a broad PDF extractor", () => {
    const tools = [
      tool(
        "00000000-0000-4000-8000-000000000101",
        "pdf-content-extractor",
        "PDF内容提取工具",
        "从PDF提取文字、表格和章节",
        "Markdown和结构化JSON",
      ),
      tool(
        "00000000-0000-4000-8000-000000000201",
        "pdf-illustration-count-review",
        "PDF配图数量核验工具",
        "识别PDF逐页配图并支持人工核验",
        "每页、章节和全书配图数量统计",
      ),
    ];

    const ranked = rankToolCandidates(brief, tools, []);

    assert.equal(ranked[0]?.toolSlug, "pdf-illustration-count-review");
    assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  });
});
