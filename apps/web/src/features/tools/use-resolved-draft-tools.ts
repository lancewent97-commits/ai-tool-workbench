"use client";

import type { PackageDraft, ToolVersionSummary } from "@ai-tool-workbench/contracts";
import { useEffect, useState } from "react";
import {
  listCatalogTools,
  listCatalogToolVersions,
} from "@/lib/api/catalog-client";

type DraftSelection = PackageDraft["tools"][number];

export type ResolvedDraftTool = {
  id: string;
  slug: string;
  name: string;
  problem: string;
  versions: ToolVersionSummary[];
};

export function useResolvedDraftTools(selections: DraftSelection[]) {
  const selectionKey = selections
    .map((item) => `${item.toolId}:${item.versionId}`)
    .join("|");
  const [resolved, setResolved] = useState<Record<string, ResolvedDraftTool>>({});
  const [loading, setLoading] = useState(selections.length > 0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!selections.length) {
      queueMicrotask(() => {
        if (!active) return;
        setResolved({});
        setLoading(false);
        setError("");
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (!active) return;
      setResolved({});
      setLoading(true);
      setError("");
    });
    void listCatalogTools({ ids: selections.map((selection) => selection.toolId), pageSize: 100 })
      .then(async (response) => {
        const matches = selections
          .map((selection) => ({
            selection,
            item: response.items.find((tool) => tool.id === selection.toolId),
          }))
          .filter((entry) => entry.item);
        const remote = await Promise.all(matches.map(async ({ item }) => {
          const tool = item!;
          const versions = await listCatalogToolVersions(tool.slug);
          return [tool.id, {
            id: tool.id,
            slug: tool.slug,
            name: tool.name,
            problem: tool.problem,
            versions: versions.items,
          }] as const;
        }));
        if (active) setResolved(Object.fromEntries(remote));
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取所选工具");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // selectionKey is the stable identity of selections for network resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  return {
    items: selections.flatMap((selection) => {
      const tool = resolved[selection.toolId];
      return tool ? [{ selection, tool }] : [];
    }),
    loading,
    error,
  };
}
