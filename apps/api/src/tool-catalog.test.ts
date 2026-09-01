import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { MemoryIdentityRepository } from "./testing/memory-identity-repository.js";
import { MemoryToolCatalogRepository } from "./testing/memory-tool-catalog-repository.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 3100,
  SESSION_HOURS: 12,
  ACTIVATION_HOURS: 72,
  COOKIE_SECURE: false,
};

describe("tool catalog API", () => {
  const identity = new MemoryIdentityRepository();
  const tools = new MemoryToolCatalogRepository();
  const { app } = buildApp(identity, config, tools);

  after(async () => {
    await app.close();
  });

  it("lists editable catalog taxonomy", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/tool-taxonomy" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().modules[0].name, "内容生产");
    assert.equal(response.json().categories[0].slug, "pdf-processing");
  });

  it("filters tools by module, tags and keyword", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/tools?module=content-production&tags=ocr,derived&q=扫描",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 1);
    assert.equal(response.json().items[0].slug, "pdf-scan-precision");
  });

  it("returns detail, immutable versions and visible derivatives", async () => {
    const detail = await app.inject({
      method: "GET",
      url: "/v1/tools/pdf-content-extractor",
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().tool.latestVersion.version, "v2.3");

    const versions = await app.inject({
      method: "GET",
      url: "/v1/tools/pdf-content-extractor/versions",
    });
    assert.equal(versions.statusCode, 200);
    assert.equal(versions.json().items.length, 1);

    const derived = await app.inject({
      method: "GET",
      url: "/v1/tools/pdf-content-extractor/derived",
    });
    assert.equal(derived.statusCode, 200);
    assert.equal(derived.json().items[0].parent.version, "v2.3");
  });

  it("does not silently fall back when a tool is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/tools/not-found",
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "NOT_FOUND");
  });
});
