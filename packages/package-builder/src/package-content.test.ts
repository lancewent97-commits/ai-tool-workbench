import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  archivePathSegment,
  buildPackageArchive,
  compilePackageTextFiles,
  type PackageBuildInput,
} from "./index.js";

const execFileAsync = promisify(execFile);

function input(artifactPath: string): PackageBuildInput {
  return {
    packageVersionId: "4a352d49-a42f-44e8-bf03-c848ea13f43e",
    packageVersion: "v1",
    createdAt: "2026-07-23T10:00:00.000Z",
    draft: {
      id: "ai-draft",
      source: "ai",
      taskId: "4ec70408-c567-4f04-8f93-e38e6c23eea1",
      name: "教材单词包",
      goal: "从教材中提取单词并生成音频",
      deliverables: ["单词表", "音频文件夹"],
      tools: [],
      plannedComponents: [{
        id: "gap-report",
        name: "质量报告组件",
        goal: "输出质量报告",
        acceptance: ["列出异常"],
        prompt: "先复用现有工具。",
      }],
      confirmedSections: ["目标与交付", "工具与版本", "Agent任务要求", "使用前提醒"],
      userConfirmedFields: ["goal"],
    },
    tools: [{
      toolId: "5b1c1c86-0206-45d3-8d34-3ca0dbb39b9e",
      toolSlug: "sample-tool",
      toolName: "样例工具",
      toolKind: "executable",
      versionId: "70bf8dd8-f575-478d-8bb3-30056ac68ef5",
      version: "v1.2",
      purpose: "提取内容",
      replaceable: false,
      problem: "提取教材内容",
      result: "结构化结果",
      principle: "本地解析",
      verification: "verified",
      standardVersion: "v0.27",
      risks: [],
      artifactPath,
      artifactDownloadUrl: "/demo-assets/sample.zip",
    }],
    productionStandard: "# 完整生产标准\n\n标准正文。",
  };
}

test("编译统一入口、规则、报告和待生产组件文件", async () => {
  const files = compilePackageTextFiles(input("/tmp/sample.zip"));
  const paths = new Set(files.map((file) => file.path));
  for (const required of [
    "START_HERE.md",
    "AGENT_INSTRUCTIONS.md",
    "README.md",
    "TASK.md",
    "tool.yaml",
    "CHANGELOG.md",
    "lineage.yaml",
    "return-manifest.yaml",
    "standards/TOOL_PRODUCTION_STANDARD.md",
    "policies/modification-policy.yaml",
    "validation/validation.md",
    "reports/completion-report.md",
    "reports/modification-report.md",
    "planned-components/gap-report/PRODUCTION_PROMPT.md",
  ]) assert(paths.has(required), `缺少 ${required}`);
  const allText = files.map((file) => file.content).join("\n");
  assert.equal([...paths].some((file) => /conversation|messages/i.test(file)), false);
  assert.match(allText, /不得直接覆盖/);
  assert.match(
    files.find((file) => file.path === "return-manifest.yaml")?.content ?? "",
    /assets: \[\]/,
  );
});

test("拒绝可能越过 ZIP 目录的路径片段", () => {
  assert.throws(() => archivePathSegment("../outside"), /不安全/);
  assert.equal(archivePathSegment("tool-v1.2"), "tool-v1.2");
});

test("流式生成包含锁定原始工具且可读取的 ZIP", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "package-builder-"));
  const artifactPath = path.join(directory, "source.zip");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(artifactPath, "fake zip bytes"));
  try {
    const result = await buildPackageArchive(input(artifactPath), directory);
    assert(result.bytes > 0);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    const { stdout } = await execFileAsync("unzip", ["-Z1", result.archivePath]);
    assert.match(stdout, /tool-files\/sample-tool\/sample-tool-v1.2.zip/);
    assert.match(stdout, /standards\/TOOL_PRODUCTION_STANDARD.md/);
    const { stdout: startHere } = await execFileAsync("unzip", ["-p", result.archivePath, "START_HERE.md"]);
    assert.equal(startHere.includes(result.startPrompt), true);
    const standard = await readFile(artifactPath, "utf8");
    assert.equal(standard, "fake zip bytes");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
