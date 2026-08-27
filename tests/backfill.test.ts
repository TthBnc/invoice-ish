import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runBackfill } from "@/lib/backfill";
import { runMigrations, type QueryClient, type QueryResult } from "@/lib/migrations";

type TestDatabase = QueryClient & { close: () => Promise<void> };

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
  throw new Error("Unexpected PGlite result");
}

async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite("memory://");
  await pglite.waitReady;
  const database: TestDatabase = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: string,
      params?: unknown[],
    ): Promise<QueryResult<Row>> {
      return normalizeResult<Row>(await pglite.query<Row>(query, params));
    },
    close: () => pglite.close(),
  };
  await runMigrations(database, { local: true });
  return database;
}

async function scalar(database: QueryClient, query: string, params?: unknown[]): Promise<string> {
  const result = await database.query<{ value: unknown }>(query, params);
  return String(result.rows[0]?.value);
}

describe("historical invoice backfill", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("is a zero-write dry run with a complete plan", async () => {
    const report = await runBackfill(database);

    expect(report.mode).toBe("dry-run");
    expect(report.profiles.created).toEqual([
      "másik Bence",
      "Bölö",
      "bölö department",
      "Tomi",
      "zoli",
      "Gabi",
      "zsombro",
      "csabbba",
    ]);
    expect(report.invoices.inserted).toHaveLength(14);
    expect(report.invoices.skipped).toHaveLength(0);
    expect(report.invoices.expectedTotalCents).toBe(3_750_000);
    expect(report.sequence.action).toBe("advance-to-ISH-0015");
    expect(report.sequence.nextInvoiceNumber).toBe("ISH-0015");
    expect(await scalar(database, "SELECT count(*) AS value FROM profiles")).toBe("0");
    expect(await scalar(database, "SELECT count(*) AS value FROM ledger_entries")).toBe("0");
    expect(await scalar(database, "SELECT is_called AS value FROM invoice_number_sequence")).toBe("false");
  });

  it("applies all invoices, preserves historical dates, and prepares ISH-0015", async () => {
    const report = await runBackfill(database, { apply: true });

    expect(report.mode).toBe("apply");
    expect(report.invoices.inserted).toHaveLength(14);
    expect(report.invoices.skipped).toHaveLength(0);
    expect(report.invoices.expectedTotalCents).toBe(3_750_000);
    expect(report.invoices.verifiedTotalCents).toBe(3_750_000);
    expect(report.sequence.nextInvoiceNumber).toBe("ISH-0015");
    expect(await scalar(database, "SELECT count(*) AS value FROM profiles")).toBe("8");
    expect(await scalar(database, "SELECT count(*) AS value FROM ledger_entries")).toBe("14");

    const detail = await database.query<{
      amountCents: unknown;
      createdAt: unknown;
      note: unknown;
      profileName: unknown;
    }>(`
      SELECT
        l.amount_cents::text AS "amountCents",
        l.created_at AS "createdAt",
        l.note,
        p.name AS "profileName"
      FROM ledger_entries l
      JOIN profiles p ON p.id = l.profile_id
      WHERE l.reference_key = 'ish-0007'
    `);
    expect(detail.rows[0]).toMatchObject({
      amountCents: "1500000",
      profileName: "Bölö",
    });
    expect(new Date(String(detail.rows[0]?.createdAt)).toISOString().slice(0, 10)).toBe("2026-06-02");
    expect(String(detail.rows[0]?.note)).toContain("hogy képzeled");

    const next = await scalar(database, "SELECT nextval('invoice_number_sequence') AS value");
    expect(next).toBe("15");
  });

  it("can be rerun without duplicating references or rewinding the sequence", async () => {
    await runBackfill(database, { apply: true });
    const report = await runBackfill(database, { apply: true });

    expect(report.profiles.created).toHaveLength(0);
    expect(report.profiles.reused).toHaveLength(8);
    expect(report.invoices.inserted).toHaveLength(0);
    expect(report.invoices.skipped).toHaveLength(14);
    expect(report.sequence.action).toBe("already-at-or-beyond-ISH-0015");
    expect(report.sequence.nextInvoiceNumber).toBe("ISH-0015");
    expect(await scalar(database, "SELECT count(*) AS value FROM ledger_entries")).toBe("14");
    expect(await scalar(database, "SELECT nextval('invoice_number_sequence') AS value")).toBe("15");
  });

  it("renames and merges aliases without losing or overwriting ledger entries", async () => {
    const canonical = await database.query<{ id: unknown }>(`
      INSERT INTO profiles (name, currency) VALUES ('másik Bence', 'HUF') RETURNING id
    `);
    const alias = await database.query<{ id: unknown }>(`
      INSERT INTO profiles (name, currency) VALUES ('bocsbe', 'HUF') RETURNING id
    `);
    await database.query(`INSERT INTO profiles (name, currency) VALUES ('bölö', 'HUF')`);
    const canonicalId = String(canonical.rows[0]?.id);
    const aliasId = String(alias.rows[0]?.id);

    await database.query(`
      INSERT INTO ledger_entries (profile_id, entry_type, amount_cents, note, reference_key, created_at)
      VALUES ($1, 'charge', 900, 'Canonical existing entry', 'shared-ref', '2026-01-01T00:00:00Z')
    `, [canonicalId]);
    await database.query(`
      INSERT INTO ledger_entries (profile_id, entry_type, amount_cents, note, reference_key, created_at)
      VALUES ($1, 'charge', 1200, 'Alias duplicate entry', 'shared-ref', '2026-01-02T00:00:00Z')
    `, [aliasId]);
    await database.query(`
      INSERT INTO ledger_entries (profile_id, entry_type, amount_cents, note, created_at)
      VALUES ($1, 'charge', 700, 'Alias ordinary entry', '2026-01-03T00:00:00Z')
    `, [aliasId]);

    const report = await runBackfill(database, { apply: true });
    const merge = report.profiles.merged.find((item) => item.alias === "bocsbe");
    expect(merge).toMatchObject({ canonical: "másik Bence", movedEntries: 1 });
    expect(merge?.skippedDuplicateReferences).toContain("shared-ref");
    expect(report.profiles.renamed).toContainEqual({ from: "bölö", to: "Bölö" });
    expect(await scalar(database, "SELECT count(*) AS value FROM profiles WHERE LOWER(name) = 'bocsbe'")).toBe("0");
    expect(await scalar(database, "SELECT count(*) AS value FROM profiles WHERE name = 'Bölö'")).toBe("1");
    expect(await scalar(database, "SELECT count(*) AS value FROM ledger_entries WHERE profile_id = $1", [canonicalId])).toBe("6");
    expect(await scalar(database, "SELECT count(*) AS value FROM ledger_entries WHERE reference_key = 'shared-ref'")).toBe("1");
  });

  it("leaves a sequence beyond the historical range untouched", async () => {
    await database.query("SELECT setval('invoice_number_sequence', 50, true)");
    const report = await runBackfill(database, { apply: true });

    expect(report.sequence.action).toBe("already-at-or-beyond-ISH-0015");
    expect(report.sequence.beforeNext).toBe("51");
    expect(report.sequence.nextInvoiceNumber).toBe("ISH-0051");
    expect(await scalar(database, "SELECT nextval('invoice_number_sequence') AS value")).toBe("51");
  });
});
