import { z } from "zod";

/** The largest amount we accept while still being able to represent it safely in JSON. */
export const MAX_AMOUNT_CENTS = 9_000_000_000_000_000;

const amountValueSchema = z
  .union([z.number().finite(), z.string().trim().min(1)])
  .transform((value) => (typeof value === "number" ? value : Number(value)))
  .refine(
    (value) => Number.isSafeInteger(value) && Math.abs(value) <= MAX_AMOUNT_CENTS,
    "amountCents must be a safe integer within the supported range",
  );

const noteSchema = z.string().trim().max(500, "note must be 500 characters or fewer").optional();

export const profileIdSchema = z.string().uuid("profile id must be a valid UUID");

export const profileCurrencySchema = z.enum(["HUF", "USD", "EUR"]);
export type ProfileCurrency = z.infer<typeof profileCurrencySchema>;

export const profileCreateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120, "name must be 120 characters or fewer"),
    currency: profileCurrencySchema.default("HUF"),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120, "name must be 120 characters or fewer").optional(),
    currency: profileCurrencySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "at least one profile field is required");

export const adminLoginSchema = z
  .object({
    password: z.string().min(1, "password is required").max(512, "password is too long"),
  })
  .strict();

export const ledgerTypeSchema = z.enum(["charge", "payment", "adjustment"]);

export const ledgerEntryInputSchema = z
  .object({
    type: ledgerTypeSchema,
    amountCents: amountValueSchema,
    note: noteSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.type === "charge" || value.type === "payment") && value.amountCents <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: `${value.type} amountCents must be greater than zero`,
      });
    }

    if (value.type === "adjustment" && value.amountCents === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: "adjustment amountCents must not be zero",
      });
    }
  });

export type LedgerEntryInput = z.infer<typeof ledgerEntryInputSchema>;
export type LedgerType = z.infer<typeof ledgerTypeSchema>;

/**
 * A public invoice attachment is deliberately narrower than a general ledger
 * mutation: it can only add a positive charge and must identify the invoice
 * that is being attached.
 */
export const invoiceAttachmentSchema = z
  .object({
    amountCents: z
      .number()
      .finite()
      .int("amountCents must be a whole number")
      .safe("amountCents must be a safe integer")
      .positive("amountCents must be greater than zero")
      .max(MAX_AMOUNT_CENTS, "amountCents is too large"),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, "invoiceNumber is required")
      .max(200, "invoiceNumber must be 200 characters or fewer"),
  })
  .strict();

export type InvoiceAttachmentInput = z.infer<typeof invoiceAttachmentSchema>;
