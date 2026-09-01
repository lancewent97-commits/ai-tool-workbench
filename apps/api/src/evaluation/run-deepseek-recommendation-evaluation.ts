import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertRecommendationAllowed,
  DeepSeekAiProvider,
  PromptRegistry,
} from "@ai-tool-workbench/ai";
import { requirementBriefSchema } from "@ai-tool-workbench/contracts";
import { PostgresToolCatalogRepository } from "@ai-tool-workbench/db";
import { z } from "zod";
import { readServerConfig } from "../config.js";
import { CatalogCandidateSource } from "../services/catalog-candidate-source.js";

const evaluationCaseSchema = z.object({
  id: z.string(),
  selectedToolSlug: z.string().optional(),
  brief: z.object({
    goal: z.string(),
    input: z.string(),
    deliverables: z.array(z.string()),
    constraints: z.array(z.string()),
    rejectedOptions: z.array(z.string()),
  }),
  expected: z.object({
    coverage: z.enum(["complete", "partial"]),
    requiredToolGroups: z.array(z.object({
      name: z.string(),
      anyOf: z.array(z.string()).min(1),
    })),
    forbiddenTools: z.array(z.string()),
    maximumTools: z.number().int().positive(),
    minimumGaps: z.number().int().nonnegative(),
    productionPromptTerms: z.array(z.string()),
  }),
});

function safeError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");
  }
  return error instanceof Error ? error.message.split("\n")[0] : "未知错误";
}

const config = readServerConfig();
if (config.AI_PROVIDER !== "external-dev") {
  throw new Error("推荐评测要求AI_PROVIDER=external-dev");
}
if (config.EXTERNAL_AI_DATA_MODE !== "sanitized-test") {
  throw new Error("推荐评测只允许EXTERNAL_AI_DATA_MODE=sanitized-test");
}

const casesPath = fileURLToPath(
  new URL("../../evals/deepseek-recommendation-cases.json", import.meta.url),
);
const cases = z.array(evaluationCaseSchema).parse(
  JSON.parse(await readFile(casesPath, "utf8")),
);
const selectedCases = process.env.EVAL_CASE_ID
  ? cases.filter((evaluation) => evaluation.id === process.env.EVAL_CASE_ID)
  : cases;
if (selectedCases.length === 0) {
  throw new Error(`没有找到推荐评测用例：${process.env.EVAL_CASE_ID}`);
}

const repository = PostgresToolCatalogRepository.connect(config.DATABASE_URL);
const candidateSource = new CatalogCandidateSource(repository);
const provider = new DeepSeekAiProvider({
  apiKey: config.DEEPSEEK_API_KEY,
  dataMode: "sanitized-test",
  baseUrl: config.DEEPSEEK_BASE_URL,
  model: config.DEEPSEEK_MODEL,
  timeoutMs: config.DEEPSEEK_TIMEOUT_MS,
});
const prompt = await new PromptRegistry().get("recommendation");
const failures: string[] = [];

try {
  for (const evaluation of selectedCases) {
    try {
      const selectedTool = evaluation.selectedToolSlug
        ? await repository.findToolBySlug(evaluation.selectedToolSlug)
        : null;
      if (evaluation.selectedToolSlug && !selectedTool) {
        throw new Error(`没有找到手选工具：${evaluation.selectedToolSlug}`);
      }
      const selectedToolVersionIds = selectedTool
        ? [selectedTool.latestVersion.id]
        : [];
      const brief = requirementBriefSchema.parse({
        id: randomUUID(),
        version: 1,
        status: "confirmed",
        goal: evaluation.brief.goal,
        input: evaluation.brief.input,
        deliverables: evaluation.brief.deliverables,
        constraints: evaluation.brief.constraints,
        assumptions: [],
        confirmedFacts: [],
        rejectedOptions: evaluation.brief.rejectedOptions,
        openQuestions: [],
        selectedToolVersionIds,
        createdAt: new Date().toISOString(),
      });
      const candidates = await candidateSource.search(
        brief,
        selectedToolVersionIds,
      );
      const recommendation = await provider.recommend({
        prompt,
        brief,
        candidates,
      });
      assertRecommendationAllowed(recommendation, candidates, brief);
      const primary = recommendation.primary!;
      const selectedSlugs = new Set(primary.tools.map((tool) => tool.toolSlug));
      const problems = [
        primary.coverage === evaluation.expected.coverage
          ? ""
          : `覆盖状态应为${evaluation.expected.coverage}`,
        primary.gaps.length >= evaluation.expected.minimumGaps
          ? ""
          : `能力缺口少于${evaluation.expected.minimumGaps}`,
        primary.tools.length <= evaluation.expected.maximumTools
          ? ""
          : `工具数量超过${evaluation.expected.maximumTools}`,
        ...evaluation.expected.requiredToolGroups.map((group) =>
          group.anyOf.some((slug) => selectedSlugs.has(slug))
            ? ""
            : `缺少${group.name}`),
        ...evaluation.expected.forbiddenTools.map((slug) =>
          selectedSlugs.has(slug) ? `不应选择${slug}` : ""),
        ...evaluation.expected.productionPromptTerms.map((term) =>
          primary.gaps.some((gap) => gap.productionPrompt.includes(term))
            ? ""
            : `生产提示词缺少“${term}”`),
      ].filter(Boolean);
      if (problems.length > 0) {
        failures.push(`${evaluation.id}: ${problems.join("；")}`);
        console.log(
          `  candidates=${candidates.map((candidate) => candidate.toolSlug).join(",")}`,
        );
        console.log(
          `  gapNames=${primary.gaps.map((gap) => gap.name).join(",") || "none"}`,
        );
      }
      console.log(
        `${problems.length === 0 ? "PASS" : "FAIL"} ${evaluation.id}`
        + ` coverage=${primary.coverage}`
        + ` tools=${primary.tools.map((tool) => tool.toolSlug).join(",") || "none"}`
        + ` gaps=${primary.gaps.length}`,
      );
    } catch (error) {
      failures.push(`${evaluation.id}: 调用或校验失败（${safeError(error)}）`);
      console.log(`FAIL ${evaluation.id}`);
    }
  }
} finally {
  await repository.close();
}

if (failures.length > 0) {
  throw new Error(`DeepSeek推荐评测未通过：\n${failures.join("\n")}`);
}
console.log(`DeepSeek推荐评测通过：${selectedCases.length}/${selectedCases.length}`);
