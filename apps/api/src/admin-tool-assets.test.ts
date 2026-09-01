import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { ToolAssetService } from "./services/tool-asset-service.js";
import { MemoryIdentityRepository } from "./testing/memory-identity-repository.js";
import { MemoryToolAssetRepository } from "./testing/memory-tool-asset-repository.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 3100,
  SESSION_HOURS: 12,
  ACTIVATION_HOURS: 72,
  COOKIE_SECURE: false,
};

function sessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" ? value.split(";")[0] ?? "" : "";
}

const versionPayload = (version: string) => ({
  version,
  verification: "verified",
  changeSummary: `${version} 稳定版`,
  standardVersion: "v0.28",
  risks: [],
  artifactStorageKey: `tools/test/${version}.zip`,
  artifactSizeBytes: 1024,
  artifactSha256: "a".repeat(64),
  downloadUrl: `/v1/downloads/tools/test/${version}`,
});

describe("admin tool asset lifecycle API", () => {
  const identity = new MemoryIdentityRepository();
  const repository = new MemoryToolAssetRepository();
  const assets = new ToolAssetService(repository, identity);
  const { app, accounts } = buildApp(
    identity,
    config,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    assets,
  );
  let cookie = "";
  let toolId = "";
  let firstVersionId = "";

  before(async () => {
    const [invitation] = await accounts.inviteUsers(undefined, randomUUID(), [{
      account: "maintainer",
      displayName: "工具维护人员",
      role: "maintainer",
    }]);
    assert.ok(invitation);
    await accounts.activate(invitation.activationToken, "MaintainerPassword2026");
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "maintainer", password: "MaintainerPassword2026" },
    });
    cookie = sessionCookie(login);
  });

  after(async () => {
    await app.close();
  });

  it("requires maintenance permission", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/admin/tools" });
    assert.equal(response.statusCode, 401);
  });

  it("creates a metadata draft before any version is published", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/tools",
      headers: { cookie },
      payload: {
        slug: "word-list-extractor",
        name: "单词表提取工具",
        problem: "从教材中提取单词表",
        result: "结构化单词表",
        principle: "解析文档结构并识别单词字段",
        kind: "executable",
        categorySlug: "pdf-processing",
        moduleSlugs: ["content-production"],
        tagSlugs: ["ocr"],
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().tool.status, "draft");
    assert.equal(response.json().tool.latestVersionId, null);
    toolId = response.json().tool.id;

    const featuredDraft = await app.inject({
      method: "PUT",
      url: `/v1/admin/tools/${toolId}`,
      headers: { cookie },
      payload: {
        name: "单词表提取工具",
        problem: "从教材中提取单词表",
        result: "结构化单词表",
        principle: "解析文档结构并识别单词字段",
        kind: "executable",
        categorySlug: "pdf-processing",
        moduleSlugs: ["content-production"],
        tagSlugs: ["ocr"],
        featured: true,
        featuredOrder: 10,
      },
    });
    assert.equal(featuredDraft.statusCode, 409);
  });

  it("publishes new immutable versions and makes the newest one default", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions`,
      headers: { cookie },
      payload: versionPayload("v1.0.0"),
    });
    assert.equal(first.statusCode, 201);
    firstVersionId = first.json().tool.versions[0].id;

    const publishedFirst = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions/${firstVersionId}/publish`,
      headers: { cookie },
    });
    assert.equal(publishedFirst.statusCode, 200);
    assert.equal(publishedFirst.json().tool.latestVersion, "v1.0.0");

    const second = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions`,
      headers: { cookie },
      payload: versionPayload("v1.1.0"),
    });
    const secondVersionId = second.json().tool.versions[0].id;
    const publishedSecond = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions/${secondVersionId}/publish`,
      headers: { cookie },
    });
    assert.equal(publishedSecond.statusCode, 200);
    assert.equal(publishedSecond.json().tool.latestVersion, "v1.1.0");
    assert.equal(publishedSecond.json().tool.versionCount, 2);

    const featured = await app.inject({
      method: "PUT",
      url: `/v1/admin/tools/${toolId}`,
      headers: { cookie },
      payload: {
        name: "单词表提取工具",
        problem: "从教材中提取单词表",
        result: "结构化单词表",
        principle: "解析文档结构并识别单词字段",
        kind: "executable",
        categorySlug: "pdf-processing",
        moduleSlugs: ["content-production"],
        tagSlugs: ["ocr"],
        featured: true,
        featuredOrder: 10,
      },
    });
    assert.equal(featured.statusCode, 200);
    assert.equal(featured.json().tool.featured, true);
    assert.equal(featured.json().tool.events[0].type, "placement-updated");

    const republish = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions/${secondVersionId}/publish`,
      headers: { cookie },
    });
    assert.equal(republish.statusCode, 409);
  });

  it("keeps history and falls back when the current version is taken offline", async () => {
    const detail = await app.inject({
      method: "GET",
      url: `/v1/admin/tools/${toolId}`,
      headers: { cookie },
    });
    const currentVersionId = detail.json().tool.latestVersionId;
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions/${currentVersionId}/offline`,
      headers: { cookie },
      payload: { reason: "发现兼容性问题，暂时关闭下载" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().tool.latestVersionId, firstVersionId);
    assert.equal(response.json().tool.latestVersion, "v1.0.0");
    assert.equal(response.json().tool.versions.length, 2);
    assert.equal(
      response.json().tool.versions.find(
        (item: { id: string }) => item.id === currentVersionId,
      ).status,
      "offline",
    );

    const relisted = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/versions/${currentVersionId}/publish`,
      headers: { cookie },
    });
    assert.equal(relisted.statusCode, 200);
    assert.equal(relisted.json().tool.latestVersionId, currentVersionId);

    const toolOffline = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/offline`,
      headers: { cookie },
      payload: { reason: "临时停止整个工具展示" },
    });
    assert.equal(toolOffline.json().tool.status, "offline");
    assert.equal(toolOffline.json().tool.featured, false);

    const toolRelisted = await app.inject({
      method: "POST",
      url: `/v1/admin/tools/${toolId}/publish`,
      headers: { cookie },
    });
    assert.equal(toolRelisted.statusCode, 200);
    assert.equal(toolRelisted.json().tool.status, "published");
  });
});
