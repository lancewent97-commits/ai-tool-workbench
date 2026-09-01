import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { PackageDraft, Task } from "@ai-tool-workbench/contracts";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { MemoryIdentityRepository } from "./testing/memory-identity-repository.js";
import { MemoryTaskWorkspaceRepository } from "./testing/memory-task-workspace-repository.js";

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

describe("task workspace API", () => {
  const identity = new MemoryIdentityRepository();
  const workspace = new MemoryTaskWorkspaceRepository();
  const { app, accounts } = buildApp(
    identity,
    config,
    undefined,
    undefined,
    workspace,
  );
  const taskId = randomUUID();
  let ownerCookie = "";
  let otherCookie = "";

  before(async () => {
    const organizationId = randomUUID();
    const invitations = await accounts.inviteUsers(undefined, organizationId, [
      { account: "workspace-owner", displayName: "任务本人", role: "employee" },
      { account: "workspace-other", displayName: "其他员工", role: "employee" },
    ]);
    const owner = invitations[0];
    const other = invitations[1];
    assert.ok(owner && other);
    await accounts.activate(owner.activationToken, "WorkspaceOwner2026");
    await accounts.activate(other.activationToken, "WorkspaceOther2026");

    const ownerLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "workspace-owner", password: "WorkspaceOwner2026" },
    });
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "workspace-other", password: "WorkspaceOther2026" },
    });
    ownerCookie = sessionCookie(ownerLogin);
    otherCookie = sessionCookie(otherLogin);

    const task: Task = {
      id: taskId,
      name: "整理PDF教材",
      goal: "生成结构化单词表",
      input: "PDF",
      deliverables: ["结构化单词表"],
      stage: "recommended",
      updatedAt: new Date().toISOString(),
      needsUserAction: false,
      packageVersionIds: [],
    };
    workspace.seedTask(owner.user.id, task);
  });

  after(async () => {
    await app.close();
  });

  it("lists only the current user's tasks", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/v1/tasks" });
    assert.equal(unauthorized.statusCode, 401);

    const owner = await app.inject({
      method: "GET",
      url: "/v1/tasks",
      headers: { cookie: ownerCookie },
    });
    assert.equal(owner.statusCode, 200);
    assert.equal(owner.json().items[0].id, taskId);

    const other = await app.inject({
      method: "GET",
      url: "/v1/tasks",
      headers: { cookie: otherCookie },
    });
    assert.equal(other.statusCode, 200);
    assert.equal(other.json().total, 0);
  });

  it("persists a draft and advances the task without exposing it to others", async () => {
    const draft: PackageDraft = {
      id: `ai-${taskId}`,
      source: "ai",
      taskId,
      name: "推荐工具组合",
      goal: "生成结构化单词表",
      deliverables: ["结构化单词表"],
      tools: [{
        toolId: "pdf-content-extractor",
        versionId: "pdf-content-extractor-v2.3",
        purpose: "提取PDF内容",
        replaceable: true,
      }],
      plannedComponents: [],
      confirmedSections: [],
      userConfirmedFields: [],
    };
    const saved = await app.inject({
      method: "PUT",
      url: `/v1/package-drafts/${draft.id}`,
      headers: { cookie: ownerCookie },
      payload: { draft },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().revision, 1);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/tasks",
      headers: { cookie: ownerCookie },
    });
    assert.equal(listed.json().items[0].stage, "package-review");

    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/package-drafts/${draft.id}`,
      headers: { cookie: otherCookie },
    });
    assert.equal(forbidden.statusCode, 404);
  });

  it("rejects mismatched and unrelated draft identifiers", async () => {
    const unrelatedTaskId = randomUUID();
    const mismatched = await app.inject({
      method: "PUT",
      url: `/v1/package-drafts/ai-${unrelatedTaskId}`,
      headers: { cookie: ownerCookie },
      payload: {
        draft: {
          id: `ai-${taskId}`,
          source: "ai",
          taskId,
          name: "错误草稿",
          deliverables: [],
          tools: [],
          plannedComponents: [],
          confirmedSections: [],
          userConfirmedFields: [],
        },
      },
    });
    assert.equal(mismatched.statusCode, 400);

    const unrelated = await app.inject({
      method: "PUT",
      url: `/v1/package-drafts/ai-${unrelatedTaskId}`,
      headers: { cookie: ownerCookie },
      payload: {
        draft: {
          id: `ai-${unrelatedTaskId}`,
          source: "ai",
          taskId: unrelatedTaskId,
          name: "无关联任务",
          deliverables: [],
          tools: [],
          plannedComponents: [],
          confirmedSections: [],
          userConfirmedFields: [],
        },
      },
    });
    assert.equal(unrelated.statusCode, 404);
  });
});
