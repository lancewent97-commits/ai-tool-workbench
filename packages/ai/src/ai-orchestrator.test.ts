import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRecommendationAllowed,
  reconcileRecommendationCoverage,
} from "./constraints/platform-policy.js";
import { AiOrchestrator } from "./orchestration/ai-orchestrator.js";
import { MockAiProvider } from "./providers/mock-ai-provider.js";
import { MemoryAiStore } from "./testing/memory-ai-store.js";
import type { ToolCandidate, ToolCandidateSource } from "./types.js";

const candidates: ToolCandidate[] = [
  {
    toolId: "00000000-0000-4000-8000-000000000100",
    toolSlug: "pdf-content-extractor",
    toolName: "PDF内容提取工具",
    toolVersionId: "00000000-0000-4000-8000-000000000101",
    version: "v2.3",
    kind: "executable",
    problem: "从教材和文档中提取结构化文字、表格与章节",
    result: "Markdown、Excel 和 JSON",
    tags: ["OCR"],
    verification: "verified",
    source: "ai",
    score: 12,
  },
  {
    toolId: "00000000-0000-4000-8000-000000000200",
    toolSlug: "phonetic-organizer",
    toolName: "单词音标整理工具",
    toolVersionId: "00000000-0000-4000-8000-000000000201",
    version: "v1.8",
    kind: "knowledge",
    problem: "补全、拆分并规范国际音标",
    result: "标准化单词与音标清单",
    tags: ["英语教学"],
    verification: "verified",
    source: "ai",
    score: 10,
  },
  {
    toolId: "00000000-0000-4000-8000-000000000300",
    toolSlug: "batch-dubbing",
    toolName: "批量配音工具",
    toolVersionId: "00000000-0000-4000-8000-000000000301",
    version: "v3.1",
    kind: "executable",
    problem: "为词表或脚本批量生成音频",
    result: "按章节或条目组织的 MP3 文件",
    tags: ["批量处理"],
    verification: "verified",
    source: "ai",
    score: 10,
  },
];

class FixedCandidateSource implements ToolCandidateSource {
  async search(_brief: unknown, selectedVersionIds: string[]) {
    const selected = new Set(selectedVersionIds);
    return candidates.map((candidate) => ({
      ...candidate,
      source: selected.has(candidate.toolVersionId)
        ? "user-selected" as const
        : "ai" as const,
    }));
  }
}

class CompositeCandidateSource extends FixedCandidateSource {
  override async search(brief: unknown, selectedVersionIds: string[]) {
    const base = await super.search(brief, selectedVersionIds);
    return [{
      toolId: "00000000-0000-4000-8000-000000000400",
      toolSlug: "teacher-material-audio",
      toolName: "教材单词提取与发音包",
      toolVersionId: "00000000-0000-4000-8000-000000000401",
      version: "v1.2",
      kind: "composite" as const,
      problem: "把教材单词提取、音标整理和跟读配音整合成可复用方案",
      result: "单词表、音标清单与按章节音频文件夹",
      tags: ["英语教学"],
      verification: "verified" as const,
      source: "ai" as const,
      score: 20,
    }, ...base];
  }
}

describe("AI orchestration", () => {
  it("turns a clear request into a reviewable brief and recommendation cards", async () => {
    const memory = new MemoryAiStore();
    const orchestrator = new AiOrchestrator(
      memory,
      new FixedCandidateSource(),
      new MockAiProvider(),
    );
    const started = await orchestrator.start(
      "00000000-0000-4000-8000-000000000001",
      "用PDF教材提取单词，整理音标，再批量生成跟读音频",
      [],
    );
    assert.equal(started.phase, "brief-review");
    assert.deepEqual(started.brief.deliverables, [
      "结构化单词表",
      "音标清单",
      "按条目组织的音频文件",
    ]);
    assert.equal(started.questions.length, 0);
    assert.equal(started.contextVersion, 1);

    const confirmed = await orchestrator.confirm(
      "00000000-0000-4000-8000-000000000001",
      started.conversationId,
    );
    assert.equal(confirmed.phase, "recommended");
    assert.equal(confirmed.brief.status, "confirmed");
    assert.equal(confirmed.recommendation?.primary?.coverage, "complete");
    assert.deepEqual(
      confirmed.recommendation?.primary?.tools.map((tool) => tool.toolSlug),
      ["pdf-content-extractor", "phonetic-organizer", "batch-dubbing"],
    );
    assert.equal(confirmed.contextVersion, 2);
    assert.deepEqual(
      memory.runs.map((run) => `${run.promptKey}@${run.promptVersion}`),
      [
        "requirement-understanding@3.0.0",
        "context-compression@2.0.0",
        "recommendation@7.0.0",
        "context-compression@2.0.0",
      ],
    );
    assert.equal(memory.decisions[0]?.type, "confirmed");
  });

  it("stops asking after two rounds and records explicit assumptions", async () => {
    const memory = new MemoryAiStore();
    const orchestrator = new AiOrchestrator(
      memory,
      new FixedCandidateSource(),
      new MockAiProvider(),
    );
    const first = await orchestrator.start(
      "00000000-0000-4000-8000-000000000002",
      "帮我处理一下",
      [],
    );
    assert.equal(first.phase, "clarifying");
    const second = await orchestrator.continue(
      "00000000-0000-4000-8000-000000000002",
      first.conversationId,
      "我也不知道，按常规来",
    );
    assert.equal(second.phase, "brief-review");
    assert.equal(second.questions.length, 0);
    assert.equal(second.brief.assumptions.length, 2);
  });

  it("keeps a manually selected version in the primary recommendation", async () => {
    const memory = new MemoryAiStore();
    const orchestrator = new AiOrchestrator(
      memory,
      new FixedCandidateSource(),
      new MockAiProvider(),
    );
    const selectedId = candidates[2]!.toolVersionId;
    const started = await orchestrator.start(
      "00000000-0000-4000-8000-000000000003",
      "把PDF教材整理成单词表",
      [selectedId],
    );
    const confirmed = await orchestrator.confirm(
      "00000000-0000-4000-8000-000000000003",
      started.conversationId,
    );
    const selected = confirmed.recommendation?.primary?.tools.find(
      (tool) => tool.toolVersionId === selectedId,
    );
    assert.equal(selected?.source, "user-selected");
    assert.equal(memory.decisions[0]?.type, "user-selected-tool");
  });

  it("rejects a model result that invents a tool version", () => {
    const candidate = candidates[0]!;
    assert.throws(() => assertRecommendationAllowed({
      briefVersion: 1,
      primary: {
        id: "primary",
        kind: "primary",
        title: "错误方案",
        summary: "包含模型编造的版本",
        reason: "测试",
        coverage: "complete",
        tools: [{
          toolId: candidate.toolId,
          toolSlug: candidate.toolSlug,
          toolName: candidate.toolName,
          toolVersionId: "00000000-0000-4000-8000-000000000999",
          version: "v99",
          purpose: "测试",
          source: "ai",
        }],
        deliverables: [],
        limitations: [],
        gaps: [],
      },
      alternatives: [],
      generatedAt: new Date().toISOString(),
    }, [candidate], {
      id: "00000000-0000-4000-8000-000000000500",
      version: 1,
      status: "confirmed",
      goal: "测试",
      input: "测试",
      deliverables: [],
      constraints: [],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: [],
      openQuestions: [],
      selectedToolVersionIds: [],
      createdAt: new Date().toISOString(),
    }), /候选范围外/);
  });

  it("rejects a model result that rewrites an allowed tool identity", () => {
    const candidate = candidates[0]!;
    assert.throws(() => assertRecommendationAllowed({
      briefVersion: 1,
      primary: {
        id: "primary",
        kind: "primary",
        title: "错误方案",
        summary: "使用合法版本ID但改写名称",
        reason: "测试",
        coverage: "complete",
        tools: [{
          toolId: candidate.toolId,
          toolSlug: candidate.toolSlug,
          toolName: "被模型改写的名称",
          toolVersionId: candidate.toolVersionId,
          version: candidate.version,
          purpose: "测试",
          source: "ai",
        }],
        deliverables: ["可编辑表格"],
        limitations: [],
        gaps: [],
      },
      alternatives: [],
      generatedAt: new Date().toISOString(),
    }, [candidate], {
      id: "00000000-0000-4000-8000-000000000501",
      version: 1,
      status: "confirmed",
      goal: "提取PDF表格",
      input: "PDF",
      deliverables: ["可编辑表格"],
      constraints: [],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: [],
      openQuestions: [],
      selectedToolVersionIds: [],
      createdAt: new Date().toISOString(),
    }), /改写了候选工具身份/);
  });

  it("rejects complete coverage when selected tools do not declare report capability", () => {
    const candidate = candidates[0]!;
    assert.throws(() => assertRecommendationAllowed({
      briefVersion: 1,
      primary: {
        id: "primary",
        kind: "primary",
        title: "错误完整方案",
        summary: "把提取工具当成报告工具",
        reason: "测试",
        coverage: "complete",
        tools: [{
          toolId: candidate.toolId,
          toolSlug: candidate.toolSlug,
          toolName: candidate.toolName,
          toolVersionId: candidate.toolVersionId,
          version: candidate.version,
          purpose: "提取PDF内容",
          source: candidate.source,
        }],
        deliverables: ["分析结论报告"],
        limitations: [],
        gaps: [],
      },
      alternatives: [],
      generatedAt: new Date().toISOString(),
    }, [candidate], {
      id: "00000000-0000-4000-8000-000000000502",
      version: 1,
      status: "confirmed",
      goal: "分析PDF并形成结论报告",
      input: "PDF资料",
      deliverables: ["分析结论报告"],
      constraints: [],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: [],
      openQuestions: [],
      selectedToolVersionIds: [],
      createdAt: new Date().toISOString(),
    }), /夸大了工具能力.*分析并生成结论报告/);
  });

  it("downgrades overstated complete coverage and creates a production gap", () => {
    const candidate = candidates[0]!;
    const brief = {
      id: "00000000-0000-4000-8000-000000000503",
      version: 1,
      status: "confirmed" as const,
      goal: "从PDF教材中提取单词并生成Excel",
      input: "PDF教材",
      deliverables: ["可编辑表格（Excel）"],
      constraints: [],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: [],
      openQuestions: [],
      selectedToolVersionIds: [candidate.toolVersionId],
      createdAt: new Date().toISOString(),
    };
    const reconciled = reconcileRecommendationCoverage({
      briefVersion: 1,
      primary: {
        id: "primary",
        kind: "primary",
        title: "PDF提取方案",
        summary: "提取内容并形成表格",
        reason: "用户已选择该工具",
        coverage: "complete",
        tools: [{
          toolId: candidate.toolId,
          toolSlug: candidate.toolSlug,
          toolName: candidate.toolName,
          toolVersionId: candidate.toolVersionId,
          version: candidate.version,
          purpose: "提取PDF内容",
          source: "user-selected",
        }],
        deliverables: brief.deliverables,
        limitations: [],
        gaps: [],
      },
      alternatives: [],
      generatedAt: new Date().toISOString(),
    }, [{ ...candidate, source: "user-selected" }], brief);

    assert.equal(reconciled.primary?.coverage, "partial");
    assert.equal(reconciled.primary?.title, "现有工具 + 待补齐组件");
    assert.match(
      reconciled.primary?.summary ?? "",
      /补齐.*后才能完成全部交付/,
    );
    assert.match(
      reconciled.primary?.reason ?? "",
      /完成并验证这些组件后，才能按任务说明验收/,
    );
    assert.equal(
      reconciled.primary?.gaps.some((gap) => gap.name === "单词或词表整理"),
      true,
    );
    assert.doesNotThrow(() => assertRecommendationAllowed(
      reconciled,
      [{ ...candidate, source: "user-selected" }],
      brief,
    ));
  });

  it("rejects a tool purpose that claims capabilities absent from its manifest", () => {
    const candidate = candidates[0]!;
    const brief = {
      id: "00000000-0000-4000-8000-000000000504",
      version: 1,
      status: "confirmed" as const,
      goal: "从PDF教材中提取文字",
      input: "PDF教材",
      deliverables: ["结构化文字"],
      constraints: [],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: [],
      openQuestions: [],
      selectedToolVersionIds: [],
      createdAt: new Date().toISOString(),
    };
    const result = reconcileRecommendationCoverage({
      briefVersion: 1,
      primary: {
        id: "primary",
        kind: "primary",
        title: "PDF提取方案",
        summary: "提取PDF文字",
        reason: "工具声明能够提取PDF内容",
        coverage: "complete",
        tools: [{
          toolId: candidate.toolId,
          toolSlug: candidate.toolSlug,
          toolName: candidate.toolName,
          toolVersionId: candidate.toolVersionId,
          version: candidate.version,
          purpose: "提取PDF并生成音频",
          source: "ai",
        }],
        deliverables: brief.deliverables,
        limitations: [],
        gaps: [],
      },
      alternatives: [],
      generatedAt: new Date().toISOString(),
    }, [candidate], brief);

    assert.throws(
      () => assertRecommendationAllowed(result, [candidate], brief),
      /夸大了工具.*音频或配音生成/,
    );
  });

  it("creates a new brief after the user corrects a recommendation", async () => {
    const memory = new MemoryAiStore();
    const userId = "00000000-0000-4000-8000-000000000004";
    const orchestrator = new AiOrchestrator(
      memory,
      new CompositeCandidateSource(),
      new MockAiProvider(),
    );
    const started = await orchestrator.start(
      userId,
      "用PDF教材提取单词，整理音标，再批量生成跟读音频",
      [],
    );
    const confirmed = await orchestrator.confirm(userId, started.conversationId);
    assert.equal(confirmed.phase, "recommended");

    const corrected = await orchestrator.continue(
      userId,
      started.conversationId,
      "不要音频，只保留单词表和音标清单",
    );
    assert.equal(corrected.phase, "brief-review");
    assert.equal(corrected.recommendation, null);
    assert.equal(
      corrected.brief.deliverables.some((item) => /音频/.test(item)),
      false,
    );
    assert.equal(/音频|跟读/.test(corrected.brief.goal), false);
    assert.equal(corrected.brief.rejectedOptions.length, 1);
    assert.equal(memory.decisions.at(-1)?.type, "rejected");

    const reconfirmed = await orchestrator.confirm(userId, started.conversationId);
    assert.equal(
      reconfirmed.recommendation?.primary?.tools.some((item) => /audio|dubbing/i.test(item.toolSlug)),
      false,
    );
  });

  it("retries recommendation without creating another confirmed brief", async () => {
    class OneInvalidRecommendationProvider extends MockAiProvider {
      attempts = 0;

      override async recommend(input: Parameters<MockAiProvider["recommend"]>[0]) {
        const result = await super.recommend(input);
        this.attempts += 1;
        if (this.attempts > 1 || !result.primary?.tools[0]) return result;
        return {
          ...result,
          primary: {
            ...result.primary,
            tools: [{
              ...result.primary.tools[0],
              toolVersionId: "00000000-0000-4000-8000-000000000999",
            }, ...result.primary.tools.slice(1)],
          },
        };
      }
    }

    const memory = new MemoryAiStore();
    const userId = "00000000-0000-4000-8000-000000000006";
    const provider = new OneInvalidRecommendationProvider();
    const orchestrator = new AiOrchestrator(
      memory,
      new FixedCandidateSource(),
      provider,
    );
    const started = await orchestrator.start(
      userId,
      "把PDF教材提取成可编辑表格",
      [],
    );
    await assert.rejects(
      orchestrator.confirm(userId, started.conversationId),
      /未通过平台约束检查/,
    );
    const afterFailure = await memory.getConversation(started.conversationId, userId);
    assert.equal(afterFailure?.brief?.version, 2);
    assert.equal(afterFailure?.brief?.status, "confirmed");

    const retried = await orchestrator.confirm(userId, started.conversationId);
    assert.equal(retried.phase, "recommended");
    assert.equal(retried.brief.version, 2);
    assert.equal(
      memory.decisions.filter((decision) => decision.type === "confirmed").length,
      1,
    );
  });

  it("returns a production gap when the catalog cannot cover a required capability", async () => {
    const memory = new MemoryAiStore();
    const userId = "00000000-0000-4000-8000-000000000005";
    const orchestrator = new AiOrchestrator(
      memory,
      new FixedCandidateSource(),
      new MockAiProvider(),
    );
    const started = await orchestrator.start(
      userId,
      "分析PDF材料并生成一份报告",
      [],
    );
    const confirmed = await orchestrator.confirm(userId, started.conversationId);
    assert.equal(confirmed.recommendation?.primary?.coverage, "partial");
    assert.equal(confirmed.recommendation?.primary?.gaps[0]?.name, "分析材料并生成报告");
    assert.match(
      confirmed.recommendation?.primary?.gaps[0]?.productionPrompt ?? "",
      /工具生产与上传标准/,
    );
  });
});
