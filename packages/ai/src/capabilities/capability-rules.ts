import type { RequirementBrief } from "@ai-tool-workbench/contracts";
import type { ToolCandidate } from "../types.js";

export type CapabilityRule = {
  id: string;
  name: string;
  requirementPattern: RegExp;
  candidatePattern: RegExp;
  rejectionPattern?: RegExp;
};

export const capabilityRules: CapabilityRule[] = [
  {
    id: "document-extraction",
    name: "文档或教材内容提取",
    requirementPattern: /pdf|教材|文档|提取/i,
    candidatePattern: /pdf|教材|文档|提取|ocr/i,
  },
  {
    id: "word-list",
    name: "单词或词表整理",
    requirementPattern: /单词|词表/i,
    candidatePattern: /单词|词表/i,
    rejectionPattern: /(不要|不需要|排除).{0,8}(单词|词表)/i,
  },
  {
    id: "phonetic",
    name: "音标整理",
    requirementPattern: /音标/i,
    candidatePattern: /音标/i,
    rejectionPattern: /(不要|不需要|排除).{0,8}音标/i,
  },
  {
    id: "audio",
    name: "音频或配音生成",
    requirementPattern: /配音|发音|音频|跟读/i,
    candidatePattern: /配音|发音|音频|跟读|mp3/i,
    rejectionPattern: /(不要|不需要|不生成|排除).{0,12}(配音|发音|音频|跟读)/i,
  },
  {
    id: "table",
    name: "可编辑表格整理",
    requirementPattern: /表格|excel/i,
    candidatePattern: /表格|excel/i,
  },
  {
    id: "image-text",
    name: "图片文字识别",
    requirementPattern: /(图片|扫描).{0,12}(文字|表格|提取)|(文字|表格|提取).{0,12}(图片|扫描)/i,
    candidatePattern: /图片|扫描|ocr|图文/i,
  },
  {
    id: "image-compression",
    name: "图片压缩",
    requirementPattern: /图片.{0,8}压缩|压缩.{0,8}图片/i,
    candidatePattern: /图片.{0,8}压缩|压缩.{0,8}图片/i,
  },
  {
    id: "subtitle",
    name: "字幕处理",
    requirementPattern: /字幕|时间轴/i,
    candidatePattern: /字幕|时间轴/i,
  },
  {
    id: "organization-rules",
    name: "命名或目录组织规则",
    requirementPattern: /命名|目录|按.{0,8}(章节|单词|条目).{0,8}组织/i,
    candidatePattern: /命名|目录|按.{0,8}(章节|单词|条目)|组织/i,
  },
  {
    id: "analysis-report",
    name: "分析并生成结论报告",
    requirementPattern: /分析|报告|结论/i,
    candidatePattern: /分析|报告|结论/i,
  },
];

export function requirementCapabilityText(brief: RequirementBrief) {
  return [
    brief.goal,
    brief.input,
    ...brief.deliverables,
    ...brief.constraints,
  ].join(" ");
}

export function candidateCapabilityText(candidate: ToolCandidate) {
  return [
    candidate.toolName,
    candidate.problem,
    candidate.result,
    ...candidate.tags,
  ].join(" ");
}

export function requiredCapabilities(brief: RequirementBrief) {
  const text = requirementCapabilityText(brief);
  const negativeText = [...brief.constraints, ...brief.rejectedOptions].join(" ");
  return capabilityRules.filter((rule) =>
    rule.requirementPattern.test(text)
    && !(rule.rejectionPattern?.test(negativeText) ?? false));
}

export function candidateSupportsCapability(
  candidate: ToolCandidate,
  capability: CapabilityRule,
) {
  return capability.candidatePattern.test(candidateCapabilityText(candidate));
}
