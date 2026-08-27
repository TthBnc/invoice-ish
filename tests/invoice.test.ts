import { describe, expect, it } from "vitest";

import {
  createInvoiceDocument,
  centeredRotatedTextX,
  formatCurrency,
  formatInvoiceDate,
  formatInvoiceNumber,
  generateInvoicePdf,
  syncDueDateWithIssueDate,
  validateInvoice,
} from "../src/lib/invoice";
import { PDFDocument } from "pdf-lib";

const validInput = {
  invoiceNumber: 7,
  sender: { name: "Invoice-ish", address: "Budapest", email: "hello@example.com" },
  recipient: { name: "Ada Lovelace" },
  issueDate: "2026-08-27",
  dueDate: "2026-09-10",
  currency: "USD" as const,
  lineItems: [
    { description: "Design work", quantity: "2", unitPrice: "12.50" },
    { description: "Hosting", quantity: 1, unitPrice: 5 },
  ],
  note: "Thank you!",
};

describe("invoice formatting", () => {
  it("centers rotated text using its projected width", () => {
    const pageWidth = 595.28;
    const textWidth = 315.224;
    const rotationDegrees = -24;
    const projectedWidth = textWidth * Math.cos((rotationDegrees * Math.PI) / 180);
    const x = centeredRotatedTextX(pageWidth, textWidth, rotationDegrees);

    expect(x + projectedWidth / 2).toBeCloseTo(pageWidth / 2);
    expect(centeredRotatedTextX(pageWidth, textWidth, 0)).toBeCloseTo(
      pageWidth / 2 - textWidth / 2,
    );
  });

  it("formats invoice numbers with a stable padded identifier", () => {
    expect(formatInvoiceNumber(7)).toBe("ISH-0007");
    expect(formatInvoiceNumber("inv-2026-12")).toBe("INV-2026-12");
    expect(formatInvoiceNumber("12", "BILL", 3)).toBe("BILL-012");
  });

  it("formats HUF without fractional digits and USD/EUR with two", () => {
    expect(formatCurrency(12345.56, "HUF", "hu")).toContain("12\u00a0346");
    expect(formatCurrency(1234.5, "HUF", "hu")).toContain("Ft");
    expect(formatCurrency(12.5, "USD", "en")).toBe("$12.50");
    expect(formatCurrency(12.5, "EUR", "en")).toBe("€12.50");
  });

  it("keeps date-only values on the selected calendar day", () => {
    expect(formatInvoiceDate("2026-08-27", "en")).toContain("Aug 27, 2026");
    expect(formatInvoiceDate("2026-08-27", "hu")).toContain("2026");
  });

  it("keeps issue and due dates together until due date is changed", () => {
    expect(syncDueDateWithIssueDate("2026-08-27", "2026-08-27", "2026-09-01", false)).toBe("2026-09-01");
    expect(syncDueDateWithIssueDate("2026-08-27", "2026-08-27", "2026-09-01", true)).toBe("2026-09-01");
    expect(syncDueDateWithIssueDate("2026-08-27", "2026-09-10", "2026-09-01", true)).toBe("2026-09-10");
    expect(syncDueDateWithIssueDate("2026-08-27", "", "2026-09-01", true)).toBe("");
  });
});

describe("invoice validation", () => {
  it("normalizes a valid invoice and calculates every line and total", () => {
    const result = validateInvoice(validInput);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.data?.invoiceNumber).toBe("ISH-0007");
    expect(result.data?.lineItems.map((item) => item.amount)).toEqual([25, 5]);
    expect(result.data?.subtotal).toBe(30);
    expect(result.data?.total).toBe(30);
  });

  it("reports required, numeric, and date-order errors", () => {
    const result = validateInvoice({
      ...validInput,
      invoiceNumber: "",
      sender: { name: "" },
      dueDate: "2026-08-01",
      lineItems: [{ description: "", quantity: 0, unitPrice: -2 }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.field)).toEqual(
      expect.arrayContaining([
        "invoiceNumber",
        "sender.name",
        "dueDate",
        "lineItems.0.description",
        "lineItems.0.quantity",
        "lineItems.0.unitPrice",
      ]),
    );
  });

  it("does not modify the input while creating a document", () => {
    const input = structuredClone(validInput);
    const before = structuredClone(input);
    const document = createInvoiceDocument(input);
    expect(input).toEqual(before);
    expect(document.locale).toBe("en");
  });

  it("supports Hungarian labels and messages", () => {
    const result = validateInvoice({ ...validInput, locale: "hu", invoiceNumber: "" });
    expect(result.valid).toBe(false);
    expect(result.issues.some((item) => item.message.includes("kötelező"))).toBe(true);
  });

  it("generates a single-page PDF without changing the invoice input", async () => {
    const input = { ...validInput, locale: "hu" as const };
    const before = structuredClone(input);
    const bytes = await generateInvoicePdf(input);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(input).toEqual(before);
  });
});
