import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/playwright",
  fullyParallel: false,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: [
    {
      command: "pnpm dev:api:test",
      url: "http://127.0.0.1:3100/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        PLATFORM_ENV: "test",
        PLATFORM_STORAGE_ROOT: "var/test",
        SESSION_COOKIE_NAME: "atw_test_session",
        AI_PROVIDER: "mock",
        EXTERNAL_AI_DATA_MODE: "disabled",
        DEEPSEEK_API_KEY: "",
      },
    },
    {
      command: "pnpm dev:test",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_DIST_DIR: ".next-test",
        NEXT_PUBLIC_PLATFORM_ENV: "test",
        API_INTERNAL_URL: "http://127.0.0.1:3100",
      },
    },
  ],
});
