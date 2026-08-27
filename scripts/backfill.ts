import { PGlite } from "@electric-sql/pglite";
import { Client, neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import ws from "ws";

import { closeDatabase, DEFAULT_LOCAL_DATABASE_DIRECTORY } from "@/lib/db";
import { runBackfill } from "@/lib/backfill";
import { runMigrations, type QueryClient, type QueryResult } from "@/lib/migrations";

// Next does not automatically load `.env.local` for standalone tsx scripts.
// Load it before selecting the database, while keeping the loader silent so
// connection strings and other secrets never appear in command output.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  error: () => undefined,
  info: () => undefined,
});

type ClosableDatabase = {
  database: QueryClient;
  close: () => Promise<void>;
};

function normalizeResult<Row extends Record<string, unknown> = Record<string, unknown>>(
  result: unknown,
): QueryResult<Row> {
  if (Array.isArray(result)) return { rows: result as Row[] };
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result as QueryResult<Row>;
  }
  throw new Error("Unexpected database query result");
}

function localDataDirectory(): string {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (!configured) return DEFAULT_LOCAL_DATABASE_DIRECTORY;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(configured)) return configured;
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

async function openPglite(dataDir: string, createDirectory: boolean): Promise<ClosableDatabase> {
  if (createDirectory && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  const database: QueryClient = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> {
      return normalizeResult<Row>(await pglite.query<Row>(query, params));
    },
  };
  return {
    database,
    close: async () => {
      if (!pglite.closed) await pglite.close();
    },
  };
}

async function openDirectNeon(databaseUrl: string): Promise<ClosableDatabase> {
  const client = new Client(databaseUrl);
  client.neonConfig.webSocketConstructor = ws;
  await client.connect();
  return {
    database: {
      async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        query: string,
        params?: unknown[],
      ): Promise<QueryResult<Row>> {
        const result = await client.query<Row>(query, params);
        return { rows: result.rows };
      },
    },
    close: () => client.end(),
  };
}

function openPooledNeon(databaseUrl: string): ClosableDatabase {
  const sql = neon(databaseUrl);
  return {
    database: {
      async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        query: string,
        params?: unknown[],
      ): Promise<QueryResult<Row>> {
        return normalizeResult<Row>(await sql.query(query, params));
      },
    },
    close: async () => undefined,
  };
}

async function openDatabase(apply: boolean): Promise<ClosableDatabase> {
  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const pooledUrl = process.env.DATABASE_URL?.trim();

  if (apply && pooledUrl && !unpooledUrl) {
    throw new Error("Applying the backfill requires DATABASE_URL_UNPOOLED; refusing to write through DATABASE_URL");
  }
  if (unpooledUrl) return openDirectNeon(unpooledUrl);
  if (pooledUrl) return openPooledNeon(pooledUrl);

  if (process.env.NODE_ENV === "production") {
    throw new Error("A hosted database URL is required in production; refusing to use local PGlite");
  }

  const dataDir = localDataDirectory();
  if (!apply && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(dataDir) && !existsSync(dataDir)) {
    throw new Error(`Local PGlite database does not exist at ${dataDir}; run npm run db:migrate first`);
  }
  return openPglite(dataDir, apply);
}

function parseApplyFlag(): boolean {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run backfill [-- --apply]");
    console.log("Default mode is dry-run; --apply is required to write historical data.");
    process.exit(0);
  }
  if (args.some((arg) => arg !== "--apply")) {
    throw new Error("Unknown argument. Use no arguments for a dry run or --apply to write the backfill.");
  }
  return args.includes("--apply");
}

function printReport(report: Awaited<ReturnType<typeof runBackfill>>): void {
  console.log(`Invoice backfill ${report.mode}`);
  console.log(`Profiles: ${report.profiles.created.length} created, ${report.profiles.reused.length} reused, ${report.profiles.renamed.length} renamed, ${report.profiles.merged.length} merged`);
  if (report.profiles.created.length) console.log(`  created: ${report.profiles.created.join(", ")}`);
  if (report.profiles.renamed.length) {
    console.log(`  renamed: ${report.profiles.renamed.map((item) => `${item.from} -> ${item.to}`).join(", ")}`);
  }
  if (report.profiles.merged.length) {
    for (const merge of report.profiles.merged) {
      const duplicateText = merge.skippedDuplicateReferences.length
        ? `, skipped duplicate references: ${merge.skippedDuplicateReferences.join(", ")}`
        : "";
      console.log(`  merged: ${merge.alias} -> ${merge.canonical} (${merge.movedEntries} entries moved${duplicateText})`);
    }
  }
  console.log(`Invoices: ${report.invoices.inserted.length} inserted, ${report.invoices.skipped.length} skipped, expected total ${report.invoices.expectedTotalCents} amountCents`);
  if (report.invoices.skipped.length) {
    console.log(`  skipped: ${report.invoices.skipped.map((item) => item.invoiceNumber).join(", ")}`);
  }
  console.log(`Sequence: ${report.sequence.action}; next automatic number ${report.sequence.nextInvoiceNumber}`);
  console.log(JSON.stringify(report, null, 2));
}

async function main(): Promise<void> {
  const apply = parseApplyFlag();
  const opened = await openDatabase(apply);
  try {
    if (apply) {
      await runMigrations(opened.database, { local: !process.env.DATABASE_URL_UNPOOLED?.trim() });
    }
    const report = await runBackfill(opened.database, { apply });
    printReport(report);
  } finally {
    await opened.close();
    // Keep the app's cached local database from holding the directory open if
    // this script is ever invoked through an already-imported app module.
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(`Invoice backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
