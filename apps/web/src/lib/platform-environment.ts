export type PlatformEnvironment = "test" | "production";

export const platformEnvironment: PlatformEnvironment =
  process.env.NEXT_PUBLIC_PLATFORM_ENV === "production" ? "production" : "test";

export const platformEnvironmentLabel =
  platformEnvironment === "production" ? "正式环境" : "测试环境";
