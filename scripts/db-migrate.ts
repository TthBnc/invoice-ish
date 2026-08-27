import { closeDatabase, getDatabase } from "../lib/db";
import { runMigrations } from "../lib/migrations";

async function migrate(): Promise<void> {
  const database = getDatabase();
  await runMigrations(database, { local: !process.env.DATABASE_URL?.trim() });
}

migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  if (!process.env.DATABASE_URL?.trim()) {
    await closeDatabase();
  }
});
