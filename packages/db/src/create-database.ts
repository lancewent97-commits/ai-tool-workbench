import postgres from "postgres";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const databaseName = process.env.DATABASE_NAME;

if (!adminUrl) throw new Error("缺少 DATABASE_ADMIN_URL");
if (!databaseName || !/^[a-z][a-z0-9_]*$/.test(databaseName)) {
  throw new Error("DATABASE_NAME 只能使用小写字母、数字和下划线");
}
if (process.env.PLATFORM_ENV !== "production") {
  throw new Error("只允许通过 production 环境配置创建正式数据库");
}

const sql = postgres(adminUrl, { max: 1 });

try {
  const [existing] = await sql`
    SELECT datname FROM pg_database WHERE datname = ${databaseName}
  `;
  if (existing) {
    console.log(`Database ${databaseName} already exists`);
  } else {
    await sql.unsafe(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database ${databaseName}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
