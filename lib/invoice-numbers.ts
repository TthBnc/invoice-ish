import { getDatabase } from "@/lib/db";
import { formatInvoiceNumber } from "@/src/lib/invoice/format";

/**
 * JSON can represent integers exactly only through Number.MAX_SAFE_INTEGER.
 * Keep the sequence in PostgreSQL as BIGINT, but fail clearly before returning
 * a value that could be corrupted by a JavaScript number conversion.
 */
const MAX_SAFE_INVOICE_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_INVOICE_NUMBER = BigInt(1);

export class InvoiceNumberSequenceError extends Error {
  constructor(message = "The invoice number sequence is exhausted") {
    super(message);
    this.name = "InvoiceNumberSequenceError";
  }
}

function parseSequenceValue(value: unknown): bigint {
  const raw = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new InvoiceNumberSequenceError("The invoice number sequence returned an invalid value");
  }

  let sequenceValue: bigint;
  try {
    sequenceValue = BigInt(raw);
  } catch {
    throw new InvoiceNumberSequenceError("The invoice number sequence returned an invalid value");
  }

  if (sequenceValue < MIN_INVOICE_NUMBER || sequenceValue > MAX_SAFE_INVOICE_NUMBER) {
    throw new InvoiceNumberSequenceError();
  }

  return sequenceValue;
}

/**
 * Reserve one global invoice number. The database sequence allocates atomically
 * under concurrent requests, so callers never receive the same number.
 */
export async function reserveInvoiceNumber(): Promise<string> {
  const result = await getDatabase().query<{ invoiceNumber: unknown }>(
    `SELECT nextval('invoice_number_sequence')::text AS "invoiceNumber"`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new InvoiceNumberSequenceError("The invoice number sequence did not return a value");
  }

  return formatInvoiceNumber(parseSequenceValue(row.invoiceNumber).toString());
}
