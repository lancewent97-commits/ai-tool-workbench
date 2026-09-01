import path from "node:path";
import {
  MAX_UPLOAD_BYTES,
  returnAssetCandidateSchema,
  type ReturnAssetCandidate,
  type ReturnFinding,
} from "@ai-tool-workbench/contracts";
import { load as loadYaml } from "js-yaml";
import * as yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";

const requiredFiles = [
  "START_HERE.md",
  "AGENT_INSTRUCTIONS.md",
  "README.md",
  "tool.yaml",
  "CHANGELOG.md",
  "lineage.yaml",
  "return-manifest.yaml",
  "validation/validation.md",
  "reports/completion-report.md",
  "reports/modification-report.md",
];

const readableExtensions = new Set([
  ".md", ".txt", ".yaml", ".yml", ".json", ".toml", ".ini", ".xml",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".sh", ".ps1",
]);

const sensitiveFileNames = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)(id_rsa|id_ed25519|credentials|cookies|secrets?)(\.|$)/i,
  /\.(pem|p12|pfx|key)$/i,
];

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/i,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{16,}/i,
];

const forbiddenDirectory = /(^|\/)(inputs?|outputs?|runtime|secrets?|logs?|cache|tmp|temp|node_modules|\.git)(\/|$)/i;
const businessExtension = /\.(pdf|docx?|xlsx?|pptx?|csv|png|jpe?g|webp|mp3|wav|mp4|mov)$/i;

type RawEntry = {
  name: string;
  normalized: string;
  uncompressedSize: number;
  compressedSize: number;
  encrypted: boolean;
  text?: string;
};

export type ReturnPrecheckResult = {
  findings: ReturnFinding[];
  containsSensitiveContent: boolean;
  assetCandidates: ReturnAssetCandidate[];
};

export type ToolArchivePrecheckResult = Omit<
  ReturnPrecheckResult,
  "assetCandidates"
>;

function finding(
  code: string,
  level: ReturnFinding["level"],
  title: string,
  completion: string,
  filePath: string | null = null,
): ReturnFinding {
  return { id: code, code, level, title, completion, path: filePath };
}

function normalizeEntryName(name: string) {
  return name.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function commonRoot(entries: RawEntry[]) {
  const files = entries.filter((entry) => !entry.normalized.endsWith("/"));
  if (!files.length) return "";
  const first = files[0]?.normalized.split("/")[0] ?? "";
  return first && files.every((entry) => entry.normalized.startsWith(`${first}/`))
    ? `${first}/`
    : "";
}

function openArchive(archivePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
    }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("无法打开ZIP"));
      else resolve(zip);
    });
  });
}

function readSmallText(zip: ZipFile, entry: Entry) {
  return new Promise<string>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("无法读取ZIP文件"));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes <= 1_048_576) chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  });
}

async function inspectEntries(archivePath: string) {
  const zip = await openArchive(archivePath);
  const entries: RawEntry[] = [];
  let totalUncompressed = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(error);
      };
      zip.once("error", fail);
      zip.once("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          const normalized = normalizeEntryName(entry.fileName);
          if (
            normalized.includes("\0")
            || normalized.startsWith("/")
            || /^[A-Za-z]:\//.test(normalized)
            || normalized.split("/").includes("..")
          ) {
            throw new Error(`ZIP包含不安全路径：${entry.fileName}`);
          }
          totalUncompressed += entry.uncompressedSize;
          if (entries.length >= 20_000) throw new Error("ZIP文件数量超过安全上限");
          if (totalUncompressed > MAX_UPLOAD_BYTES) throw new Error("ZIP解压后体积超过安全上限");
          const raw: RawEntry = {
            name: entry.fileName,
            normalized,
            uncompressedSize: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            encrypted: Boolean(entry.generalPurposeBitFlag & 1),
          };
          const extension = path.extname(normalized).toLowerCase();
          if (
            !normalized.endsWith("/")
            && entry.uncompressedSize <= 1_048_576
            && (readableExtensions.has(extension) || normalized.toLowerCase().endsWith(".env"))
          ) {
            raw.text = await readSmallText(zip, entry);
          }
          entries.push(raw);
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return entries;
}

function hasSubstantialContent(text: string | undefined, minimum: number) {
  if (!text || text.trim().length < minimum) return false;
  return !/(待填写|尚未填写|TODO|TBD)|^-\s+[^：:\n]+[：:]\s*$/im.test(text);
}

export async function precheckReturnArchive(
  archivePath: string,
  expectedSourceIds: string[],
): Promise<ReturnPrecheckResult> {
  let entries: RawEntry[];
  try {
    entries = await inspectEntries(archivePath);
  } catch (error) {
    return {
      findings: [finding(
        "invalid-zip",
        "required",
        "ZIP无法安全读取",
        `请让本地 Agent 重新生成标准 ZIP；当前错误：${error instanceof Error ? error.message : "未知错误"}`,
      )],
      containsSensitiveContent: true,
      assetCandidates: [],
    };
  }

  const root = commonRoot(entries);
  const normalized = entries.map((entry) => ({
    ...entry,
    normalized: root ? entry.normalized.slice(root.length) : entry.normalized,
  }));
  const fileMap = new Map(
    normalized
      .filter((entry) => !entry.normalized.endsWith("/"))
      .map((entry) => [entry.normalized, entry]),
  );
  const findings: ReturnFinding[] = [];
  const assetCandidates: ReturnAssetCandidate[] = [];
  let containsSensitiveContent = false;

  for (const file of requiredFiles) {
    if (!fileMap.has(file)) {
      findings.push(finding(
        `missing:${file}`,
        "required",
        `缺少 ${file}`,
        `按平台模板补齐 ${file}，内容必须描述本次真实调整，不能保留空模板。`,
        file,
      ));
    }
  }

  const duplicates = normalized
    .map((entry) => entry.normalized)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicates.length) {
    findings.push(finding(
      "duplicate-paths",
      "required",
      "ZIP内存在重复路径",
      "重新生成ZIP，确保每个规范路径只出现一次。",
      duplicates[0] ?? null,
    ));
  }

  for (const entry of normalized) {
    if (entry.encrypted) {
      containsSensitiveContent = true;
      findings.push(finding(
        `encrypted:${entry.normalized}`,
        "required",
        "包含加密文件",
        "移除加密文件；回传包必须能够完成静态安全检查。",
        entry.normalized,
      ));
    }
    if (sensitiveFileNames.some((pattern) => pattern.test(entry.normalized))) {
      containsSensitiveContent = true;
      findings.push(finding(
        `sensitive-file:${entry.normalized}`,
        "required",
        "包含疑似凭证或认证文件",
        "从净化回传包中删除该文件，并在本地重新检查所有凭证。",
        entry.normalized,
      ));
    }
    if (
      forbiddenDirectory.test(entry.normalized)
      && !entry.normalized.startsWith("examples/")
    ) {
      containsSensitiveContent = true;
      findings.push(finding(
        `forbidden-directory:${entry.normalized}`,
        "required",
        "包含禁止回传的工作目录",
        "删除真实输入、业务输出、运行现场、日志、缓存、密钥目录或依赖目录。",
        entry.normalized,
      ));
    }
    if (entry.text && secretPatterns.some((pattern) => pattern.test(entry.text!))) {
      containsSensitiveContent = true;
      findings.push(finding(
        `secret-content:${entry.normalized}`,
        "required",
        "文件内容疑似包含密钥、Token或密码",
        "删除真实凭证，改用环境变量名称或无效占位符，并重新生成净化包。",
        entry.normalized,
      ));
    }
    if (
      businessExtension.test(entry.normalized)
      && !entry.normalized.startsWith("examples/")
      && !entry.normalized.startsWith("tool-files/")
    ) {
      containsSensitiveContent = true;
      findings.push(finding(
        `business-file:${entry.normalized}`,
        "required",
        "包含疑似真实业务文件或最终交付物",
        "移除业务输入和最终结果；如需样例，只保留虚构或脱敏的小样本并放入 examples/。",
        entry.normalized,
      ));
    }
    if (
      entry.compressedSize > 0
      && entry.uncompressedSize > 10 * 1024 ** 2
      && entry.uncompressedSize / entry.compressedSize > 1_000
    ) {
      containsSensitiveContent = true;
      findings.push(finding(
        `compression-ratio:${entry.normalized}`,
        "required",
        "文件压缩比异常",
        "检查是否误放入超大重复数据或压缩炸弹，并重新生成净化包。",
        entry.normalized,
      ));
    }
  }

  const allText = normalized.map((entry) => entry.text ?? "").join("\n");
  if (expectedSourceIds.length && !expectedSourceIds.some((id) => allText.includes(id))) {
    findings.push(finding(
      "source-mismatch",
      "required",
      "来源版本无法与下载凭证对应",
      "在 lineage.yaml 和 return-manifest.yaml 中保留原 package_version_id 或 tool_version_id，不要只写工具名称。",
      "lineage.yaml",
    ));
  }

  const returnManifest = fileMap.get("return-manifest.yaml")?.text;
  if (
    returnManifest
    && (/return_status:\s*["']?not-prepared/i.test(returnManifest)
      || !/return_status:\s*["']?(prepared|ready|completed)/i.test(returnManifest))
  ) {
    findings.push(finding(
      "return-not-prepared",
      "required",
      "回传清单仍标记为未准备",
      "完成净化后把 return_status 更新为 prepared、ready 或 completed，并逐项核对排除内容。",
      "return-manifest.yaml",
    ));
  }
  if (returnManifest) {
    try {
      const manifest = loadYaml(returnManifest) as {
        assets?: Array<Record<string, unknown>>;
      } | null;
      for (const [index, raw] of (manifest?.assets ?? []).entries()) {
        const type = raw.type;
        const artifactPath = typeof raw.artifact === "string"
          ? normalizeEntryName(raw.artifact)
          : null;
        const candidate = returnAssetCandidateSchema.parse({
          id: typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `asset-${index + 1}`,
          type,
          name: raw.name,
          problem: raw.problem,
          result: raw.result,
          principle: raw.principle,
          kind: raw.kind ?? (type === "composite" ? "composite" : "executable"),
          version: raw.version ?? "v1.0.0",
          verification: raw.verification ?? "unverified",
          standardVersion: raw.standard_version ?? "v0.28",
          risks: Array.isArray(raw.risks) ? raw.risks : [],
          reason: raw.reason,
          artifactPath,
          sourceToolId: raw.source_tool_id ?? null,
          sourceVersionId: raw.source_version_id ?? null,
          difference: raw.difference ?? null,
          moduleSlugs: Array.isArray(raw.modules) ? raw.modules : [],
          categorySlug: raw.category ?? null,
          tagSlugs: Array.isArray(raw.tags) ? raw.tags : [],
        });
        if (candidate.artifactPath && !candidate.artifactPath.toLowerCase().endsWith(".zip")) {
          findings.push(finding(
            `asset-file-type:${candidate.id}`,
            "required",
            `发布资产 ${candidate.name} 不是独立 ZIP`,
            "把这个可独立使用的工具整理为单独 ZIP，并更新 assets.artifact 路径。",
            candidate.artifactPath,
          ));
          continue;
        }
        if (candidate.artifactPath && !fileMap.has(candidate.artifactPath)) {
          findings.push(finding(
            `asset-file-missing:${candidate.id}`,
            "required",
            `发布资产 ${candidate.name} 缺少声明文件`,
            `把 ${candidate.artifactPath} 放入回传包，或从 assets 清单中移除这条无效声明。`,
            candidate.artifactPath,
          ));
          continue;
        }
        if (
          candidate.type === "derived"
          && (
            !candidate.sourceToolId
            || !candidate.sourceVersionId
            || !expectedSourceIds.includes(candidate.sourceVersionId)
          )
        ) {
          findings.push(finding(
            `asset-source-invalid:${candidate.id}`,
            "required",
            `衍生资产 ${candidate.name} 的来源版本无效`,
            "填写本次下载凭证中真实锁定的 source_tool_id 和 source_version_id，不得凭名称猜测。",
            "return-manifest.yaml",
          ));
          continue;
        }
        assetCandidates.push(candidate);
      }
    } catch (error) {
      findings.push(finding(
        "asset-manifest-invalid",
        "required",
        "回传资产声明无法读取",
        `按平台模板修正 return-manifest.yaml 的 assets 字段；当前错误：${error instanceof Error ? error.message : "格式错误"}`,
        "return-manifest.yaml",
      ));
    }
  }

  const contentChecks: Array<[string, number]> = [
    ["START_HERE.md", 40],
    ["AGENT_INSTRUCTIONS.md", 40],
    ["README.md", 40],
    ["reports/completion-report.md", 60],
    ["reports/modification-report.md", 40],
    ["validation/validation.md", 50],
  ];
  for (const [file, minimum] of contentChecks) {
    const entry = fileMap.get(file);
    if (entry && !hasSubstantialContent(entry.text, minimum)) {
      findings.push(finding(
        `placeholder:${file}`,
        "required",
        `${file} 仍是空模板或信息不足`,
        "填写本次实际目标、变化、验证、未完成项和复现方式，不要保留“待填写”或空字段。",
        file,
      ));
    }
  }

  const validation = fileMap.get("validation/validation.md")?.text ?? "";
  if (/当前状态[：:][^\n]*(未验证|尚未)/.test(validation)) {
    findings.push(finding(
      "unverified",
      "risk",
      "回传内容尚未完成实际验证",
      "可以继续提交审核，但必须保留未验证状态、样本范围和已知风险。",
      "validation/validation.md",
    ));
  }
  if (!normalized.some((entry) => entry.normalized.startsWith("examples/"))) {
    findings.push(finding(
      "missing-examples",
      "suggestion",
      "缺少脱敏最小样例",
      "建议增加虚构或脱敏的最小输入与预期输出说明，便于维护人员复核。",
      "examples/",
    ));
  }

  return { findings, containsSensitiveContent, assetCandidates };
}

export async function precheckToolArchive(
  archivePath: string,
): Promise<ToolArchivePrecheckResult> {
  const result = await precheckReturnArchive(archivePath, []);
  const findings = result.findings.filter((item) =>
    item.code !== "return-not-prepared"
    && !item.code.startsWith("asset-")
  );
  if (findings.some((item) => item.code === "invalid-zip")) {
    return {
      findings,
      containsSensitiveContent: result.containsSensitiveContent,
    };
  }

  const entries = await inspectEntries(archivePath);
  const root = commonRoot(entries);
  const names = new Set(entries.map((entry) =>
    root ? entry.normalized.slice(root.length) : entry.normalized
  ));
  for (const file of [
    "standards/TOOL_PRODUCTION_STANDARD.md",
    "policies/modification-policy.yaml",
  ]) {
    if (!names.has(file)) {
      findings.push(finding(
        `missing:${file}`,
        "required",
        `缺少 ${file}`,
        `按平台工具模板补齐 ${file}，再让本地 Agent 重新生成 ZIP。`,
        file,
      ));
    }
  }
  return {
    findings,
    containsSensitiveContent: result.containsSensitiveContent,
  };
}

function remediationPrompt(
  findings: ReturnFinding[],
  standardVersion: string,
  target: "return" | "tool",
) {
  const required = findings.filter((item) => item.level === "required");
  const optional = findings.filter((item) => item.level !== "required");
  const isReturn = target === "return";
  return `# ${isReturn ? "回传包" : "工具包"}修正任务

你正在本地修正一个准备${isReturn ? "回传" : "上传"}“AI工具工作台”的${isReturn ? "净化工具包" : "工具包"}。平台不会在线修改文件，本次修正必须在本地副本中完成。

## 适用标准

- 平台工具生产与上传标准：${standardVersion}
- 最终只输出${isReturn ? "净化后的" : "符合标准的"} \`${isReturn ? "return-package.zip" : "tool-package.zip"}\`
- 不改变用户原始目标，不覆盖锁定原工具，不伪造验证结果

## 必须修复

${required.length ? required.map((item, index) => `${index + 1}. ${item.title}
   - 位置：${item.path ?? "整个回传包"}
   - 完成标准：${item.completion}`).join("\n") : "无"}

## 风险提醒和优化建议

${optional.length ? optional.map((item) => `- ${item.title}：${item.completion}`).join("\n") : "无"}

## 禁止事项

- 不得放入真实业务输入、最终业务交付物、个人或客户信息。
- 不得放入 API Key、Token、密码、Cookie、私钥、认证文件、日志、缓存和本地环境。
- 不得把未验证写成已验证，不得删除来源版本和修改记录。

## 完成要求

1. 先向用户复述修正计划，等待确认后再改。
2. 按上述路径逐项补齐或清理。
3. 更新 lineage.yaml、return-manifest.yaml、${isReturn ? "完成报告、修改报告" : "tool.yaml、README、修改边界、完成报告"}和验证记录。
4. 最后重新生成一个独立的 \`${isReturn ? "return-package.zip" : "tool-package.zip"}\`，不要包含任务工作区其他目录。
`;
}

export function buildFixPrompt(findings: ReturnFinding[], standardVersion: string) {
  return remediationPrompt(findings, standardVersion, "return");
}

export function buildToolFixPrompt(
  findings: ReturnFinding[],
  standardVersion: string,
) {
  return remediationPrompt(findings, standardVersion, "tool");
}
