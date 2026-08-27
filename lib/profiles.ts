import { getDatabase, type DatabaseRow } from "@/lib/db";
import type { LedgerEntryInput, LedgerType, ProfileCurrency } from "@/lib/validation";

async function queryRows<Row extends DatabaseRow = DatabaseRow>(
  query: string,
  params?: unknown[],
): Promise<Row[]> {
  return (await getDatabase().query<Row>(query, params)).rows;
}

export type ProfileSummary = {
  id: string;
  name: string;
  currency: ProfileCurrency;
  createdAt: string;
  updatedAt: string;
  lifetimeChargedCents: number;
  lifetimePaidCents: number;
  currentBalanceCents: number;
};

export type LedgerEntry = {
  id: string;
  profileId: string;
  type: LedgerType;
  amountCents: number;
  impactCents: number;
  note: string | null;
  referenceKey: string | null;
  createdAt: string;
};

export type ProfileWithLedger = ProfileSummary & {
  transactions: LedgerEntry[];
};

export type InvoiceAttachmentResult = {
  entry: LedgerEntry | null;
  profile: ProfileSummary;
  newlyAttached: boolean;
  /** Alias kept in the HTTP response for callers that only need the boolean. */
  attached: boolean;
  /** True when this request found an existing attachment instead of creating one. */
  idempotent: boolean;
};

export class ProfileNameConflictError extends Error {
  constructor() {
    super("A profile with that name already exists");
    this.name = "ProfileNameConflictError";
  }
}

const PROFILE_NAME_UNIQUE_INDEX = "profiles_name_lower_unique_idx";

function isProfileNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  const code = String(candidate.code ?? "");
  const constraint = String(candidate.constraint ?? "");
  const message = String(candidate.message ?? "");
  return code === "23505" &&
    (constraint === PROFILE_NAME_UNIQUE_INDEX || message.includes(PROFILE_NAME_UNIQUE_INDEX));
}

async function assertProfileNameAvailable(name: string, excludeId?: string): Promise<void> {
  const rows = excludeId
    ? await queryRows(
      `
      SELECT id
      FROM profiles
      WHERE LOWER(name) = LOWER($1)
        AND id <> $2
      LIMIT 1
      `,
      [name, excludeId],
    )
    : await queryRows(
      `
      SELECT id
      FROM profiles
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
      `,
      [name],
    );

  if (rows.length) {
    throw new ProfileNameConflictError();
  }
}

function integerValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid integer returned for ${field}`);
  }

  return parsed;
}

function isoDate(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date returned for ${field}`);
  }

  return date.toISOString();
}

function profileFromRow(row: DatabaseRow): ProfileSummary {
  const lifetimeChargedCents = integerValue(row.lifetimeChargedCents, "lifetimeChargedCents");
  const lifetimePaidCents = integerValue(row.lifetimePaidCents, "lifetimePaidCents");
  const currentBalanceCents = integerValue(row.currentBalanceCents, "currentBalanceCents");

  return {
    id: String(row.id),
    name: String(row.name),
    currency: String(row.currency) as ProfileCurrency,
    createdAt: isoDate(row.createdAt, "createdAt"),
    updatedAt: isoDate(row.updatedAt, "updatedAt"),
    lifetimeChargedCents,
    lifetimePaidCents,
    currentBalanceCents,
  };
}

function ledgerEntryFromRow(row: DatabaseRow): LedgerEntry {
  const type = String(row.type) as LedgerType;
  const amountCents = integerValue(row.amountCents, "amountCents");

  return {
    id: String(row.id),
    profileId: String(row.profileId),
    type,
    amountCents,
    impactCents:
      type === "charge" ? amountCents : type === "payment" ? -amountCents : amountCents,
    note: row.note === null || row.note === undefined ? null : String(row.note),
    referenceKey:
      row.referenceKey === null || row.referenceKey === undefined ? null : String(row.referenceKey),
    createdAt: isoDate(row.createdAt, "createdAt"),
  };
}

export async function listProfiles(): Promise<ProfileSummary[]> {
  const rows = await queryRows(`
    SELECT
      p.id,
      p.name,
      p.currency,
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COALESCE(SUM(CASE WHEN l.entry_type = 'charge' THEN l.amount_cents ELSE 0 END), 0)::text AS "lifetimeChargedCents",
      COALESCE(SUM(CASE WHEN l.entry_type = 'payment' THEN l.amount_cents ELSE 0 END), 0)::text AS "lifetimePaidCents",
      COALESCE(SUM(
        CASE
          WHEN l.entry_type = 'charge' THEN l.amount_cents
          WHEN l.entry_type = 'payment' THEN -l.amount_cents
          WHEN l.entry_type = 'adjustment' THEN l.amount_cents
          ELSE 0
        END
      ), 0)::text AS "currentBalanceCents"
    FROM profiles p
    LEFT JOIN ledger_entries l ON l.profile_id = p.id
    GROUP BY p.id, p.name, p.currency, p.created_at, p.updated_at
    ORDER BY LOWER(p.name), p.created_at, p.id
  `);

  return rows.map((row) => profileFromRow(row));
}

export async function getProfile(id: string): Promise<ProfileSummary | null> {
  const rows = await queryRows(
    `
    SELECT
      p.id,
      p.name,
      p.currency,
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COALESCE(SUM(CASE WHEN l.entry_type = 'charge' THEN l.amount_cents ELSE 0 END), 0)::text AS "lifetimeChargedCents",
      COALESCE(SUM(CASE WHEN l.entry_type = 'payment' THEN l.amount_cents ELSE 0 END), 0)::text AS "lifetimePaidCents",
      COALESCE(SUM(
        CASE
          WHEN l.entry_type = 'charge' THEN l.amount_cents
          WHEN l.entry_type = 'payment' THEN -l.amount_cents
          WHEN l.entry_type = 'adjustment' THEN l.amount_cents
          ELSE 0
        END
      ), 0)::text AS "currentBalanceCents"
    FROM profiles p
    LEFT JOIN ledger_entries l ON l.profile_id = p.id
    WHERE p.id = $1
    GROUP BY p.id, p.name, p.currency, p.created_at, p.updated_at
    `,
    [id],
  );

  return rows.length ? profileFromRow(rows[0]) : null;
}

export async function getProfileWithLedger(id: string): Promise<ProfileWithLedger | null> {
  const [profile, transactions] = await Promise.all([getProfile(id), listLedgerEntries(id)]);

  if (!profile) {
    return null;
  }

  return { ...profile, transactions };
}

export async function createProfile(name: string, currency: ProfileCurrency): Promise<ProfileSummary> {
  await assertProfileNameAvailable(name);

  let rows: DatabaseRow[];
  try {
    rows = await queryRows(
      `
      INSERT INTO profiles (name, currency)
      VALUES ($1, $2)
      RETURNING id
      `,
      [name, currency],
    );
  } catch (error) {
    if (isProfileNameUniqueViolation(error)) {
      throw new ProfileNameConflictError();
    }
    throw error;
  }
  const id = String(rows[0].id);
  const profile = await getProfile(id);

  if (!profile) {
    throw new Error("Profile was not found after insertion");
  }

  return profile;
}

export async function updateProfile(
  id: string,
  updates: { name?: string; currency?: ProfileCurrency },
): Promise<ProfileSummary | null> {
  if (updates.name !== undefined) {
    const existingProfile = await queryRows(
      `
      SELECT id
      FROM profiles
      WHERE id = $1
      `,
      [id],
    );
    if (!existingProfile.length) {
      return null;
    }
    await assertProfileNameAvailable(updates.name, id);
  }

  let rows: DatabaseRow[];

  try {
    if (updates.name !== undefined && updates.currency !== undefined) {
      rows = await queryRows(
        `
        UPDATE profiles
        SET name = $1, currency = $2, updated_at = now()
        WHERE id = $3
        RETURNING id
        `,
        [updates.name, updates.currency, id],
      );
    } else if (updates.name !== undefined) {
      rows = await queryRows(
        `
        UPDATE profiles
        SET name = $1, updated_at = now()
        WHERE id = $2
        RETURNING id
        `,
        [updates.name, id],
      );
    } else if (updates.currency !== undefined) {
      rows = await queryRows(
        `
        UPDATE profiles
        SET currency = $1, updated_at = now()
        WHERE id = $2
        RETURNING id
        `,
        [updates.currency, id],
      );
    } else {
      return getProfile(id);
    }
  } catch (error) {
    if (isProfileNameUniqueViolation(error)) {
      throw new ProfileNameConflictError();
    }
    throw error;
  }

  if (!rows.length) {
    return null;
  }

  return getProfile(String(rows[0].id));
}

export async function deleteProfile(id: string): Promise<boolean> {
  const rows = await queryRows(
    `
    DELETE FROM profiles
    WHERE id = $1
    RETURNING id
    `,
    [id],
  );

  return rows.length > 0;
}

export async function listLedgerEntries(id: string): Promise<LedgerEntry[]> {
  const rows = await queryRows(
    `
    SELECT
      id,
      profile_id AS "profileId",
      entry_type AS type,
      amount_cents::text AS "amountCents",
      note,
      reference_key AS "referenceKey",
      created_at AS "createdAt"
    FROM ledger_entries
    WHERE profile_id = $1
    ORDER BY created_at DESC, id DESC
    `,
    [id],
  );

  return rows.map((row) => ledgerEntryFromRow(row));
}

export async function createLedgerEntry(
  profileId: string,
  input: LedgerEntryInput,
): Promise<{ entry: LedgerEntry; profile: ProfileSummary } | null> {
  const existingProfile = await queryRows(
    `
    SELECT id
    FROM profiles
    WHERE id = $1
    `,
    [profileId],
  );

  if (!existingProfile.length) {
    return null;
  }

  const rows = await queryRows(
    `
    INSERT INTO ledger_entries (profile_id, entry_type, amount_cents, note)
    VALUES ($1, $2, $3, $4)
    RETURNING
      id,
      profile_id AS "profileId",
      entry_type AS type,
      amount_cents::text AS "amountCents",
      note,
      reference_key AS "referenceKey",
      created_at AS "createdAt"
    `,
    [profileId, input.type, input.amountCents, input.note ?? null],
  );
  const entry = ledgerEntryFromRow(rows[0]);
  const profile = await getProfile(profileId);

  if (!profile) {
    return null;
  }

  return { entry, profile };
}

function normalizeInvoiceReference(invoiceNumber: string): string {
  return invoiceNumber.trim().toLowerCase();
}

/**
 * Attach one invoice as a charge. The unique reference index and
 * ON CONFLICT keep concurrent/repeated requests idempotent per profile.
 */
export async function attachInvoiceToProfile(
  profileId: string,
  amountCents: number,
  invoiceNumber: string,
): Promise<InvoiceAttachmentResult | null> {
  const existingProfile = await queryRows(
    `
    SELECT id
    FROM profiles
    WHERE id = $1
    `,
    [profileId],
  );

  if (!existingProfile.length) {
    return null;
  }

  const referenceKey = normalizeInvoiceReference(invoiceNumber);
  const insertedRows = await queryRows(
    `
    INSERT INTO ledger_entries (
      profile_id,
      entry_type,
      amount_cents,
      note,
      reference_key
    )
    VALUES ($1, 'charge', $2, $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING
      id,
      profile_id AS "profileId",
      entry_type AS type,
      amount_cents::text AS "amountCents",
      note,
      reference_key AS "referenceKey",
      created_at AS "createdAt"
    `,
    [profileId, amountCents, `Invoice ${invoiceNumber.trim()}`, referenceKey],
  );

  let entry = insertedRows.length ? ledgerEntryFromRow(insertedRows[0]) : null;
  if (!entry) {
    const existingEntryRows = await queryRows(
      `
      SELECT
        id,
        profile_id AS "profileId",
        entry_type AS type,
        amount_cents::text AS "amountCents",
        note,
        reference_key AS "referenceKey",
        created_at AS "createdAt"
      FROM ledger_entries
      WHERE profile_id = $1
        AND reference_key = $2
      LIMIT 1
      `,
      [profileId, referenceKey],
    );
    entry = existingEntryRows.length ? ledgerEntryFromRow(existingEntryRows[0]) : null;
  }

  const profile = await getProfile(profileId);
  if (!profile) {
    return null;
  }

  const newlyAttached = insertedRows.length > 0;
  return { entry, profile, newlyAttached, attached: newlyAttached, idempotent: !newlyAttached };
}
