-- Invoice-ish profile and balance ledger schema.
-- Amounts use the API's universal 100x integer scale (amountCents).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HUF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_name_not_blank CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT profiles_currency_check CHECK (currency IN ('HUF', 'USD', 'EUR'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_type_check CHECK (entry_type IN ('charge', 'payment', 'adjustment')),
  CONSTRAINT ledger_entries_amount_check CHECK (
    (entry_type IN ('charge', 'payment') AND amount_cents > 0)
    OR (entry_type = 'adjustment' AND amount_cents <> 0)
  ),
  CONSTRAINT ledger_entries_note_length_check CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS ledger_entries_profile_created_idx
  ON ledger_entries (profile_id, created_at DESC, id DESC);
