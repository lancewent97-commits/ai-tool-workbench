import {
  derivedToolsResponseSchema,
  toolCatalogDetailResponseSchema,
  toolCatalogListResponseSchema,
  toolTaxonomyResponseSchema,
  toolVersionsResponseSchema,
} from "@ai-tool-workbench/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ToolCatalogService } from "../services/tool-catalog-service.js";

const slugParamsSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export function registerToolCatalogRoutes(
  app: FastifyInstance,
  catalog: ToolCatalogService,
) {
  app.get("/v1/tool-taxonomy", async () =>
    toolTaxonomyResponseSchema.parse(await catalog.taxonomy()));

  app.get("/v1/tools", async (request) => {
    const query = catalog.parseQuery(request.query as Record<string, unknown>);
    return toolCatalogListResponseSchema.parse(await catalog.list(query));
  });

  app.get("/v1/tools/:slug", async (request) => {
    const { slug } = slugParamsSchema.parse(request.params);
    return toolCatalogDetailResponseSchema.parse(await catalog.detail(slug));
  });

  app.get("/v1/tools/:slug/versions", async (request) => {
    const { slug } = slugParamsSchema.parse(request.params);
    return toolVersionsResponseSchema.parse(await catalog.versions(slug));
  });

  app.get("/v1/tools/:slug/derived", async (request) => {
    const { slug } = slugParamsSchema.parse(request.params);
    return derivedToolsResponseSchema.parse(await catalog.derived(slug));
  });
}
