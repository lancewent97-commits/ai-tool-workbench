import path from "node:path";

const required = [
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_ADMIN_URL",
  "DATABASE_URL",
  "PLATFORM_STORAGE_HOST_ROOT",
  "BACKUP_ROOT",
  "SESSION_COOKIE_NAME",
  "BOOTSTRAP_ORGANIZATION",
  "BOOTSTRAP_ADMIN_ACCOUNT",
  "BOOTSTRAP_ADMIN_NAME",
];

const errors = [];
const warnings = [];
const placeholderPattern = /(replace-me|change-me|example|company-name|公司名称)/i;

for (const key of required) {
  const value = process.env[key]?.trim() ?? "";
  if (!value) errors.push(`${key} 未配置`);
  else if (placeholderPattern.test(value)) errors.push(`${key} 仍是示例占位值`);
}

if (process.env.PLATFORM_ENV !== "production") errors.push("PLATFORM_ENV 必须为 production");
if (process.env.NODE_ENV !== "production") errors.push("NODE_ENV 必须为 production");
if (process.env.COOKIE_SECURE !== "true") errors.push("COOKIE_SECURE 必须为 true");
if (process.env.DATABASE_PASSWORD && process.env.DATABASE_PASSWORD.length < 24) {
  errors.push("DATABASE_PASSWORD 至少需要 24 位");
}

for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"]) {
  const value = process.env[key]?.trim();
  if (!value || placeholderPattern.test(value)) continue;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      errors.push(`${key} 必须使用 PostgreSQL 连接协议`);
    }
    if (decodeURIComponent(url.username) !== process.env.DATABASE_USER) {
      errors.push(`${key} 中的用户名与 DATABASE_USER 不一致`);
    }
    if (decodeURIComponent(url.password) !== process.env.DATABASE_PASSWORD) {
      errors.push(`${key} 中的密码与 DATABASE_PASSWORD 不一致`);
    }
  } catch {
    errors.push(`${key} 不是有效的数据库 URL`);
  }
}

for (const key of ["PLATFORM_STORAGE_HOST_ROOT", "BACKUP_ROOT"]) {
  const value = process.env[key]?.trim();
  if (value && !path.isAbsolute(value)) errors.push(`${key} 必须是主机上的绝对路径`);
}

if (
  process.env.PLATFORM_STORAGE_HOST_ROOT
  && process.env.BACKUP_ROOT
  && path.resolve(process.env.PLATFORM_STORAGE_HOST_ROOT) === path.resolve(process.env.BACKUP_ROOT)
) errors.push("BACKUP_ROOT 不能与平台文件存储目录相同");

if (process.env.AI_PROVIDER === "external-dev") errors.push("正式环境禁止 AI_PROVIDER=external-dev");
if (process.env.DEEPSEEK_API_KEY?.trim()) errors.push("正式环境不得配置个人 DeepSeek API Key");
if (process.env.AI_PROVIDER === "mock") warnings.push("当前使用 Mock AI，AI 组包只能用于正式环境界面预览，不能作为真实推荐能力");
if (process.env.AI_PROVIDER === "internal") warnings.push("请确认公司内部模型 Provider 已经实现并通过联调");

if (errors.length) {
  console.error("正式环境配置未通过：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("正式环境必填配置已通过静态检查。");
for (const warning of warnings) console.warn(`提醒：${warning}`);
