import { formatInvoiceNumber } from "@/src/lib/invoice/format";
import {
  HISTORICAL_INVOICES,
  HISTORICAL_MAX_NUMBER,
  HISTORICAL_PROFILE_NAMES,
  HISTORICAL_TOTAL_FORINT,
  type HistoricalInvoice,
} from "@/scripts/backfill-manifest";
import type { DatabaseRow } from "@/lib/db";
import type { QueryClient } from "@/lib/migrations";

const HUF_SCALE = 100;
const SEQUENCE_TARGET = BigInt(HISTORICAL_MAX_NUMBER);
const SEQUENCE_TARGET_NEXT = SEQUENCE_TARGET + BigInt(1);

type HistoricalProfileRule = {
  canonicalName: string;
  aliases: readonly string[];
};

const PROFILE_RULES: readonly HistoricalProfileRule[] = [
  { canonicalName: "másik Bence", aliases: ["bocsbe"] },
  { canonicalName: "Bölö", aliases: ["bölö"] },
  { canonicalName: "bölö department", aliases: [] },
  { canonicalName: "Tomi", aliases: [] },
  { canonicalName: "zoli", aliases: [] },
  { canonicalName: "Gabi", aliases: [] },
  { canonicalName: "zsombro", aliases: [] },
  { canonicalName: "csabbba", aliases: [] },
];

type ExistingProfile = {
  id: string;
  name: string;
  currency: string;
};

type ExistingLedgerEntry = {
  id: string;
  profileId: string;
  type: "charge" | "payment" | "adjustment";
  amountCents: number;
  note: string | null;
  referenceKey: string | null;
  createdAt: string;
};

type SequenceState = {
  lastValue: bigint;
  isCalled: boolean;
  nextValue: bigint;
};

type BackfillState = {
  profiles: ExistingProfile[];
  ledgerEntries: ExistingLedgerEntry[];
  sequence: SequenceState;
};

type ProfileCreateAction = {
  kind: "create";
  canonicalName: string;
};

type ProfileRenameAction = {
  kind: "rename";
  id: string;
  from: string;
  to: string;
};

type ProfileCurrencyAction = {
  kind: "currency";
  id: string;
  name: string;
  from: string;
  to: "HUF";
};

type ProfileMergeAction = {
  kind: "merge";
  aliasId: string;
  aliasName: string;
  targetId: string;
  targetName: string;
  entryIds: string[];
  plannedMovedEntries: number;
  plannedSkippedDuplicateReferences: string[];
};

type ProfileAction =
  | ProfileCreateAction
  | ProfileRenameAction
  | ProfileCurrencyAction
  | ProfileMergeAction;

type HistoricalInvoicePlan = {
  invoice: HistoricalInvoice;
  referenceKey: string;
  targetProfileId: string | null;
  duplicateReference: boolean;
};

type BackfillPlan = {
  profileActions: ProfileAction[];
  invoices: HistoricalInvoicePlan[];
  sequence: SequenceState;
};

export type BackfillInvoiceSkip = {
  invoiceNumber: string;
  reason: "already-present";
};

export type BackfillMergeReport = {
  alias: string;
  canonical: string;
  movedEntries: number;
  skippedDuplicateReferences: string[];
};

export type BackfillReport = {
  mode: "dry-run" | "apply";
  profiles: {
    created: string[];
    reused: string[];
    renamed: Array<{ from: string; to: string }>;
    currencyUpdated: Array<{ name: string; from: string; to: "HUF" }>;
    merged: BackfillMergeReport[];
    removedAliases: string[];
  };
  invoices: {
    expected: number;
    inserted: string[];
    skipped: BackfillInvoiceSkip[];
    expectedTotalCents: number;
    verifiedTotalCents: number;
  };
  sequence: {
    beforeNext: string;
    afterNext: string;
    action: "advance-to-ISH-0015" | "already-at-or-beyond-ISH-0015";
    nextInvoiceNumber: string;
  };
};

export class BackfillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackfillValidationError";
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizeHistoricalReference(invoiceNumber: string): string {
  return invoiceNumber.trim().toLowerCase();
}

function amountForintToCents(amountForint: number): number {
  const amountCents = amountForint * HUF_SCALE;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BackfillValidationError(`Invalid historical amount for ${amountForint} Ft`);
  }
  return amountCents;
}

function invoiceNote(invoice: HistoricalInvoice): string {
  const itemText = invoice.items
    .map((item) => `${item.description} (${item.amountForint} Ft)`)
    .join("; ");
  return `Invoice ${invoice.invoiceNumber}: ${itemText}`;
}

function issueTimestamp(issueDate: string): string {
  return `${issueDate}T00:00:00.000Z`;
}

function integerValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BackfillValidationError(`Invalid integer returned for ${field}`);
  }
  return parsed;
}

function stringValue(value: unknown, field: string): string {
  if (value === null || value === undefined) {
    throw new BackfillValidationError(`Missing ${field} returned by the database`);
  }
  return String(value);
}

function nullableStringValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function dateValue(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new BackfillValidationError(`Invalid date returned for ${field}`);
  }
  return date.toISOString();
}

function sequenceValue(value: unknown, field: string): bigint {
  const raw = stringValue(value, field).trim();
  if (!/^\d+$/.test(raw)) {
    throw new BackfillValidationError(`Invalid sequence value returned for ${field}`);
  }
  return BigInt(raw);
}

function validateManifest(): void {
  const expectedProfileNames = new Set(HISTORICAL_PROFILE_NAMES.map(normalizeName));
  const seenReferences = new Set<string>();
  let totalForint = 0;

  for (const invoice of HISTORICAL_INVOICES) {
    const reference = normalizeHistoricalReference(invoice.invoiceNumber);
    if (seenReferences.has(reference)) {
      throw new BackfillValidationError(`Duplicate historical invoice ${invoice.invoiceNumber}`);
    }
    seenReferences.add(reference);

    if (!expectedProfileNames.has(normalizeName(invoice.canonicalRecipient))) {
      throw new BackfillValidationError(`Unknown historical profile ${invoice.canonicalRecipient}`);
    }

    const itemTotal = invoice.items.reduce((total, item) => total + item.amountForint, 0);
    if (itemTotal !== invoice.amountForint) {
      throw new BackfillValidationError(`Item total mismatch for ${invoice.invoiceNumber}`);
    }
    amountForintToCents(invoice.amountForint);
    totalForint += invoice.amountForint;
  }

  if (totalForint !== HISTORICAL_TOTAL_FORINT) {
    throw new BackfillValidationError("Historical manifest total is inconsistent");
  }
}

async function queryRows<Row extends DatabaseRow = DatabaseRow>(
  database: QueryClient,
  query: string,
  params?: unknown[],
): Promise<Row[]> {
  return (await database.query<Row>(query, params)).rows;
}

async function loadState(database: QueryClient): Promise<BackfillState> {
  const [profileRows, ledgerRows, sequenceRows] = await Promise.all([
    queryRows(database, `
      SELECT id, name, currency
      FROM profiles
      ORDER BY id
    `),
    queryRows(database, `
      SELECT
        id,
        profile_id AS "profileId",
        entry_type AS type,
        amount_cents::text AS "amountCents",
        note,
        reference_key AS "referenceKey",
        created_at AS "createdAt"
      FROM ledger_entries
      ORDER BY id
    `),
    queryRows(database, `
      SELECT last_value::text AS "lastValue", is_called AS "isCalled"
      FROM invoice_number_sequence
    `),
  ]);

  const sequenceRow = sequenceRows[0];
  if (!sequenceRow) {
    throw new BackfillValidationError("invoice_number_sequence is not available; run migrations first");
  }

  const lastValue = sequenceValue(sequenceRow.lastValue, "invoice_number_sequence.last_value");
  const isCalled = Boolean(sequenceRow.isCalled);

  return {
    profiles: profileRows.map((row) => ({
      id: stringValue(row.id, "profile id"),
      name: stringValue(row.name, "profile name"),
      currency: stringValue(row.currency, "profile currency"),
    })),
    ledgerEntries: ledgerRows.map((row) => ({
      id: stringValue(row.id, "ledger id"),
      profileId: stringValue(row.profileId, "ledger profile id"),
      type: stringValue(row.type, "ledger type") as ExistingLedgerEntry["type"],
      amountCents: integerValue(row.amountCents, "ledger amount"),
      note: nullableStringValue(row.note),
      referenceKey: nullableStringValue(row.referenceKey),
      createdAt: dateValue(row.createdAt, "ledger created_at"),
    })),
    sequence: {
      lastValue,
      isCalled,
      nextValue: isCalled ? lastValue + BigInt(1) : lastValue,
    },
  };
}

async function loadSequenceState(database: QueryClient): Promise<SequenceState> {
  const rows = await queryRows(database, `
    SELECT last_value::text AS "lastValue", is_called AS "isCalled"
    FROM invoice_number_sequence
  `);
  const row = rows[0];
  if (!row) {
    throw new BackfillValidationError("invoice_number_sequence is not available; run migrations first");
  }
  const lastValue = sequenceValue(row.lastValue, "invoice_number_sequence.last_value");
  const isCalled = Boolean(row.isCalled);
  return {
    lastValue,
    isCalled,
    nextValue: isCalled ? lastValue + BigInt(1) : lastValue,
  };
}

function profileMatchesRule(profile: ExistingProfile, rule: HistoricalProfileRule): boolean {
  const names = [rule.canonicalName, ...rule.aliases].map(normalizeName);
  return names.includes(normalizeName(profile.name));
}

function buildPlan(state: BackfillState): BackfillPlan {
  const profileActions: ProfileAction[] = [];
  const targetProfileByName = new Map<string, string | null>();

  for (const rule of PROFILE_RULES) {
    const canonicalKey = normalizeName(rule.canonicalName);
    const matches = state.profiles.filter((profile) => profileMatchesRule(profile, rule));
    const canonicalMatch = matches.find(
      (profile) => normalizeName(profile.name) === canonicalKey,
    );
    const target = canonicalMatch ?? matches[0];

    if (!target) {
      profileActions.push({ kind: "create", canonicalName: rule.canonicalName });
      targetProfileByName.set(canonicalKey, null);
      continue;
    }

    targetProfileByName.set(canonicalKey, target.id);

    if (target.name !== rule.canonicalName) {
      profileActions.push({
        kind: "rename",
        id: target.id,
        from: target.name,
        to: rule.canonicalName,
      });
    }
    if (target.currency !== "HUF") {
      profileActions.push({
        kind: "currency",
        id: target.id,
        name: rule.canonicalName,
        from: target.currency,
        to: "HUF",
      });
    }

    for (const alias of matches) {
      if (alias.id === target.id) continue;
      const targetReferences = new Set(
        state.ledgerEntries
          .filter((entry) => entry.profileId === target.id && entry.referenceKey)
          .map((entry) => String(entry.referenceKey)),
      );
      const aliasEntries = state.ledgerEntries.filter((entry) => entry.profileId === alias.id);
      profileActions.push({
        kind: "merge",
        aliasId: alias.id,
        aliasName: alias.name,
        targetId: target.id,
        targetName: rule.canonicalName,
        entryIds: aliasEntries.map((entry) => entry.id),
        plannedMovedEntries: aliasEntries.filter(
          (entry) => !entry.referenceKey || !targetReferences.has(entry.referenceKey),
        ).length,
        plannedSkippedDuplicateReferences: aliasEntries
          .filter((entry) => entry.referenceKey && targetReferences.has(entry.referenceKey))
          .map((entry) => String(entry.referenceKey)),
      });
    }
  }

  const referenceKeysByTarget = new Map<string, Set<string>>();
  for (const rule of PROFILE_RULES) {
    const targetId = targetProfileByName.get(normalizeName(rule.canonicalName));
    if (!targetId) continue;
    const sourceIds = state.profiles
      .filter((profile) => profileMatchesRule(profile, rule))
      .map((profile) => profile.id);
    const references = new Set(
      state.ledgerEntries
        .filter((entry) => sourceIds.includes(entry.profileId) && entry.referenceKey)
        .map((entry) => String(entry.referenceKey)),
    );
    referenceKeysByTarget.set(targetId, references);
  }

  const invoices = HISTORICAL_INVOICES.map((invoice) => {
    const canonicalKey = normalizeName(invoice.canonicalRecipient);
    const targetProfileId = targetProfileByName.get(canonicalKey) ?? null;
    const referenceKey = normalizeHistoricalReference(invoice.invoiceNumber);
    const duplicateReference = targetProfileId
      ? referenceKeysByTarget.get(targetProfileId)?.has(referenceKey) ?? false
      : false;
    if (targetProfileId && !duplicateReference) {
      referenceKeysByTarget.get(targetProfileId)?.add(referenceKey);
    }
    return { invoice, referenceKey, targetProfileId, duplicateReference };
  });

  return {
    profileActions,
    invoices,
    sequence: state.sequence,
  };
}

function sequenceAction(sequence: SequenceState): "advance-to-ISH-0015" | "already-at-or-beyond-ISH-0015" {
  return sequence.nextValue < SEQUENCE_TARGET_NEXT
    ? "advance-to-ISH-0015"
    : "already-at-or-beyond-ISH-0015";
}

function profileReportFromPlan(plan: BackfillPlan): BackfillReport["profiles"] {
  const created: string[] = [];
  const reused: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const currencyUpdated: Array<{ name: string; from: string; to: "HUF" }> = [];
  const merged: BackfillMergeReport[] = [];

  for (const action of plan.profileActions) {
    if (action.kind === "create") created.push(action.canonicalName);
    if (action.kind === "rename") renamed.push({ from: action.from, to: action.to });
    if (action.kind === "currency") currencyUpdated.push({ name: action.name, from: action.from, to: action.to });
    if (action.kind === "merge") {
      merged.push({
        alias: action.aliasName,
        canonical: action.targetName,
        movedEntries: action.plannedMovedEntries,
        skippedDuplicateReferences: action.plannedSkippedDuplicateReferences,
      });
    }
  }

  for (const rule of PROFILE_RULES) {
    if (!created.includes(rule.canonicalName) && !renamed.some((item) => item.to === rule.canonicalName)) {
      reused.push(rule.canonicalName);
    }
  }

  return {
    created,
    reused,
    renamed,
    currencyUpdated,
    merged,
    removedAliases: merged.map((item) => item.alias),
  };
}

function invoiceReportFromPlan(
  plan: BackfillPlan,
  verifiedTotalCents = plan.invoices
    .filter((item) => !item.duplicateReference)
    .reduce((total, item) => total + amountForintToCents(item.invoice.amountForint), 0),
): BackfillReport["invoices"] {
  return {
    expected: plan.invoices.length,
    inserted: plan.invoices.filter((item) => !item.duplicateReference).map((item) => item.invoice.invoiceNumber),
    skipped: plan.invoices
      .filter((item) => item.duplicateReference)
      .map((item) => ({ invoiceNumber: item.invoice.invoiceNumber, reason: "already-present" as const })),
    expectedTotalCents: plan.invoices.reduce(
      (total, item) => total + amountForintToCents(item.invoice.amountForint),
      0,
    ),
    verifiedTotalCents,
  };
}

function makeReport(
  mode: "dry-run" | "apply",
  plan: BackfillPlan,
  finalState?: BackfillState,
): BackfillReport {
  const sequence = finalState?.sequence ?? plan.sequence;
  const beforeNext = plan.sequence.nextValue;
  const afterNext = finalState?.sequence.nextValue ?? (
    sequenceAction(plan.sequence) === "advance-to-ISH-0015"
      ? SEQUENCE_TARGET_NEXT
      : sequence.nextValue
  );

  return {
    mode,
    profiles: profileReportFromPlan(plan),
    invoices: invoiceReportFromPlan(plan, finalState ? verifiedHistoricalTotal(plan, finalState) : undefined),
    sequence: {
      beforeNext: beforeNext.toString(),
      afterNext: afterNext.toString(),
      action: sequenceAction(plan.sequence),
      nextInvoiceNumber: formatInvoiceNumber(afterNext.toString()),
    },
  };
}

async function findProfileId(database: QueryClient, canonicalName: string): Promise<string | null> {
  const rows = await queryRows(database, `
    SELECT id
    FROM profiles
    WHERE LOWER(name) = LOWER($1)
    LIMIT 1
  `, [canonicalName]);
  return rows[0] ? stringValue(rows[0].id, "canonical profile id") : null;
}

async function applyProfileActions(
  database: QueryClient,
  actions: readonly ProfileAction[],
): Promise<BackfillReport["profiles"]> {
  const report = profileReportFromPlan({ profileActions: actions as ProfileAction[], invoices: [], sequence: {
    lastValue: BigInt(1),
    isCalled: false,
    nextValue: BigInt(1),
  } });

  for (const action of actions) {
    if (action.kind === "create") {
      await queryRows(database, `
        INSERT INTO profiles (name, currency)
        VALUES ($1, 'HUF')
        ON CONFLICT DO NOTHING
      `, [action.canonicalName]);
      continue;
    }

    if (action.kind === "rename") {
      await queryRows(database, `
        UPDATE profiles
        SET name = $1, updated_at = now()
        WHERE id = $2
      `, [action.to, action.id]);
      continue;
    }

    if (action.kind === "currency") {
      await queryRows(database, `
        UPDATE profiles
        SET currency = 'HUF', updated_at = now()
        WHERE id = $1
      `, [action.id]);
      continue;
    }

    let movedEntries = 0;
    const skippedDuplicateReferences: string[] = [];
    for (const entryId of action.entryIds) {
      const entryRows = await queryRows(database, `
        SELECT reference_key AS "referenceKey"
        FROM ledger_entries
        WHERE id = $1 AND profile_id = $2
      `, [entryId, action.aliasId]);
      if (!entryRows.length) continue;
      const referenceKey = nullableStringValue(entryRows[0].referenceKey);
      if (referenceKey) {
        const duplicateRows = await queryRows(database, `
          SELECT id
          FROM ledger_entries
          WHERE profile_id = $1 AND reference_key = $2
          LIMIT 1
        `, [action.targetId, referenceKey]);
        if (duplicateRows.length) {
          skippedDuplicateReferences.push(referenceKey);
          continue;
        }
      }
      const movedRows = await queryRows(database, `
        UPDATE ledger_entries
        SET profile_id = $1
        WHERE id = $2 AND profile_id = $3
        RETURNING id
      `, [action.targetId, entryId, action.aliasId]);
      movedEntries += movedRows.length;
    }

    await queryRows(database, `DELETE FROM profiles WHERE id = $1 RETURNING id`, [action.aliasId]);
    const merge = report.merged.find((item) => item.alias === action.aliasName && item.canonical === action.targetName);
    if (merge) {
      merge.movedEntries = movedEntries;
      merge.skippedDuplicateReferences = skippedDuplicateReferences;
    }
  }

  // Resolve the report after profile actions so a create is considered reused
  // only when the canonical profile was already present.
  return report;
}

async function applyInvoiceActions(
  database: QueryClient,
  invoices: readonly HistoricalInvoicePlan[],
): Promise<BackfillReport["invoices"]> {
  const inserted: string[] = [];
  const skipped: BackfillInvoiceSkip[] = [];

  for (const item of invoices) {
    const profileId = await findProfileId(database, item.invoice.canonicalRecipient);
    if (!profileId) {
      throw new BackfillValidationError(`Canonical profile is missing: ${item.invoice.canonicalRecipient}`);
    }
    const rows = await queryRows(database, `
      INSERT INTO ledger_entries (
        profile_id,
        entry_type,
        amount_cents,
        note,
        reference_key,
        created_at
      )
      VALUES ($1, 'charge', $2, $3, $4, $5::timestamptz)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      profileId,
      amountForintToCents(item.invoice.amountForint),
      invoiceNote(item.invoice),
      item.referenceKey,
      issueTimestamp(item.invoice.issueDate),
    ]);
    if (rows.length) inserted.push(item.invoice.invoiceNumber);
    else skipped.push({ invoiceNumber: item.invoice.invoiceNumber, reason: "already-present" });
  }

  return {
    expected: invoices.length,
    inserted,
    skipped,
    expectedTotalCents: invoices.reduce(
      (total, item) => total + amountForintToCents(item.invoice.amountForint),
      0,
    ),
    verifiedTotalCents: 0,
  };
}

async function applySequence(database: QueryClient, sequence: SequenceState): Promise<void> {
  if (sequence.nextValue >= SEQUENCE_TARGET_NEXT) return;
  await queryRows(database, `
    SELECT setval('invoice_number_sequence', $1::bigint, true)
  `, [SEQUENCE_TARGET.toString()]);
}

function verifiedHistoricalTotal(plan: BackfillPlan, state: BackfillState): number {
  let total = 0;
  for (const item of plan.invoices) {
    const targetProfiles = state.profiles.filter(
      (profile) => normalizeName(profile.name) === normalizeName(item.invoice.canonicalRecipient),
    );
    if (targetProfiles.length !== 1) {
      throw new BackfillValidationError(`Expected one canonical profile for ${item.invoice.canonicalRecipient}`);
    }
    const entries = state.ledgerEntries.filter(
      (entry) => entry.profileId === targetProfiles[0].id && entry.referenceKey === item.referenceKey,
    );
    if (entries.length !== 1) {
      throw new BackfillValidationError(`Expected one reference ${item.referenceKey} for ${item.invoice.canonicalRecipient}`);
    }
    const entry = entries[0];
    const expectedAmount = amountForintToCents(item.invoice.amountForint);
    if (entry.type !== "charge" || entry.amountCents !== expectedAmount) {
      throw new BackfillValidationError(`Reference ${item.invoice.invoiceNumber} has an unexpected amount or type`);
    }
    if (entry.createdAt.slice(0, 10) !== item.invoice.issueDate) {
      throw new BackfillValidationError(`Reference ${item.invoice.invoiceNumber} has an unexpected date`);
    }
    const note = entry.note ?? "";
    if (!note.includes(item.invoice.invoiceNumber) || !item.invoice.items.every((itemLine) => note.includes(itemLine.description))) {
      throw new BackfillValidationError(`Reference ${item.invoice.invoiceNumber} has an incomplete note`);
    }
    total += entry.amountCents;
  }
  return total;
}

function validateFinalState(plan: BackfillPlan, state: BackfillState): number {
  for (const rule of PROFILE_RULES) {
    const matching = state.profiles.filter(
      (profile) => normalizeName(profile.name) === normalizeName(rule.canonicalName),
    );
    if (matching.length !== 1 || matching[0].name !== rule.canonicalName || matching[0].currency !== "HUF") {
      throw new BackfillValidationError(`Canonical profile validation failed for ${rule.canonicalName}`);
    }
    for (const alias of rule.aliases) {
      if (state.profiles.some((profile) => normalizeName(profile.name) === normalizeName(alias) && profile.name !== rule.canonicalName)) {
        throw new BackfillValidationError(`Alias profile remains after merge: ${alias}`);
      }
    }
  }

  const verifiedTotal = verifiedHistoricalTotal(plan, state);
  if (verifiedTotal !== HISTORICAL_TOTAL_FORINT * HUF_SCALE) {
    throw new BackfillValidationError(`Historical total mismatch: expected ${HISTORICAL_TOTAL_FORINT * HUF_SCALE}, got ${verifiedTotal}`);
  }
  if (state.sequence.nextValue < SEQUENCE_TARGET_NEXT) {
    throw new BackfillValidationError(`Invoice sequence did not reach ${formatInvoiceNumber(SEQUENCE_TARGET_NEXT.toString())}`);
  }
  return verifiedTotal;
}

/**
 * Generate a no-write report by default, or apply the historical manifest in
 * one transaction when `apply` is true. The caller is responsible for opening
 * a direct/unpooled production client and for running migrations first.
 */
export async function runBackfill(
  database: QueryClient,
  options: { apply?: boolean } = {},
): Promise<BackfillReport> {
  validateManifest();
  const initialState = await loadState(database);
  const plan = buildPlan(initialState);

  if (!options.apply) {
    return makeReport("dry-run", plan);
  }

  await database.query("BEGIN");
  try {
    const profileReport = await applyProfileActions(database, plan.profileActions);
    const invoiceReport = await applyInvoiceActions(database, plan.invoices);
    // Re-read immediately before setval so a number reserved after the dry
    // plan was built is never accidentally moved backwards.
    await applySequence(database, await loadSequenceState(database));
    const finalState = await loadState(database);
    const verifiedTotal = validateFinalState(plan, finalState);
    invoiceReport.verifiedTotalCents = verifiedTotal;
    await database.query("COMMIT");

    return {
      ...makeReport("apply", plan, finalState),
      profiles: profileReport,
      invoices: invoiceReport,
    };
  } catch (error) {
    await database.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
