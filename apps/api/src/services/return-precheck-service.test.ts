import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildFixPrompt,
  buildToolFixPrompt,
  precheckReturnArchive,
  precheckToolArchive,
} from "./return-precheck-service.js";

const execFileAsync = promisify(execFile);
const sourceVersionId = "00000000-0000-4000-8000-000000000902";
const sourceToolId = "00000000-0000-4000-8000-000000000901";

async function writeReturnPackage(root: string) {
  const files: Record<string, string> = {
    "START_HERE.md": "# 开始使用\n\n这是经过本地调整的教材工具包。先阅读说明、核对环境，然后按任务目标执行并记录结果。所有调整均保留来源和验证状态。",
    "AGENT_INSTRUCTIONS.md": "# Agent说明\n\n先向用户复述目标并等待确认。不得覆盖锁定工具，不得上传真实业务数据；修改必须进入衍生副本并记录回滚方式。",
    "README.md": "# 教材处理回传工具\n\n用于从脱敏教材样例中提取结构并生成可编辑结果。支持本地运行，输入为PDF副本，输出为Markdown和结构化表格。",
    "tool.yaml": "name: 教材处理回传工具\nentry: run.sh\ninput: 脱敏PDF\noutput: Markdown和结构化表格\nverification: verified\n",
    "CHANGELOG.md": "# 版本变化\n\n- 增加教材字段清理配置。\n- 保留来源工具并新增独立衍生副本。\n",
    "lineage.yaml": `schema_version: \"1\"\nsource_package_version_id: \"${sourceVersionId}\"\nrelationship: derived\n`,
    "return-manifest.yaml": `schema_version: \"1\"\nsource_package_version_id: \"${sourceVersionId}\"\nreturn_status: prepared\nsanitized: true\n`,
    "validation/validation.md": "# 验证记录\n\n状态：已验证\n环境：本地测试环境\n样本：3份虚构教材页面\n结果：字段和格式符合预期\n已知问题：复杂跨页表格需要人工复核\n",
    "reports/completion-report.md": "# 完成报告\n\n已完成教材字段提取配置调整，使用3份虚构样例完成最小验证。输出结构为Markdown和表格。没有包含真实输入或交付结果。复现时运行 run.sh 并选择 examples/input 中的样例。",
    "reports/modification-report.md": "# 修改报告\n\n来源为锁定工具版本。新增衍生配置，没有覆盖原工具。输入输出边界未改变，回滚时删除衍生目录即可。",
    "examples/input/README.md": "# 虚构输入样例\n",
    "examples/expected-output/README.md": "# 预期输出结构\n",
  };
  await Promise.all(Object.entries(files).map(async ([name, content]) => {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }));
}

async function zipDirectory(root: string, output: string) {
  await execFileAsync("zip", ["-q", "-r", output, "."], { cwd: root });
}

test("合格净化回传包没有必须修复项", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "return-precheck-"));
  try {
    const content = path.join(directory, "return-package");
    const archive = path.join(directory, "return-package.zip");
    await mkdir(content);
    await writeReturnPackage(content);
    await zipDirectory(content, archive);
    const result = await precheckReturnArchive(archive, [sourceVersionId]);
    assert.equal(result.containsSensitiveContent, false);
    assert.deepEqual(
      result.findings.filter((item) => item.level === "required"),
      [],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("维护上传工具必须包含生产标准与修改规则", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tool-precheck-"));
  try {
    const content = path.join(directory, "tool-package");
    const archive = path.join(directory, "tool-package.zip");
    await mkdir(content);
    await writeReturnPackage(content);
    await mkdir(path.join(content, "standards"), { recursive: true });
    await mkdir(path.join(content, "policies"), { recursive: true });
    await writeFile(
      path.join(content, "standards", "TOOL_PRODUCTION_STANDARD.md"),
      "# 工具生产标准\n\n本工具遵循平台 v0.28 标准，必须保留统一入口、来源、调整、验证和完成记录。",
    );
    await writeFile(
      path.join(content, "policies", "modification-policy.yaml"),
      "copy_before_change: true\nupdate_changelog: true\nrequire_user_confirmation: true\n",
    );
    await zipDirectory(content, archive);
    const result = await precheckToolArchive(archive);
    assert.equal(result.containsSensitiveContent, false);
    assert.deepEqual(
      result.findings.filter((item) => item.level === "required"),
      [],
    );
    const prompt = buildToolFixPrompt(result.findings, "v0.28");
    assert.match(prompt, /工具包修正任务/);
    assert.match(prompt, /tool-package\.zip/);
    assert.doesNotMatch(prompt, /回传包修正任务/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("密钥文件与来源不匹配会阻止提交并进入修正提示词", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "return-sensitive-"));
  try {
    const content = path.join(directory, "return-package");
    const archive = path.join(directory, "return-package.zip");
    await mkdir(content);
    await writeReturnPackage(content);
    await writeFile(path.join(content, ".env"), "API_KEY=<redacted>");
    await writeFile(
      path.join(content, "lineage.yaml"),
      "schema_version: \"1\"\nsource_package_version_id: \"different\"\n",
    );
    await writeFile(
      path.join(content, "return-manifest.yaml"),
      "schema_version: \"1\"\nsource_package_version_id: \"different\"\nreturn_status: prepared\n",
    );
    await zipDirectory(content, archive);
    const result = await precheckReturnArchive(archive, [sourceVersionId]);
    const codes = result.findings.map((item) => item.code);
    assert.equal(result.containsSensitiveContent, true);
    assert.ok(codes.some((code) => code.startsWith("sensitive-file:")));
    assert.ok(codes.includes("source-mismatch"));
    const prompt = buildFixPrompt(result.findings, "v0.28");
    assert.match(prompt, /不得放入 API Key/);
    assert.match(prompt, /来源版本无法与下载凭证对应/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("读取明确声明的衍生资产并校验来源版本与文件", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "return-assets-"));
  try {
    const content = path.join(directory, "return-package");
    const archive = path.join(directory, "return-package.zip");
    await mkdir(content);
    await writeReturnPackage(content);
    await mkdir(path.join(content, "return-package"), { recursive: true });
    await writeFile(path.join(content, "return-package", "derived.zip"), "asset");
    await writeFile(
      path.join(content, "return-manifest.yaml"),
      `schema_version: "1"
source_package_version_id: "${sourceVersionId}"
return_status: prepared
assets:
  - id: derived-extractor
    type: derived
    name: 教材字段提取增强版
    problem: 提取教材中的特定字段
    result: 结构化教材字段
    principle: 在来源工具的解析规则上增加教材字段适配
    kind: executable
    version: v1.0.0
    verification: verified
    standard_version: v0.28
    reason: 增加可独立复用的教材字段规则
    artifact: return-package/derived.zip
    source_tool_id: "${sourceToolId}"
    source_version_id: "${sourceVersionId}"
    difference: 增加教材字段适配
    modules: [content-production]
    category: pdf-processing
    tags: []
`,
    );
    await zipDirectory(content, archive);
    const result = await precheckReturnArchive(archive, [sourceVersionId]);
    assert.deepEqual(
      result.findings.filter((item) => item.level === "required"),
      [],
    );
    assert.equal(result.assetCandidates.length, 1);
    assert.equal(result.assetCandidates[0]?.type, "derived");
    assert.equal(result.assetCandidates[0]?.artifactPath, "return-package/derived.zip");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
