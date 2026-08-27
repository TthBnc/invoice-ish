import { describe, expect, it } from "vitest";

import {
  invoiceAttachmentSchema,
  ledgerEntryInputSchema,
  profileCreateSchema,
  profileUpdateSchema,
} from "@/lib/validation";

describe("profile validation", () => {
  it("trims and accepts a profile name", () => {
    expect(profileCreateSchema.parse({ name: "  Alex  " })).toEqual({ name: "Alex", currency: "HUF" });
    expect(profileCreateSchema.parse({ name: "Alex", currency: "USD" })).toMatchObject({ currency: "USD" });
  });

  it("rejects blank and unknown profile fields", () => {
    expect(profileCreateSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(profileCreateSchema.safeParse({ name: "Alex", role: "admin" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ currency: "EUR" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ currency: "GBP" }).success).toBe(false);
  });
});

describe("ledger validation", () => {
  it("accepts positive charge/payment and signed adjustments", () => {
    expect(
      ledgerEntryInputSchema.parse({ type: "charge", amountCents: "1250", note: "Dinner" }),
    ).toMatchObject({ type: "charge", amountCents: 1250 });
    expect(ledgerEntryInputSchema.parse({ type: "payment", amountCents: 500 })).toMatchObject({
      type: "payment",
      amountCents: 500,
    });
    expect(ledgerEntryInputSchema.parse({ type: "adjustment", amountCents: -200 })).toMatchObject({
      type: "adjustment",
      amountCents: -200,
    });
  });

  it("rejects invalid signs, zeroes, fractions, and oversized values", () => {
    expect(ledgerEntryInputSchema.safeParse({ type: "charge", amountCents: 0 }).success).toBe(false);
    expect(ledgerEntryInputSchema.safeParse({ type: "payment", amountCents: -1 }).success).toBe(false);
    expect(ledgerEntryInputSchema.safeParse({ type: "adjustment", amountCents: 0 }).success).toBe(false);
    expect(ledgerEntryInputSchema.safeParse({ type: "charge", amountCents: 1.5 }).success).toBe(false);
    expect(
      ledgerEntryInputSchema.safeParse({ type: "charge", amountCents: "9000000000000001" }).success,
    ).toBe(false);
  });

  it("requires a positive safe integer and invoice number for attachments", () => {
    expect(invoiceAttachmentSchema.parse({ amountCents: 150_000, invoiceNumber: " INV-0001 " })).toEqual({
      amountCents: 150_000,
      invoiceNumber: "INV-0001",
    });
    expect(invoiceAttachmentSchema.safeParse({ amountCents: 0, invoiceNumber: "INV-0001" }).success).toBe(false);
    expect(invoiceAttachmentSchema.safeParse({ amountCents: 1.5, invoiceNumber: "INV-0001" }).success).toBe(false);
    expect(invoiceAttachmentSchema.safeParse({ amountCents: Number.MAX_SAFE_INTEGER + 1, invoiceNumber: "INV-0001" }).success).toBe(false);
    expect(invoiceAttachmentSchema.safeParse({ amountCents: 100, invoiceNumber: "   " }).success).toBe(false);
  });
});
