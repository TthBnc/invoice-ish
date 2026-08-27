-- Keep display profile names unique without making their casing significant.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_lower_unique_idx
  ON profiles (LOWER(name));

-- Invoice attachments are charge entries with an optional normalized reference.
-- The partial unique index makes an invoice attach at most once per profile while
-- preserving ordinary admin-created ledger entries that do not have a reference.
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS reference_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_profile_invoice_reference_unique_idx
  ON ledger_entries (profile_id, reference_key)
  WHERE reference_key IS NOT NULL;

