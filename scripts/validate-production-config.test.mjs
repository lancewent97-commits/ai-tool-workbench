import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const validEnvironment = {
  PATH: process.env.PATH ?? "",
  PLATFORM_ENV: "production",
  NODE_ENV: "production",
  COOKIE_SECURE: "true",
  DATABASE_NAME: "workbench_production",
  DATABASE_USER: "workbench",
  DATABASE_PASSWORD: "a-long-random-password-for-tests",
  DATABASE_URL: "postgres://workbench:a-long-random-password-for-tests@127.0.0.1:5433/workbench_production",
  DATABASE_ADMIN_URL: "postgres://workbench:a-long-random-password-for-tests@127.0.0.1:5433/postgres",
  PLATFORM_STORAGE_HOST_ROOT: "/srv/workbench/data",
  BACKUP_ROOT: "/backup/workbench",
  SESSION_COOKIE_NAME: "workbench_production_session",
  BOOTSTRAP_ORGANIZATION: "Workbench Team",
  BOOTSTRAP_ADMIN_ACCOUNT: "workbench-admin",
  BOOTSTRAP_ADMIN_NAME: "Workbench Administrator",
  AI_PROVIDER: "mock",
  DEEPSEEK_API_KEY: "",
};

function validate(overrides = {}) {
  return spawnSync(process.execPath, ["scripts/validate-production-config.mjs"], {
    cwd: projectRoot,
    env: { ...validEnvironment, ...overrides },
    encoding: "utf8",
  });
}

test("正式环境配置齐全时通过并提醒 Mock AI 边界", () => {
  const result = validate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已通过/);
  assert.match(result.stderr, /Mock AI/);
});

test("正式环境拒绝缺失密码和个人外部模型", () => {
  const result = validate({
    DATABASE_PASSWORD: "",
    AI_PROVIDER: "external-dev",
    DEEPSEEK_API_KEY: "personal-key-must-not-be-printed",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_PASSWORD 未配置/);
  assert.match(result.stderr, /禁止 AI_PROVIDER=external-dev/);
  assert.doesNotMatch(result.stderr, /personal-key-must-not-be-printed/);
});
