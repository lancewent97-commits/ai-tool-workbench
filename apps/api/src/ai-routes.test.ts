import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  AiOrchestrator,
  MemoryAiStore,
  MockAiProvider,
} from "@ai-tool-workbench/ai";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { CatalogCandidateSource } from "./services/catalog-candidate-source.js";
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

function sessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" ? value.split(";")[0] ?? "" : "";
}

describe("AI conversation API", () => {
  const identity = new MemoryIdentityRepository();
  const tools = new MemoryToolCatalogRepository();
  const memory = new MemoryAiStore();
  const orchestrator = new AiOrchestrator(
    memory,
    new CatalogCandidateSource(tools),
    new MockAiProvider(),
  );
  const { app, accounts } = buildApp(identity, config, tools, orchestrator);
  let employeeCookie = "";

  before(async () => {
    const [invitation] = await accounts.inviteUsers(undefined, randomUUID(), [{
      account: "ai-user",
      displayName: "AI测试用户",
      role: "employee",
    }]);
    assert.ok(invitation);
    await accounts.activate(invitation.activationToken, "AiUserPassword2026");
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "ai-user", password: "AiUserPassword2026" },
    });
    employeeCookie = sessionCookie(login);
  });

  after(async () => {
    await app.close();
  });

  it("requires login before creating an AI task", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/ai/conversations",
      payload: { message: "把PDF整理成表格" },
    });
    assert.equal(response.statusCode, 401);
  });

  it("persists a brief, confirmation and structured recommendation", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/ai/conversations",
      headers: { cookie: employeeCookie },
      payload: { message: "把PDF教材提取成可编辑表格" },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().phase, "brief-review");
    const conversationId = created.json().conversationId;

    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/ai/conversations/${conversationId}/confirm`,
      headers: { cookie: employeeCookie },
    });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().phase, "recommended");
    assert.equal(confirmed.json().recommendation.primary.kind, "primary");
    assert.equal(
      confirmed.json().recommendation.primary.tools[0].toolSlug,
      "pdf-content-extractor",
    );

    const state = await app.inject({
      method: "GET",
      url: `/v1/ai/conversations/${conversationId}`,
      headers: { cookie: employeeCookie },
    });
    assert.equal(state.statusCode, 200);
    assert.equal(state.json().brief.status, "confirmed");
    assert.equal(state.json().contextVersion, 2);
    assert.equal(state.json().messages.length, 3);
  });

  it("does not recommend an unavailable manually selected version", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/ai/conversations",
      headers: { cookie: employeeCookie },
      payload: {
        message: "把PDF教材提取成可编辑表格",
        selectedToolVersionIds: [randomUUID()],
      },
    });
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/ai/conversations/${created.json().conversationId}/confirm`,
      headers: { cookie: employeeCookie },
    });
    assert.equal(confirmed.statusCode, 409);
    assert.equal(confirmed.json().error.code, "CONFLICT");
  });

  it("restores structured clarification questions after navigation", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/ai/conversations",
      headers: { cookie: employeeCookie },
      payload: { message: "帮我处理一下" },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().phase, "clarifying");

    const state = await app.inject({
      method: "GET",
      url: `/v1/ai/conversations/${created.json().conversationId}`,
      headers: { cookie: employeeCookie },
    });
    assert.equal(state.statusCode, 200);
    assert.equal(state.json().questions.length, 2);
    assert.equal(state.json().questions[0].options.length > 0, true);
  });
});
