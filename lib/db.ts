import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { runMigrations, type QueryClient, type QueryResult } from "./migrations";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseConfigurationError";
  }
}

export type DatabaseRow = Record<string, unknown>;
export type Database = QueryClient;

function normalizeResult<Row extends DatabaseRow = DatabaseRow>(result: unknown): QueryResult<Row> {
  if (Array.isArray(result)) {
    return { rows: result as Row[] };
  }

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

function createNeonDatabase(databaseUrl: string): Database {
  const sql = neon(databaseUrl);

  return {
    async query<Row extends DatabaseRow = DatabaseRow>(
      query: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> {
      const result = await sql.query(query, params);
      return normalizeResult<Row>(result);
    },
  };
}

type LocalDatabaseState = {
  dataDir: string;
  database: Database;
  pglite: PGlite;
  ready: Promise<void>;
};

type GlobalDatabaseState = typeof globalThis & {
  __invoiceIshLocalDatabase?: LocalDatabaseState;
};

const globalDatabaseState = globalThis as GlobalDatabaseState;
const defaultLocalDataDir = resolve(process.cwd(), ".data", "pglite");
let cachedUrl: string | undefined;
let cachedDatabase: Database | undefined;

export const DEFAULT_LOCAL_DATABASE_DIRECTORY = defaultLocalDataDir;

function localDataDirectory(): string {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (!configured) {
    return defaultLocalDataDir;
  }

  // PGlite also supports memory:// for short-lived tests and other supported
  // filesystem URI prefixes. Filesystem paths remain relative to the project.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(configured)) {
    return configured;
  }

  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function createLocalDatabase(dataDir: string): LocalDatabaseState {
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const pglite = new PGlite(dataDir);
  const migrationDatabase: Database = {
    async query<Row extends DatabaseRow = DatabaseRow>(
      query: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> {
      const result = await pglite.query<Row>(query, params);
      return normalizeResult<Row>(result);
    },
  };

  const ready = (async () => {
    await pglite.waitReady;
    await runMigrations(migrationDatabase, { local: true });
  })();

  const database: Database = {
    async query<Row extends DatabaseRow = DatabaseRow>(
      query: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> {
      await ready;
      const result = await pglite.query<Row>(query, params);
      return normalizeResult<Row>(result);
    },
  };

  return { dataDir, database, pglite, ready };
}

/**
 * Return the configured database. Neon is used whenever DATABASE_URL is set;
 * local development and tests otherwise use a persistent, migration-backed
 * PGlite database. Production intentionally fails closed without Neon.
 */
export function getDatabase(): Database {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    if (!cachedDatabase || cachedUrl !== databaseUrl) {
      cachedUrl = databaseUrl;
      cachedDatabase = createNeonDatabase(databaseUrl);
    }

    return cachedDatabase;
  }

  if (process.env.NODE_ENV === "production") {
    throw new DatabaseConfigurationError();
  }

  const dataDir = localDataDirectory();
  const existing = globalDatabaseState.__invoiceIshLocalDatabase;
  if (existing?.dataDir === dataDir) {
    return existing.database;
  }

  const state = createLocalDatabase(dataDir);
  globalDatabaseState.__invoiceIshLocalDatabase = state;
  return state.database;
}

/** Close the local client, primarily for isolated integration tests. */
export async function closeDatabase(): Promise<void> {
  const state = globalDatabaseState.__invoiceIshLocalDatabase;
  if (!state) {
    return;
  }

  delete globalDatabaseState.__invoiceIshLocalDatabase;
  await state.ready.catch(() => undefined);
  if (!state.pglite.closed) {
    await state.pglite.close();
  }
}
