import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PromptRegistry } from "../prompt-runtime/prompt-registry.js";
import { DeepSeekAiProvider } from "../providers/deepseek-ai-provider.js";

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) throw new Error("运行评测前请在本机环境设置DEEPSEEK_API_KEY");
if (process.env.EXTERNAL_AI_DATA_MODE !== "sanitized-test") {
  throw new Error("上下文评测必须设置EXTERNAL_AI_DATA_MODE=sanitized-test");
}

function safeError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");
  }
  return error instanceof Error ? error.message.split("\n")[0] : "未知错误";
}

const provider = new DeepSeekAiProvider({
  apiKey,
  dataMode: "sanitized-test",
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
  timeoutMs: process.env.DEEPSEEK_TIMEOUT_MS
    ? Number(process.env.DEEPSEEK_TIMEOUT_MS)
    : undefined,
});
const prompt = await new PromptRegistry().get("context-compression");
const selectedToolVersionId = randomUUID();
const lastMessageId = randomUUID();
const confirmedFacts = ["输入是可复制文字的脱敏PDF样例"];
const rejectedOptions = ["不要上传真实内部资料"];

try {
  const snapshot = await provider.compress({
    prompt,
    brief: {
      id: randomUUID(),
      version: 2,
      status: "confirmed",
      goal: "从英语教材PDF样例提取单词和音标并生成跟读音频",
      input: "可复制文字的脱敏PDF样例",
      deliverables: ["结构化单词表", "音标清单", "逐词跟读音频"],
      constraints: ["MP3按章节和单词编号命名"],
      assumptions: [],
      confirmedFacts,
      rejectedOptions,
      openQuestions: [],
      selectedToolVersionIds: [selectedToolVersionId],
      createdAt: new Date().toISOString(),
    },
    messages: [{
      id: randomUUID(),
      role: "user",
      content: "请使用脱敏样例，并按章节组织MP3。",
      createdAt: new Date().toISOString(),
    }, {
      id: lastMessageId,
      role: "assistant",
      content: "任务说明已经整理，请确认。",
      createdAt: new Date().toISOString(),
    }],
    previousSnapshot: null,
    lastMessageId,
  });
  const problems = [
    snapshot.summary.trim() ? "" : "摘要为空",
    snapshot.briefVersion === 2 ? "" : "任务说明版本未锁定",
    snapshot.lastMessageId === lastMessageId ? "" : "最后消息未锁定",
    JSON.stringify(snapshot.confirmedFacts) === JSON.stringify(confirmedFacts)
      ? ""
      : "已确认事实未原样保留",
    JSON.stringify(snapshot.rejectedOptions) === JSON.stringify(rejectedOptions)
      ? ""
      : "已否定项未原样保留",
    snapshot.selectedToolVersionIds.includes(selectedToolVersionId)
      ? ""
      : "手选版本未保留",
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(problems.join("；"));
  }
  console.log("PASS context-compression");
  console.log("DeepSeek上下文压缩评测通过：1/1");
} catch (error) {
  console.log("FAIL context-compression");
  throw new Error(`DeepSeek上下文压缩评测未通过：${safeError(error)}`);
}
