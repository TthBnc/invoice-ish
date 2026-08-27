/**
 * The currency and locale options supported by the invoice generator.
 *
 * Amounts are represented as ordinary numbers in the currency's major unit
 * (for example, `1250` means 1,250 HUF, not 1,250 minor units).
 */
export type InvoiceCurrency = "HUF" | "USD" | "EUR";
export type InvoiceLocale = "en" | "hu";

export type InvoiceDate = string | Date;

export interface InvoicePartyInput {
  name: string;
  address?: string | null;
  email?: string | null;
  taxNumber?: string | null;
}

export interface InvoiceLineItemInput {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
}

/** The shape accepted by validation and PDF generation. */
export interface InvoiceInput {
  invoiceNumber: string | number;
  sender: InvoicePartyInput;
  recipient: InvoicePartyInput;
  issueDate: InvoiceDate;
  dueDate?: InvoiceDate | null;
  currency: InvoiceCurrency;
  lineItems: InvoiceLineItemInput[];
  note?: string | null;
  locale?: InvoiceLocale;
}

export interface InvoiceParty {
  name: string;
  address?: string;
  email?: string;
  taxNumber?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** A validated, normalized invoice ready for display or PDF generation. */
export interface InvoiceDocument {
  invoiceNumber: string;
  sender: InvoiceParty;
  recipient: InvoiceParty;
  issueDate: string;
  dueDate?: string;
  currency: InvoiceCurrency;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  total: number;
  note?: string;
  locale: InvoiceLocale;
}
