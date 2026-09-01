import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { PromptTemplate } from "./prompt-runtime/prompt-registry.js";
import {
  DeepSeekAiProvider,
  DeepSeekProviderError,
  ExternalModelDataPolicyError,
} from "./providers/deepseek-ai-provider.js";
import { assertExternalModelInputAllowed } from "./constraints/platform-policy.js";

const prompt: PromptTemplate = {
  key: "requirement-understanding",
  version: "1.0.0",
  systemFile: "system.md",
  outputContract: "RequirementBrief",
  system: "只处理脱敏测试需求并输出结构化结果。",
};

function deepSeekResponse(content: unknown, finishReason = "stop") {
  return new Response(JSON.stringify({
    id: "response-1",
    model: "deepseek-v4-flash",
    choices: [{
      index: 0,
      finish_reason: finishReason,
      message: {
        role: "assistant",
        content: content === null ? null : JSON.stringify(content),
      },
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DeepSeek external development provider", () => {
  it("is blocked in production", () => {
    assert.throws(() =>
      assertExternalModelInputAllowed("production", "external-dev"));
  });

  it("uses JSON mode and preserves protected decisions", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const selectedVersionId = randomUUID();
    const provider = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return deepSeekResponse({
          draft: {
            goal: "整理脱敏PDF样例",
            input: "PDF",
            deliverables: ["可编辑表格"],
            constraints: [],
            assumptions: [],
            confirmedFacts: [],
            rejectedOptions: [],
            openQuestions: [],
            selectedToolVersionIds: [],
          },
          questions: [],
          assistantText: "任务说明已整理，请确认。",
        });
      },
    });

    const output = await provider.understand({
      prompt,
      messages: [{
        id: randomUUID(),
        role: "user",
        content: "把脱敏PDF样例整理成表格",
        createdAt: new Date().toISOString(),
      }],
      contextSnapshot: null,
      previousBrief: {
        id: randomUUID(),
        version: 1,
        status: "draft",
        goal: "整理脱敏PDF样例",
        input: "PDF",
        deliverables: ["可编辑表格"],
        constraints: [],
        assumptions: [],
        confirmedFacts: ["仅使用脱敏样例"],
        rejectedOptions: ["不要上传真实资料"],
        openQuestions: [],
        selectedToolVersionIds: [selectedVersionId],
        createdAt: new Date().toISOString(),
      },
      selectedToolVersionIds: [selectedVersionId],
      maxQuestions: 3,
      clarificationRoundCount: 2,
    });

    assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(requestInit?.body));
    assert.equal(body.model, "deepseek-v4-flash");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.match(body.messages[0].content, /JSON/);
    assert.deepEqual(output.draft.confirmedFacts, ["仅使用脱敏样例"]);
    assert.deepEqual(output.draft.rejectedOptions, ["不要上传真实资料"]);
    assert.deepEqual(output.draft.selectedToolVersionIds, [selectedVersionId]);
  });

  it("bounds extra model questions and options before returning them", async () => {
    const provider = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async () => deepSeekResponse({
        draft: {
          goal: "整理脱敏资料",
          input: "资料",
          deliverables: [],
          constraints: [],
          assumptions: [],
          confirmedFacts: [],
          rejectedOptions: [],
          openQuestions: [],
          selectedToolVersionIds: [],
        },
        questions: Array.from({ length: 5 }, (_, questionIndex) => ({
          id: `q-${questionIndex}`,
          text: `问题${questionIndex}`,
          why: "影响交付物",
          options: Array.from({ length: 6 }, (_, optionIndex) =>
            `选项${optionIndex}`),
        })),
        assistantText: "请补充关键信息。",
      }),
    });

    const output = await provider.understand({
      prompt,
      messages: [{
        id: randomUUID(),
        role: "user",
        content: "处理脱敏资料",
        createdAt: new Date().toISOString(),
      }],
      contextSnapshot: null,
      previousBrief: null,
      selectedToolVersionIds: [],
      maxQuestions: 3,
      clarificationRoundCount: 1,
    });

    assert.equal(output.questions.length, 3);
    assert.equal(output.questions[0]?.options.length, 4);
  });

  it("keeps confirmed deliverables exact and removes composite-covered tools", async () => {
    const toolId = randomUUID();
    const toolVersionId = randomUUID();
    const compositeToolId = randomUUID();
    const compositeVersionId = randomUUID();
    const provider = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async () => deepSeekResponse({
        briefVersion: 99,
        primary: {
          id: "primary",
          kind: "primary",
          title: "推荐方案",
          summary: "同时使用pdf-tool和pdf-table-package整理表格",
          reason: "工具能力匹配",
          coverage: "complete",
          tools: [
            {
              toolId,
              toolSlug: "pdf-tool",
              toolName: "PDF工具",
              toolVersionId,
              version: "v1",
              purpose: "提取表格",
              source: "ai",
            },
            {
              toolId: compositeToolId,
              toolSlug: "pdf-table-package",
              toolName: "PDF表格组合工具",
              toolVersionId: compositeVersionId,
              version: "v2",
              purpose: "完成PDF表格提取与整理",
              source: "ai",
            },
          ],
          deliverables: ["模型改写后的表格"],
          limitations: [],
          gaps: [],
        },
        alternatives: [],
        generatedAt: new Date(0).toISOString(),
      }),
    });
    const deliverables = ["可编辑表格（Excel）", "来源页码字段"];
    const recommendation = await provider.recommend({
      prompt: {
        key: "recommendation",
        version: "6.0.0",
        systemFile: "system.md",
        outputContract: "RecommendationResult",
        system: "只输出推荐JSON。",
      },
      brief: {
        id: randomUUID(),
        version: 1,
        status: "confirmed",
        goal: "提取PDF表格",
        input: "脱敏PDF",
        deliverables,
        constraints: [],
        assumptions: [],
        confirmedFacts: [],
        rejectedOptions: [],
        openQuestions: [],
        selectedToolVersionIds: [],
        createdAt: new Date().toISOString(),
      },
      candidates: [
        {
          toolId,
          toolSlug: "pdf-tool",
          toolName: "PDF工具",
          toolVersionId,
          version: "v1",
          kind: "executable",
          problem: "提取PDF表格",
          result: "可编辑表格",
          tags: ["PDF"],
          verification: "verified",
          source: "ai",
          score: 10,
        },
        {
          toolId: compositeToolId,
          toolSlug: "pdf-table-package",
          toolName: "PDF表格组合工具",
          toolVersionId: compositeVersionId,
          version: "v2",
          kind: "composite",
          problem: "从PDF提取并整理表格",
          result: "可编辑表格（Excel）与来源页码字段",
          tags: ["PDF", "组合工具"],
          verification: "verified",
          source: "ai",
          score: 20,
        },
      ],
    });

    assert.deepEqual(recommendation.primary?.deliverables, deliverables);
    assert.deepEqual(
      recommendation.primary?.tools.map((tool) => tool.toolVersionId),
      [compositeVersionId],
    );
    assert.equal(
      recommendation.primary?.summary,
      "使用PDF表格组合工具完成“提取PDF表格”",
    );
    assert.match(recommendation.primary?.reason ?? "", /已移除.*重复覆盖/);
    assert.doesNotMatch(
      [
        recommendation.primary?.title,
        recommendation.primary?.summary,
        recommendation.primary?.reason,
      ].join(" "),
      /pdf-table-package|pdf-tool/,
    );
    assert.equal(recommendation.briefVersion, 1);
  });

  it("blocks obvious personal or secret data before making a request", async () => {
    let called = false;
    const provider = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async () => {
        called = true;
        return deepSeekResponse({});
      },
    });

    await assert.rejects(
      provider.understand({
        prompt,
        messages: [{
          id: randomUUID(),
          role: "user",
          content: "联系手机号13800138000后整理资料",
          createdAt: new Date().toISOString(),
        }],
        contextSnapshot: null,
        previousBrief: null,
        selectedToolVersionIds: [],
        maxQuestions: 3,
        clarificationRoundCount: 1,
      }),
      ExternalModelDataPolicyError,
    );
    assert.equal(called, false);
  });

  it("rejects empty and truncated structured output", async () => {
    const empty = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async () => deepSeekResponse(null),
    });
    const truncated = new DeepSeekAiProvider({
      apiKey: "test-key-not-real",
      dataMode: "sanitized-test",
      fetcher: async () => deepSeekResponse({}, "length"),
    });
    const input = {
      prompt,
      messages: [{
        id: randomUUID(),
        role: "user" as const,
        content: "整理脱敏PDF样例",
        createdAt: new Date().toISOString(),
      }],
      contextSnapshot: null,
      previousBrief: null,
      selectedToolVersionIds: [],
      maxQuestions: 3,
      clarificationRoundCount: 1,
    };
    await assert.rejects(empty.understand(input), DeepSeekProviderError);
    await assert.rejects(truncated.understand(input), DeepSeekProviderError);
  });
});
