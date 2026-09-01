import assert from "node:assert/strict";
import test from "node:test";
import type { PackageDraft } from "@ai-tool-workbench/contracts";
import type { PackageGenerationRepository } from "@ai-tool-workbench/db";
import {
  assertPackageDraftSafe,
  PackageGenerationService,
} from "./package-generation-service.js";

function draft(goal: string): PackageDraft {
  return {
    id: "manual",
    source: "manual",
    name: "测试工具包",
    goal,
    deliverables: ["结果文件"],
    tools: [],
    plannedComponents: [],
    confirmedSections: [],
    userConfirmedFields: [],
  };
}

test("工具包生成前阻止凭证进入目标文件", () => {
  assert.throws(
    () => assertPackageDraftSafe(draft("调用接口，API_KEY=<redacted>")),
    /疑似包含密钥/,
  );
  assert.doesNotThrow(() => assertPackageDraftSafe(draft("调用接口，API Key 使用环境变量占位符")));
});

test("服务重启时结束中断的生成状态，允许用户重试", async () => {
  let message = "";
  const repository = {
    recoverInterrupted: async (value: string) => {
      message = value;
      return 2;
    },
  } as unknown as PackageGenerationRepository;
  const service = new PackageGenerationService(
    {} as never,
    {} as never,
    repository,
    { outputDirectory: "/tmp", productionStandard: "standard" },
    {} as never,
  );

  assert.equal(await service.recoverInterrupted(), 2);
  assert.match(message, /重启/);
  assert.match(message, /重新生成/);
});
