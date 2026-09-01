import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("缺少 DATABASE_URL");

const sql = postgres(databaseUrl, { max: 1 });
const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [existing] = await sql`
      SELECT name FROM schema_migrations WHERE name = ${file}
    `;
    if (existing) continue;

    const source = await readFile(path.join(migrationsDirectory, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(source);
      await transaction`
        INSERT INTO schema_migrations (name) VALUES (${file})
      `;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
