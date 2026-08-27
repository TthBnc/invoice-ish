import {
  formatInvoiceNumber,
  roundMoney,
  toInvoiceDateString,
} from "./format";
import type {
  InvoiceDocument,
  InvoiceInput,
  InvoiceLineItem,
  InvoiceLocale,
  InvoiceParty,
} from "./types";

export type InvoiceValidationCode =
  | "invalid-type"
  | "required"
  | "invalid"
  | "positive"
  | "date-order"
  | "too-long";

export interface InvoiceValidationIssue {
  field: string;
  code: InvoiceValidationCode;
  message: string;
}

export interface InvoiceValidationResult {
  valid: boolean;
  issues: InvoiceValidationIssue[];
  data?: InvoiceDocument;
}

export class InvoiceValidationError extends Error {
  readonly issues: InvoiceValidationIssue[];

  constructor(issues: InvoiceValidationIssue[]) {
    super("Invoice validation failed");
    this.name = "InvoiceValidationError";
    this.issues = issues;
  }
}

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_EMAIL_LENGTH = 320;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_NOTE_LENGTH = 2000;

function issue(
  issues: InvoiceValidationIssue[],
  field: string,
  code: InvoiceValidationCode,
  message: string,
) {
  issues.push({ field, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/,(?=\d{1,2}$)/, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateParty(
  value: unknown,
  field: "sender" | "recipient",
  issues: InvoiceValidationIssue[],
): InvoiceParty {
  if (!isRecord(value)) {
    issue(issues, field, "invalid-type", "Party details are required.");
    return { name: "" };
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) issue(issues, `${field}.name`, "required", "Name is required.");
  if (name.length > MAX_NAME_LENGTH) {
    issue(issues, `${field}.name`, "too-long", `Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }

  const result: InvoiceParty = { name };
  for (const property of ["address", "email", "taxNumber"] as const) {
    const raw = value[property];
    if (raw === null || raw === undefined || raw === "") continue;
    if (typeof raw !== "string") {
      issue(issues, `${field}.${property}`, "invalid-type", "This value must be text.");
      continue;
    }
    const text = raw.trim();
    const maxLength = property === "address" ? MAX_ADDRESS_LENGTH : property === "email" ? MAX_EMAIL_LENGTH : MAX_NAME_LENGTH;
    if (text.length > maxLength) {
      issue(issues, `${field}.${property}`, "too-long", `This value must be ${maxLength} characters or fewer.`);
    }
    if (property === "email" && text && !/^\S+@\S+\.\S+$/.test(text)) {
      issue(issues, `${field}.email`, "invalid", "Enter a valid email address.");
    }
    result[property] = text;
  }
  return result;
}

function normalizeLineItems(value: unknown, issues: InvoiceValidationIssue[]): InvoiceLineItem[] {
  if (!Array.isArray(value)) {
    issue(issues, "lineItems", "invalid-type", "At least one line item is required.");
    return [];
  }
  if (value.length === 0) {
    issue(issues, "lineItems", "required", "At least one line item is required.");
    return [];
  }

  return value.map((item, index) => {
    const field = `lineItems.${index}`;
    if (!isRecord(item)) {
      issue(issues, field, "invalid-type", "Line item details are required.");
      return { description: "", quantity: 0, unitPrice: 0, amount: 0 };
    }

    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) issue(issues, `${field}.description`, "required", "Description is required.");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      issue(issues, `${field}.description`, "too-long", `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
    }

    const quantity = parseNumber(item.quantity);
    if (quantity === null) issue(issues, `${field}.quantity`, "invalid", "Quantity must be a number.");
    else if (quantity <= 0) issue(issues, `${field}.quantity`, "positive", "Quantity must be greater than zero.");

    const unitPrice = parseNumber(item.unitPrice);
    if (unitPrice === null) issue(issues, `${field}.unitPrice`, "invalid", "Unit price must be a number.");
    else if (unitPrice < 0) issue(issues, `${field}.unitPrice`, "positive", "Unit price cannot be negative.");

    const safeQuantity = quantity ?? 0;
    const safeUnitPrice = unitPrice ?? 0;
    const amount = safeQuantity * safeUnitPrice;
    if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) {
      issue(issues, `${field}.unitPrice`, "invalid", "The line item amount is too large.");
    }
    return {
      description,
      quantity: safeQuantity,
      unitPrice: safeUnitPrice,
      amount: Number.isFinite(amount) ? roundMoney(amount) : 0,
    };
  });
}

/** Validate an invoice without performing any persistence or balance updates. */
export function validateInvoice(
  input: unknown,
  locale: InvoiceLocale = isRecord(input) && input.locale === "hu" ? "hu" : "en",
): InvoiceValidationResult {
  const issues: InvoiceValidationIssue[] = [];
  if (!isRecord(input)) {
    issue(issues, "invoice", "invalid-type", "Invoice details are required.");
    return { valid: false, issues };
  }

  const invoiceNumber = input.invoiceNumber;
  if (invoiceNumber === undefined || invoiceNumber === null || String(invoiceNumber).trim() === "") {
    issue(issues, "invoiceNumber", "required", locale === "hu" ? "A számlaszám kötelező." : "Invoice number is required.");
  } else if (
    (typeof invoiceNumber !== "string" && typeof invoiceNumber !== "number") ||
    (typeof invoiceNumber === "number" && !Number.isFinite(invoiceNumber))
  ) {
    issue(issues, "invoiceNumber", "invalid-type", locale === "hu" ? "A számlaszám szöveg vagy szám legyen." : "Invoice number must be text or a number.");
  }

  const sender = validateParty(input.sender, "sender", issues);
  const recipient = validateParty(input.recipient, "recipient", issues);

  const issueDate = typeof input.issueDate === "string" || input.issueDate instanceof Date
    ? toInvoiceDateString(input.issueDate)
    : null;
  if (!issueDate) issue(issues, "issueDate", "invalid", locale === "hu" ? "Érvényes kiállítási dátum szükséges." : "A valid issue date is required.");

  let dueDate: string | undefined;
  if (input.dueDate !== undefined && input.dueDate !== null && String(input.dueDate).trim() !== "") {
    const parsedDueDate = typeof input.dueDate === "string" || input.dueDate instanceof Date
      ? toInvoiceDateString(input.dueDate)
      : null;
    if (!parsedDueDate) issue(issues, "dueDate", "invalid", locale === "hu" ? "Érvényes fizetési határidő szükséges." : "A valid due date is required.");
    else dueDate = parsedDueDate;
  }
  if (issueDate && dueDate && dueDate < issueDate) {
    issue(issues, "dueDate", "date-order", locale === "hu" ? "A határidő nem lehet a kiállítás dátuma előtt." : "Due date cannot be before the issue date.");
  }

  const currency = input.currency;
  if (currency !== "HUF" && currency !== "USD" && currency !== "EUR") {
    issue(issues, "currency", "invalid", locale === "hu" ? "Válassz HUF, USD vagy EUR pénznemet." : "Choose HUF, USD or EUR.");
  }

  if (input.locale !== undefined && input.locale !== "en" && input.locale !== "hu") {
    issue(issues, "locale", "invalid", "Locale must be en or hu.");
  }

  const lineItems = normalizeLineItems(input.lineItems, issues);
  const note = input.note === undefined || input.note === null ? undefined : typeof input.note === "string" ? input.note.trim() : "";
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    issue(issues, "note", "invalid-type", "Note must be text.");
  }
  if (note && note.length > MAX_NOTE_LENGTH) {
    issue(issues, "note", "too-long", `Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  if (issues.length > 0) return { valid: false, issues };

  const normalizedItems = lineItems;
  const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.amount, 0));
  const document: InvoiceDocument = {
    invoiceNumber: formatInvoiceNumber(invoiceNumber as string | number),
    sender,
    recipient,
    issueDate: issueDate as string,
    ...(dueDate ? { dueDate } : {}),
    currency: currency as InvoiceDocument["currency"],
    lineItems: normalizedItems,
    subtotal,
    total: subtotal,
    ...(note ? { note } : {}),
    locale: locale === "hu" ? "hu" : "en",
  };
  return { valid: true, issues: [], data: document };
}

export function createInvoiceDocument(input: InvoiceInput): InvoiceDocument {
  const result = validateInvoice(input);
  if (!result.valid || !result.data) throw new InvoiceValidationError(result.issues);
  return result.data;
}
