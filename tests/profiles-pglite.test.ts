import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/auth";
import { POST as createProfileRoute } from "@/app/api/profiles/route";
import { POST as attachInvoiceRoute } from "@/app/api/profiles/[id]/invoice/route";
import {
  attachInvoiceToProfile,
  createLedgerEntry,
  createProfile,
  deleteProfile,
  getProfile,
  getProfileWithLedger,
  listProfiles,
  ProfileNameConflictError,
  updateProfile,
} from "@/lib/profiles";

const environment = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = environment.DATABASE_URL;
const originalPGliteDataDir = environment.PGLITE_DATA_DIR;
const originalNodeEnv = environment.NODE_ENV;
let testDataDirectory: string;

describe("profiles with an isolated local PGlite database", () => {
  beforeAll(async () => {
    testDataDirectory = await mkdtemp(join(tmpdir(), "invoice-ish-pglite-"));
    delete environment.DATABASE_URL;
    environment.PGLITE_DATA_DIR = testDataDirectory;
    environment.NODE_ENV = "test";
  });

  afterAll(async () => {
    await closeDatabase();
    if (originalDatabaseUrl === undefined) delete environment.DATABASE_URL;
    else environment.DATABASE_URL = originalDatabaseUrl;
    if (originalPGliteDataDir === undefined) delete environment.PGLITE_DATA_DIR;
    else environment.PGLITE_DATA_DIR = originalPGliteDataDir;
    if (originalNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnv;
    await rm(testDataDirectory, { recursive: true, force: true });
  });

  it("supports profile CRUD and the full ledger lifecycle", async () => {
    const created = await createProfile("  Alex  ", "HUF");

    expect(created.name).toBe("  Alex  ");
    expect(created.currency).toBe("HUF");
    expect((await listProfiles()).map((profile) => profile.id)).toContain(created.id);

    const charge = await createLedgerEntry(created.id, {
      type: "charge",
      amountCents: 12_000,
      note: "Dinner",
    });
    const payment = await createLedgerEntry(created.id, {
      type: "payment",
      amountCents: 3_000,
      note: "Paid in cash",
    });
    const adjustment = await createLedgerEntry(created.id, {
      type: "adjustment",
      amountCents: -500,
      note: "Courtesy credit",
    });

    expect(charge?.entry.type).toBe("charge");
    expect(payment?.entry.impactCents).toBe(-3_000);
    expect(adjustment?.entry.impactCents).toBe(-500);

    const withLedger = await getProfileWithLedger(created.id);
    expect(withLedger?.transactions).toHaveLength(3);
    expect(withLedger?.lifetimeChargedCents).toBe(12_000);
    expect(withLedger?.lifetimePaidCents).toBe(3_000);
    expect(withLedger?.currentBalanceCents).toBe(8_500);

    const renamed = await updateProfile(created.id, { name: "Alex Updated", currency: "EUR" });
    expect(renamed?.name).toBe("Alex Updated");
    expect(renamed?.currency).toBe("EUR");
    expect((await getProfile(created.id))?.name).toBe("Alex Updated");

    expect(await deleteProfile(created.id)).toBe(true);
    expect(await getProfile(created.id)).toBeNull();
    expect(await getProfileWithLedger(created.id)).toBeNull();
    expect(await deleteProfile(created.id)).toBe(false);
  });

  it("rejects case-insensitive duplicate profile names", async () => {
    const created = await createProfile("Duplicate Name", "HUF");

    await expect(createProfile("duplicate name", "HUF")).rejects.toBeInstanceOf(ProfileNameConflictError);
    await expect(updateProfile(created.id, { name: "DUPLICATE NAME" })).resolves.toMatchObject({
      id: created.id,
      name: "DUPLICATE NAME",
    });

    const other = await createProfile("Another Name", "HUF");
    await expect(updateProfile(other.id, { name: "duplicate name" })).rejects.toBeInstanceOf(ProfileNameConflictError);

    expect(await deleteProfile(created.id)).toBe(true);
    expect(await deleteProfile(other.id)).toBe(true);
  });

  it("attaches invoices once per profile and invoice number", async () => {
    const first = await createProfile("Invoice First", "HUF");
    const second = await createProfile("Invoice Second", "HUF");

    const attached = await attachInvoiceToProfile(first.id, 150_000, " INV-0001 ");
    expect(attached?.newlyAttached).toBe(true);
    expect(attached?.attached).toBe(true);
    expect(attached?.entry).toMatchObject({
      type: "charge",
      amountCents: 150_000,
      note: "Invoice INV-0001",
      referenceKey: "inv-0001",
    });
    expect(attached?.profile.currentBalanceCents).toBe(150_000);

    const duplicate = await attachInvoiceToProfile(first.id, 999_999, "inv-0001");
    expect(duplicate?.newlyAttached).toBe(false);
    expect(duplicate?.attached).toBe(false);
    expect(duplicate?.entry?.amountCents).toBe(150_000);
    expect(duplicate?.profile.currentBalanceCents).toBe(150_000);
    expect((await getProfileWithLedger(first.id))?.transactions).toHaveLength(1);

    const sameInvoiceOtherProfile = await attachInvoiceToProfile(second.id, 150_000, "INV-0001");
    expect(sameInvoiceOtherProfile?.newlyAttached).toBe(true);

    const differentInvoice = await attachInvoiceToProfile(first.id, 20_000, "INV-0002");
    expect(differentInvoice?.newlyAttached).toBe(true);
    expect(differentInvoice?.profile.currentBalanceCents).toBe(170_000);

    expect(await deleteProfile(first.id)).toBe(true);
    expect(await deleteProfile(second.id)).toBe(true);
  });

  it("exposes public invoice attachment and a conflict response for duplicate profile names", async () => {
    const first = await createProfile("Route First", "HUF");
    const invoiceRequest = (amountCents: number, invoiceNumber: string) => new Request(
      `http://localhost/api/profiles/${first.id}/invoice`,
      {
        method: "POST",
        body: JSON.stringify({ amountCents, invoiceNumber }),
        headers: { "content-type": "application/json" },
      },
    );

    const firstResponse = await attachInvoiceRoute(
      invoiceRequest(50_000, "INV-ROUTE-1"),
      { params: Promise.resolve({ id: first.id }) },
    );
    expect(firstResponse.status).toBe(201);
    expect(await firstResponse.json()).toMatchObject({ newlyAttached: true, attached: true, idempotent: false });

    const duplicateResponse = await attachInvoiceRoute(
      invoiceRequest(99_999, "inv-route-1"),
      { params: Promise.resolve({ id: first.id }) },
    );
    expect(duplicateResponse.status).toBe(200);
    expect(await duplicateResponse.json()).toMatchObject({ newlyAttached: false, attached: false, idempotent: true });

    const authCookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken()}`;
    const duplicateProfileResponse = await createProfileRoute(
      new Request("http://localhost/api/profiles", {
        method: "POST",
        body: JSON.stringify({ name: "route first", currency: "HUF" }),
        headers: { "content-type": "application/json", cookie: authCookie },
      }),
    );
    expect(duplicateProfileResponse.status).toBe(409);
    expect(await duplicateProfileResponse.json()).toMatchObject({
      error: "A profile with that name already exists",
    });

    expect(await deleteProfile(first.id)).toBe(true);
  });
});
