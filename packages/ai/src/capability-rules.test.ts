import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { requiredCapabilities } from "./capabilities/capability-rules.js";

describe("tool capability rules", () => {
  it("does not turn an explicitly rejected audio capability into a requirement", () => {
    const capabilities = requiredCapabilities({
      id: randomUUID(),
      version: 1,
      status: "confirmed",
      goal: "从PDF教材提取单词并整理音标，不生成音频",
      input: "PDF教材",
      deliverables: ["结构化单词表", "音标清单"],
      constraints: ["不生成任何音频文件"],
      assumptions: [],
      confirmedFacts: [],
      rejectedOptions: ["不要配音、发音或跟读音频"],
      openQuestions: [],
      selectedToolVersionIds: [],
      createdAt: new Date().toISOString(),
    });

    assert.equal(capabilities.some((item) => item.id === "audio"), false);
    assert.equal(capabilities.some((item) => item.id === "word-list"), true);
    assert.equal(capabilities.some((item) => item.id === "phonetic"), true);
  });
});
