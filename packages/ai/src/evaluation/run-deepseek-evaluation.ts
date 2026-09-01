import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PromptRegistry } from "../prompt-runtime/prompt-registry.js";
import { DeepSeekAiProvider } from "../providers/deepseek-ai-provider.js";

const evaluationCaseSchema = z.object({
  id: z.string(),
  message: z.string(),
  expected: z.object({
    minQuestions: z.number().int().nonnegative().default(0),
    maxQuestions: z.number().int().nonnegative().max(3),
    deliverablesInclude: z.array(z.string()),
    deliverablesExclude: z.array(z.string()),
  }),
});

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) throw new Error("运行评测前请在本机环境设置DEEPSEEK_API_KEY");
if (process.env.EXTERNAL_AI_DATA_MODE !== "sanitized-test") {
  throw new Error("运行DeepSeek评测必须设置EXTERNAL_AI_DATA_MODE=sanitized-test");
}

const casesPath = fileURLToPath(
  new URL("../../evals/deepseek-sanitized-cases.json", import.meta.url),
);
const cases = z.array(evaluationCaseSchema).parse(
  JSON.parse(await readFile(casesPath, "utf8")),
);
const selectedCases = process.env.EVAL_CASE_ID
  ? cases.filter((evaluation) => evaluation.id === process.env.EVAL_CASE_ID)
  : cases;
if (selectedCases.length === 0) {
  throw new Error(`没有找到评测用例：${process.env.EVAL_CASE_ID}`);
}
const prompt = await new PromptRegistry().get("requirement-understanding");
const provider = new DeepSeekAiProvider({
  apiKey,
  dataMode: "sanitized-test",
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
  timeoutMs: process.env.DEEPSEEK_TIMEOUT_MS
    ? Number(process.env.DEEPSEEK_TIMEOUT_MS)
    : undefined,
});

const failures: string[] = [];
for (const evaluation of selectedCases) {
  try {
    const result = await provider.understand({
      prompt,
      messages: [{
        id: randomUUID(),
        role: "user",
        content: evaluation.message,
        createdAt: new Date().toISOString(),
      }],
      contextSnapshot: null,
      previousBrief: null,
      selectedToolVersionIds: [],
      maxQuestions: 3,
      clarificationRoundCount: 1,
    });
    const deliverables = result.draft.deliverables.join(" ");
    const problems = [
      result.questions.length < evaluation.expected.minQuestions
        ? `问题数少于${evaluation.expected.minQuestions}`
        : "",
      result.questions.length > evaluation.expected.maxQuestions
        ? `问题数超过${evaluation.expected.maxQuestions}`
        : "",
      ...evaluation.expected.deliverablesInclude.map((term) =>
        deliverables.includes(term) ? "" : `交付物缺少“${term}”`),
      ...evaluation.expected.deliverablesExclude.map((term) =>
        deliverables.includes(term) ? `交付物不应包含“${term}”` : ""),
    ].filter(Boolean);
    if (problems.length > 0) failures.push(`${evaluation.id}: ${problems.join("；")}`);
    console.log(`${problems.length === 0 ? "PASS" : "FAIL"} ${evaluation.id}`);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("；")
      : error instanceof Error
        ? error.message.split("\n")[0]
        : "未知错误";
    failures.push(`${evaluation.id}: 调用或结构校验失败（${message}）`);
    console.log(`FAIL ${evaluation.id}`);
  }
}

if (failures.length > 0) {
  throw new Error(`DeepSeek评测未通过：\n${failures.join("\n")}`);
}
console.log(`DeepSeek评测通过：${selectedCases.length}/${selectedCases.length}`);
