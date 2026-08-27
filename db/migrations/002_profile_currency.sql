-- Add currency to profiles created by the first version of the schema.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'HUF';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_currency_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_currency_check CHECK (currency IN ('HUF', 'USD', 'EUR'));
  END IF;
END
$$;
