# Invoice-ish Web

Invoice-ish is a small public web app for making playful invoices. Anyone can
open the site and create an invoice. Profiles are display-only records: they
do not have user accounts or passwords. A shared admin passphrase unlocks the
profile and balance management controls.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Leave `DATABASE_URL` unset for a zero-setup local database. The app creates
   a persistent PGlite database in `.data/pglite` and applies all migrations
   automatically on first database access. Set `PGLITE_DATA_DIR` if you want a
   different local directory (or an isolated temporary directory in tests).
3. Set `ADMIN_SESSION_SECRET` to a long random value. The application uses
   `majonéz` as the development fallback password when `ADMIN_PASSWORD` is not
   set; set `ADMIN_PASSWORD` explicitly in any shared or deployed environment.
4. Install and migrate:

```bash
npm install
npm run db:migrate
npm run dev
```

`npm run db:migrate` also uses PGlite when `DATABASE_URL` is absent, so it is
optional for local development. If `DATABASE_URL` is present, both the app and
the migration script use Neon as before.

The default local admin password is `majonéz` (including the accent). The
password is read only by server route handlers and is never sent to the
browser. Admin sessions are signed, short-lived, HttpOnly cookies.

## Vercel deployment

Import the repository into Vercel, select the Next.js framework preset, and
configure these server-only environment variables in the project settings:

- `DATABASE_URL`: the Neon pooled connection string.
- `ADMIN_PASSWORD`: the chosen shared admin passphrase.
- `ADMIN_SESSION_SECRET`: a separate, long random signing secret.

Vercel/production intentionally fails closed when `DATABASE_URL` is missing;
the local PGlite fallback is only enabled outside production. The `.data/`
directory is gitignored and should not be deployed as application data.

Run `npm run db:migrate` against the production `DATABASE_URL` before first
use. The migration script records applied files in `schema_migrations` and is
safe to rerun.

## Data model

`profiles` stores a display name, a currency (`HUF`, `USD`, or `EUR`, defaulting
to `HUF`), and timestamps. `ledger_entries` stores immutable
balance events:

- `charge`: a positive amount that increases the balance.
- `payment`: a positive amount that decreases the balance.
- `adjustment`: a signed amount that can increase or decrease the balance.

The API uses a universal 100× major-unit scale in its integer `amountCents`
field: USD/EUR 12.50 is sent as `1250`, and HUF 1,500 Ft is sent as `150000`.
The HUF UI therefore accepts and displays whole forints while converting to
this API scale. The API calculates `lifetimeChargedCents`,
`lifetimePaidCents`, and `currentBalanceCents` from the ledger on every read;
there is no mutable balance column to drift out of sync.

## API

Public reads:

- `GET /api/profiles` → `{ profiles }` with all three summary amounts.
- `GET /api/profiles/:id` → `{ profile, transactions }`.
- `GET /api/profiles/:id/ledger` → `{ profile, transactions }`.
- `GET /api/auth/status` → `{ authenticated }`.

Admin mutations require the HttpOnly session cookie created by login:

- `POST /api/auth/login` with `{ "password": "…" }`.
- `POST /api/auth/logout`.
- `POST /api/profiles` with `{ "name": "…", "currency": "HUF" }` (`currency` defaults to `HUF`).
- `PATCH /api/profiles/:id` with `{ "name": "…" }`, `{ "currency": "USD" }`, or both.
- `DELETE /api/profiles/:id` (also removes that profile's ledger entries).
- `POST /api/profiles/:id/ledger` with `{ "type": "charge|payment|adjustment", "amountCents": 123, "note": "…" }`.
- `POST /api/profiles/:id/charge` with `{ "amountCents": 123, "note": "…" }`.
- `POST /api/profiles/:id/payment` with `{ "amountCents": 123, "note": "…" }`.
- `POST /api/profiles/:id/adjustment` with `{ "amountCents": -123, "note": "…" }`.

Charge and payment amounts must be positive. Adjustments must be non-zero and
may be positive or negative. Invalid input returns `400`; missing admin
authentication returns `401`; missing profiles return `404`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
