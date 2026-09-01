import {
  platformAiPolicy,
  rankToolCandidates,
  SelectedToolUnavailableError,
  type ToolCandidate,
  type ToolCandidateSource,
} from "@ai-tool-workbench/ai";
import {
  toolCatalogQuerySchema,
  type RequirementBrief,
} from "@ai-tool-workbench/contracts";
import type { ToolCatalogRepository } from "@ai-tool-workbench/db";

export class CatalogCandidateSource implements ToolCandidateSource {
  constructor(private readonly repository: ToolCatalogRepository) {}

  async search(brief: RequirementBrief, selectedToolVersionIds: string[]) {
    const [catalog, selected] = await Promise.all([
      this.listPublishedTools(),
      this.repository.findToolsByVersionIds(selectedToolVersionIds),
    ]);
    const foundSelectedIds = new Set(selected.map((item) => item.version.id));
    const unavailable = selectedToolVersionIds.filter((id) => !foundSelectedIds.has(id));
    if (unavailable.length > 0) throw new SelectedToolUnavailableError(unavailable);

    const protectedCandidates: ToolCandidate[] = selected.map(({ tool, version }) => ({
      toolId: tool.id,
      toolSlug: tool.slug,
      toolName: tool.name,
      toolVersionId: version.id,
      version: version.version,
      kind: tool.kind,
      problem: tool.problem,
      result: tool.result,
      tags: tool.tags.map((tag) => tag.name),
      verification: version.verification,
      source: "user-selected",
      score: 1_000,
    }));
    const protectedIds = new Set(protectedCandidates.map((item) => item.toolVersionId));
    const ranked = rankToolCandidates(
      brief,
      catalog.items,
      selectedToolVersionIds,
    ).filter((candidate) => !protectedIds.has(candidate.toolVersionId));

    return [
      ...protectedCandidates,
      ...ranked.slice(0, Math.max(
        0,
        platformAiPolicy.maxCandidates - protectedCandidates.length,
      )),
    ];
  }

  private async listPublishedTools() {
    const pageSize = 100;
    const query = toolCatalogQuerySchema.parse({ sort: "newest", page: 1, pageSize });
    const first = await this.repository.listTools(query);
    const items = [...first.items];
    for (let page = 2; items.length < first.total; page += 1) {
      const next = await this.repository.listTools({ ...query, page });
      if (!next.items.length) break;
      items.push(...next.items);
    }
    return { ...first, items };
  }
}
