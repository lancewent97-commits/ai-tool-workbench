import { z } from "zod";

const booleanFromEnvironment = z.preprocess(
  (value) => value === "true" || value === true,
  z.boolean(),
);

const baseConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  SESSION_HOURS: z.coerce.number().positive().default(12),
  ACTIVATION_HOURS: z.coerce.number().positive().default(72),
  COOKIE_SECURE: booleanFromEnvironment.default(false),
});

const serverConfigSchema = baseConfigSchema.extend({
  PLATFORM_ENV: z.enum(["test", "production"]).default("test"),
  DATABASE_URL: z.string().min(1),
  PLATFORM_STORAGE_ROOT: z.string().min(1).default("var/test"),
  SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default("atw_test_session"),
  AI_PROVIDER: z.enum(["mock", "external-dev", "internal"]).default("mock"),
  EXTERNAL_AI_DATA_MODE: z.enum(["disabled", "sanitized-test"]).default("disabled"),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-flash"),
  DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
}).superRefine((config, context) => {
  if (config.PLATFORM_ENV === "production" && config.AI_PROVIDER === "external-dev") {
    context.addIssue({
      code: "custom",
      path: ["AI_PROVIDER"],
      message: "正式平台禁止使用 external-dev 模型",
    });
  }
  if (config.AI_PROVIDER !== "external-dev") return;
  if (!config.DEEPSEEK_API_KEY.trim()) {
    context.addIssue({
      code: "custom",
      path: ["DEEPSEEK_API_KEY"],
      message: "外部开发模型缺少API Key",
    });
  }
  if (config.EXTERNAL_AI_DATA_MODE !== "sanitized-test") {
    context.addIssue({
      code: "custom",
      path: ["EXTERNAL_AI_DATA_MODE"],
      message: "外部开发模型只允许脱敏测试数据模式",
    });
  }
});

export type ApiConfig = z.infer<typeof baseConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return baseConfigSchema.parse(environment);
}

export function readServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const config = serverConfigSchema.parse(environment);
  if (config.PLATFORM_ENV === "production" && config.NODE_ENV === "production" && !config.COOKIE_SECURE) {
    throw new Error("正式环境必须启用 COOKIE_SECURE");
  }
  return config;
}
