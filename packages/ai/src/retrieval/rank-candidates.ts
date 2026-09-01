import type { RequirementBrief, ToolCatalogItem } from "@ai-tool-workbench/contracts";
import type { ToolCandidate } from "../types.js";

export class SelectedToolUnavailableError extends Error {
  constructor(readonly versionIds: string[]) {
    super(`用户选择的工具版本当前不可用: ${versionIds.join(", ")}`);
    this.name = "SelectedToolUnavailableError";
  }
}

const concepts: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /pdf|教材|文档|章节/i, terms: ["pdf", "教材", "文档", "章节", "提取"] },
  { pattern: /单词|词表|音标/i, terms: ["单词", "词表", "音标", "英语"] },
  { pattern: /配音|发音|音频|跟读/i, terms: ["配音", "发音", "音频", "跟读", "mp3"] },
  { pattern: /表格|excel|数据/i, terms: ["表格", "excel", "数据", "清洗"] },
  { pattern: /图片|图文|ocr/i, terms: ["图片", "图文", "ocr", "扫描"] },
  { pattern: /字幕|视频/i, terms: ["字幕", "视频", "时间轴"] },
  { pattern: /配图|插图|图片.*(?:数量|统计)|(?:数量|统计).*图片/i, terms: ["配图", "插图", "数量", "统计", "核验"] },
  { pattern: /字体|字形|字重/i, terms: ["字体", "字形", "字重", "识别", "审计"] },
  { pattern: /矢量|svg|illustrator/i, terms: ["矢量", "svg", "illustrator", "分层"] },
  { pattern: /公众号|微信.*文章|文章.*删除/i, terms: ["公众号", "微信", "文章", "删除", "备份"] },
  { pattern: /组卷|题库|出题|题目/i, terms: ["组卷", "题库", "出题", "题目", "答案"] },
  { pattern: /需求|prd|产品经理/i, terms: ["需求", "prd", "产品经理", "验收"] },
  { pattern: /动画|讲题/i, terms: ["动画", "讲题", "分步", "场景"] },
  { pattern: /markdown|网页采集/i, terms: ["markdown", "网页", "采集", "清洗"] },
  { pattern: /阅读训练|专注训练/i, terms: ["阅读", "训练", "专注", "题库"] },
];

const weakChineseTerms = new Set([
  "一个", "这个", "那个", "可以", "需要", "自动", "工具", "处理", "结果",
  "输入", "输出", "使用", "进行", "完成", "支持", "本地", "文件", "用户",
  "内容", "提供", "生成", "相关", "当前", "多个", "全部", "之后", "能够",
]);

function lexicalTerms(value: string) {
  const normalized = value.toLowerCase();
  const ascii = normalized.match(/[a-z0-9][a-z0-9._+-]{1,}/g) ?? [];
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const chinese = new Set<string>();
  for (const run of chineseRuns) {
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= run.length - size; index += 1) {
        const term = run.slice(index, index + size);
        if (!weakChineseTerms.has(term)) chinese.add(term);
      }
    }
  }
  return {
    ascii: new Set(ascii),
    chinese,
  };
}

function lexicalScore(requirement: string, searchable: string) {
  const required = lexicalTerms(requirement);
  const candidate = lexicalTerms(searchable);
  let score = 0;
  for (const term of required.ascii) {
    if (candidate.ascii.has(term)) score += Math.min(8, term.length);
  }
  let matchedChinese = 0;
  for (const term of required.chinese) {
    if (!candidate.chinese.has(term)) continue;
    score += term.length;
    matchedChinese += 1;
    if (matchedChinese >= 24) break;
  }
  return score;
}

function requirementTerms(brief: RequirementBrief) {
  const text = [
    brief.goal,
    brief.input,
    ...brief.deliverables,
    ...brief.constraints,
  ].join(" ").toLowerCase();
  return [...new Set(concepts
    .filter((concept) => concept.pattern.test(text))
    .flatMap((concept) => concept.terms))];
}

export function rankToolCandidates(
  brief: RequirementBrief,
  tools: ToolCatalogItem[],
  selectedToolVersionIds: string[],
): ToolCandidate[] {
  const terms = requirementTerms(brief);
  const requirement = [
    brief.goal,
    brief.input,
    ...brief.deliverables,
    ...brief.constraints,
  ].join(" ");
  const selected = new Set(selectedToolVersionIds);
  return tools
    .map((tool): ToolCandidate => {
      const searchable = [
        tool.name,
        tool.problem,
        tool.result,
        tool.category?.name ?? "",
        ...tool.tags.map((tag) => tag.name),
      ].join(" ").toLowerCase();
      const score = terms.reduce(
        (total, term) => total + (searchable.includes(term.toLowerCase()) ? 2 : 0),
        0,
      ) + lexicalScore(requirement, searchable)
        + (selected.has(tool.latestVersion.id) ? 100 : 0);
      return {
        toolId: tool.id,
        toolSlug: tool.slug,
        toolName: tool.name,
        toolVersionId: tool.latestVersion.id,
        version: tool.latestVersion.version,
        kind: tool.kind,
        problem: tool.problem,
        result: tool.result,
        tags: tool.tags.map((tag) => tag.name),
        verification: tool.latestVersion.verification,
        source: selected.has(tool.latestVersion.id) ? "user-selected" : "ai",
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) =>
      right.score - left.score || left.toolName.localeCompare(right.toolName, "zh-CN"));
}
