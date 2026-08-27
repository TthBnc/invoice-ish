import type { InvoiceCurrency, InvoiceDate, InvoiceLocale } from "./types";

const LOCALE_TAGS: Record<InvoiceLocale, string> = {
  en: "en-US",
  hu: "hu-HU",
};

const CURRENCY_FRACTION_DIGITS: Record<InvoiceCurrency, number> = {
  HUF: 0,
  USD: 2,
  EUR: 2,
};

/** Labels used by the invoice form, summary and PDF. */
export const INVOICE_LABELS: Record<
  InvoiceLocale,
  {
    invoice: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    from: string;
    billTo: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    subtotal: string;
    total: string;
    note: string;
    thankYou: string;
  }
> = {
  en: {
    invoice: "Invoice",
    invoiceNumber: "Invoice no.",
    issueDate: "Issue date",
    dueDate: "Due date",
    from: "From",
    billTo: "Bill to",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    total: "Total due",
    note: "Note",
    thankYou: "Thank you for your business",
  },
  hu: {
    invoice: "Számla",
    invoiceNumber: "Számlaszám",
    issueDate: "Kiállítás dátuma",
    dueDate: "Fizetési határidő",
    from: "Kiállító",
    billTo: "Vevő",
    description: "Megnevezés",
    quantity: "Menny.",
    unitPrice: "Egységár",
    amount: "Összeg",
    subtotal: "Részösszeg",
    total: "Fizetendő",
    note: "Megjegyzés",
    thankYou: "Köszönjük a megrendelést",
  },
};

export function getInvoiceLabels(locale: InvoiceLocale = "en") {
  return INVOICE_LABELS[locale];
}

/**
 * Round a money value to two decimal places before doing further arithmetic.
 * HUF is formatted without decimals later, while retaining two-decimal
 * arithmetic keeps USD/EUR totals predictable.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(
  value: number,
  currency: InvoiceCurrency,
  locale: InvoiceLocale = "en",
): string {
  if (!Number.isFinite(value)) return "-";

  if (currency === "HUF") {
    // Hungarian Intl intentionally omits grouping for four-digit values
    // (the locale's `minimumGroupingDigits` rule). In invoices, a stable
    // thousands separator is easier to scan, so normalize from en-US and use
    // Hungarian's non-breaking space when appropriate.
    const grouped = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
    const formattedNumber = locale === "hu" ? grouped.replace(/,/g, "\u00a0") : grouped;
    return `${formattedNumber} Ft`;
  }

  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: CURRENCY_FRACTION_DIGITS[currency],
    maximumFractionDigits: CURRENCY_FRACTION_DIGITS[currency],
  }).format(value);
}

export function formatQuantity(value: number, locale: InvoiceLocale = "en"): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number or an already meaningful identifier as `INV-0001`.
 * Existing prefixed identifiers are preserved (apart from casing), while a
 * plain numeric value receives four-digit zero padding.
 */
export function formatInvoiceNumber(
  value: string | number,
  prefix = "INV",
  width = 4,
): string {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const raw = String(value).trim();
  if (!raw) return normalizedPrefix ? `${normalizedPrefix}-${"0".repeat(width)}` : "";

  const upper = raw.toUpperCase();
  if (normalizedPrefix && (upper === normalizedPrefix || upper.startsWith(`${normalizedPrefix}-`))) {
    return upper;
  }

  const numberPart = /^\d+$/.test(raw) ? raw.padStart(width, "0") : upper;
  return normalizedPrefix ? `${normalizedPrefix}-${numberPart}` : numberPart;
}

/** Convert a date input into the canonical date-only form used by invoices. */
export function toInvoiceDateString(value: InvoiceDate): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = value.trim();
  if (!raw) return null;

  // Date-only strings should not be parsed as UTC: doing so would move the
  // displayed date back one day for users west of UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      candidate.getFullYear() === Number(year) &&
      candidate.getMonth() === Number(month) - 1 &&
      candidate.getDate() === Number(day)
    ) {
      return raw;
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function formatInvoiceDate(
  value: InvoiceDate | null | undefined,
  locale: InvoiceLocale = "en",
): string {
  if (value === null || value === undefined) return "-";
  const canonical = toInvoiceDateString(value);
  if (!canonical) return "-";

  const [year, month, day] = canonical.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function compareInvoiceDates(left: string, right: string): number {
  return left.localeCompare(right);
}
