import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
};

export type QueryClient = {
  query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ) => Promise<QueryResult<Row>>;
};

const migrationsDirectory = join(process.cwd(), "db", "migrations");

/**
 * Split migration files into executable statements while preserving quoted
 * strings, comments, and dollar-quoted PostgreSQL blocks.
 */
export function sqlStatements(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let quote: "single" | "double" | "dollar" | undefined;
  let dollarTag = "";
  let lineComment = false;
  let blockComment = false;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      current += character;
      if (character === "\n") lineComment = false;
      index += 1;
      continue;
    }

    if (blockComment) {
      current += character;
      if (character === "*" && next === "/") {
        current += next;
        index += 2;
        blockComment = false;
      } else {
        index += 1;
      }
      continue;
    }

    if (!quote && character === "-" && next === "-") {
      current += character + next;
      index += 2;
      lineComment = true;
      continue;
    }

    if (!quote && character === "/" && next === "*") {
      current += character + next;
      index += 2;
      blockComment = true;
      continue;
    }

    if (quote === "single") {
      current += character;
      if (character === "'" && next === "'") {
        current += next;
        index += 2;
      } else {
        if (character === "'") quote = undefined;
        index += 1;
      }
      continue;
    }

    if (quote === "double") {
      current += character;
      if (character === '"' && next === '"') {
        current += next;
        index += 2;
      } else {
        if (character === '"') quote = undefined;
        index += 1;
      }
      continue;
    }

    if (quote === "dollar") {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        quote = undefined;
        dollarTag = "";
      } else {
        current += character;
        index += 1;
      }
      continue;
    }

    if (character === "'") {
      quote = "single";
      current += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      quote = "double";
      current += character;
      index += 1;
      continue;
    }

    if (character === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        quote = "dollar";
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    if (character === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else {
      current += character;
    }
    index += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

type MigrationOptions = {
  /** PGlite does not ship the pgcrypto extension; gen_random_uuid is built in. */
  local?: boolean;
};

function isPgcryptoExtensionStatement(statement: string): boolean {
  const withoutLeadingComments = statement
    .replace(
    /^(?:\s*(?:--[^\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/))+/,
    "",
    )
    .trim();
  return /^CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*$/i.test(
    withoutLeadingComments,
  );
}

export async function runMigrations(
  database: QueryClient,
  options: MigrationOptions = {},
): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await database.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.name));
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const source = await readFile(join(migrationsDirectory, file), "utf8");
    for (const statement of sqlStatements(source)) {
      if (options.local && isPgcryptoExtensionStatement(statement)) {
        continue;
      }
      await database.query(statement);
    }
    await database.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }
}
