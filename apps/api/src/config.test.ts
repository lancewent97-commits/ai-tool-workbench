import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readServerConfig } from "./config.js";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://example",
  COOKIE_SECURE: "false",
};

describe("AI server configuration", () => {
  it("requires an explicit sanitized mode and key for DeepSeek", () => {
    assert.throws(() => readServerConfig({
      ...base,
      AI_PROVIDER: "external-dev",
    }));
    assert.throws(() => readServerConfig({
      ...base,
      AI_PROVIDER: "external-dev",
      DEEPSEEK_API_KEY: "test-key",
      EXTERNAL_AI_DATA_MODE: "disabled",
    }));
  });

  it("accepts DeepSeek only with development safeguards configured", () => {
    const config = readServerConfig({
      ...base,
      AI_PROVIDER: "external-dev",
      DEEPSEEK_API_KEY: "test-key",
      EXTERNAL_AI_DATA_MODE: "sanitized-test",
    });
    assert.equal(config.DEEPSEEK_MODEL, "deepseek-v4-flash");
    assert.equal(config.DEEPSEEK_BASE_URL, "https://api.deepseek.com");
  });

  it("keeps the formal platform isolated from external development models", () => {
    assert.throws(() => readServerConfig({
      ...base,
      PLATFORM_ENV: "production",
      AI_PROVIDER: "external-dev",
      DEEPSEEK_API_KEY: "test-key",
      EXTERNAL_AI_DATA_MODE: "sanitized-test",
    }));

    const config = readServerConfig({
      ...base,
      PLATFORM_ENV: "production",
      PLATFORM_STORAGE_ROOT: "var/production",
      SESSION_COOKIE_NAME: "atw_production_session",
      AI_PROVIDER: "mock",
    });
    assert.equal(config.PLATFORM_ENV, "production");
    assert.equal(config.PLATFORM_STORAGE_ROOT, "var/production");
    assert.equal(config.SESSION_COOKIE_NAME, "atw_production_session");
  });
});
