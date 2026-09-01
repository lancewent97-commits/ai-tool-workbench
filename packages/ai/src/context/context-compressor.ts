import type { AiMessage, RequirementBrief } from "@ai-tool-workbench/contracts";

export function buildDeterministicSummary(
  brief: RequirementBrief,
  messages: AiMessage[],
) {
  const recent = messages.slice(-3).map((message) =>
    `${message.role === "user" ? "用户" : "AI"}：${message.content}`).join("\n");
  return [
    `目标：${brief.goal}`,
    `输入：${brief.input}`,
    `交付：${brief.deliverables.join("、") || "待确认"}`,
    `限制：${brief.constraints.join("、") || "无"}`,
    `假设：${brief.assumptions.join("、") || "无"}`,
    `待确认：${brief.openQuestions.join("、") || "无"}`,
    `最近进展：\n${recent}`,
  ].join("\n");
}
