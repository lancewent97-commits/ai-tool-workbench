import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import { MemoryIdentityRepository } from "./testing/memory-identity-repository.js";

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

describe("identity API", () => {
  const repository = new MemoryIdentityRepository();
  const { app, accounts } = buildApp(repository, config);
  const organizationId = randomUUID();
  let adminCookie = "";

  before(async () => {
    const [invitation] = await accounts.inviteUsers(undefined, organizationId, [{
      account: "admin",
      displayName: "平台管理员",
      role: "admin",
    }]);
    assert.ok(invitation);
    await accounts.activate(invitation.activationToken, "InternalAdmin2026");
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "admin", password: "InternalAdmin2026" },
    });
    assert.equal(response.statusCode, 200);
    adminCookie = sessionCookie(response);
  });

  after(async () => {
    await app.close();
  });

  it("returns service health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
    assert.equal(response.json().environment, "test");
    const readiness = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(readiness.statusCode, 200);
    assert.equal(readiness.json().dependencies.database, "ok");
  });

  it("requires an administrator to import accounts", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/users/import",
      payload: {
        organizationId,
        users: [{ account: "teacher01", displayName: "李老师" }],
      },
    });
    assert.equal(response.statusCode, 401);
  });

  it("exposes unified maintenance read models only to authorized roles", async () => {
    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/admin/ai/status",
    });
    assert.equal(unauthorized.statusCode, 401);

    const users = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: { cookie: adminCookie },
    });
    assert.equal(users.statusCode, 200);
    assert.ok(users.json().items.some((user: { account: string }) => user.account === "admin"));

    const ai = await app.inject({
      method: "GET",
      url: "/v1/admin/ai/status",
      headers: { cookie: adminCookie },
    });
    assert.equal(ai.statusCode, 200);
    assert.equal(ai.json().prompts.length, 3);
    assert.equal(ai.json().constraints.maxClarificationRounds, 2);

    const audit = await app.inject({
      method: "GET",
      url: "/v1/admin/audit-events",
      headers: { cookie: adminCookie },
    });
    assert.equal(audit.statusCode, 200);
    assert.ok(Array.isArray(audit.json().items));
  });

  it("imports, activates and signs in an employee", async () => {
    const importResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/users/import",
      headers: { cookie: adminCookie },
      payload: {
        organizationId,
        users: [{ account: "teacher01", displayName: "李老师", role: "employee" }],
      },
    });
    assert.equal(importResponse.statusCode, 200);
    const invitation = importResponse.json().imported[0];
    assert.equal(invitation.user.status, "invited");

    const activateResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/activate",
      payload: {
        activationToken: invitation.activationToken,
        password: "TeacherPassword2026",
      },
    });
    assert.equal(activateResponse.statusCode, 200);
    assert.equal(activateResponse.json().user.status, "active");
    assert.equal("password" in activateResponse.json().user, false);

    const reusedActivation = await app.inject({
      method: "POST",
      url: "/v1/auth/activate",
      payload: {
        activationToken: invitation.activationToken,
        password: "TeacherPassword2026",
      },
    });
    assert.equal(reusedActivation.statusCode, 400);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "teacher01", password: "TeacherPassword2026" },
    });
    assert.equal(loginResponse.statusCode, 200);
    const employeeCookie = sessionCookie(loginResponse);

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: employeeCookie },
    });
    assert.equal(meResponse.statusCode, 200);
    assert.equal(meResponse.json().user.account, "teacher01");

    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/users/import",
      headers: { cookie: employeeCookie },
      payload: {
        organizationId,
        users: [{ account: "teacher02", displayName: "王老师" }],
      },
    });
    assert.equal(forbiddenResponse.statusCode, 403);

    const forbiddenUserList = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: { cookie: employeeCookie },
    });
    assert.equal(forbiddenUserList.statusCode, 403);

    const forbiddenAiStatus = await app.inject({
      method: "GET",
      url: "/v1/admin/ai/status",
      headers: { cookie: employeeCookie },
    });
    assert.equal(forbiddenAiStatus.statusCode, 403);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: employeeCookie },
    });
    assert.equal(logoutResponse.statusCode, 204);
    const expiredSessionResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: employeeCookie },
    });
    assert.equal(expiredSessionResponse.statusCode, 401);
  });

  it("rejects weak passwords and duplicate accounts", async () => {
    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/users/import",
      headers: { cookie: adminCookie },
      payload: {
        organizationId,
        users: [{ account: "teacher01", displayName: "重复账号" }],
      },
    });
    assert.equal(duplicateResponse.statusCode, 409);

    const [invitation] = await accounts.inviteUsers(undefined, organizationId, [{
      account: "teacher03",
      displayName: "赵老师",
      role: "employee",
    }]);
    assert.ok(invitation);
    const weakPasswordResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/activate",
      payload: {
        activationToken: invitation.activationToken,
        password: "123",
      },
    });
    assert.equal(weakPasswordResponse.statusCode, 400);
    assert.equal(weakPasswordResponse.json().error.code, "VALIDATION_FAILED");
  });
});

describe("environment session isolation", () => {
  it("uses the configured cookie name for login and protected requests", async () => {
    const repository = new MemoryIdentityRepository();
    const isolatedConfig = {
      ...config,
      PLATFORM_ENV: "production",
      SESSION_COOKIE_NAME: "atw_production_session",
    };
    const { app, accounts } = buildApp(repository, isolatedConfig);
    const [invitation] = await accounts.inviteUsers(undefined, randomUUID(), [{
      account: "formal-admin",
      displayName: "正式管理员",
      role: "admin",
    }]);
    assert.ok(invitation);
    await accounts.activate(invitation.activationToken, "FormalAdminPassword2026");

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "formal-admin", password: "FormalAdminPassword2026" },
    });
    const cookie = sessionCookie(login);
    assert.match(cookie, /^atw_production_session=/);

    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().user.account, "formal-admin");
    await app.close();
  });
});

describe("login protection", () => {
  it("locks an account after repeated failed passwords and records the failures", async () => {
    const repository = new MemoryIdentityRepository();
    const { app, accounts } = buildApp(repository, config);
    const [invitation] = await accounts.inviteUsers(undefined, randomUUID(), [{
      account: "protected-user",
      displayName: "受保护账号",
      role: "employee",
    }]);
    assert.ok(invitation);
    await accounts.activate(invitation.activationToken, "CorrectPassword2026");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { account: "protected-user", password: "wrong-password" },
      });
      assert.equal(response.statusCode, 401);
    }
    const locked = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { account: "protected-user", password: "CorrectPassword2026" },
    });
    assert.equal(locked.statusCode, 429);
    assert.equal(
      repository.auditEvents.filter((event) =>
        event.action === "session.login_failed").length,
      5,
    );
    await app.close();
  });
});
