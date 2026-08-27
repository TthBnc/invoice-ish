import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
} from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";

import {
  formatCurrency,
  formatInvoiceDate,
  getInvoiceLabels,
} from "./format";
import { createInvoiceDocument } from "./validation";
import type {
  InvoiceDocument,
  InvoiceInput,
  InvoiceLocale,
} from "./types";

export interface InvoicePdfOptions {
  /** Optional filename used by `downloadInvoicePdf` (with or without .pdf). */
  filename?: string;
  /** Override the document's display language for the generated PDF. */
  locale?: InvoiceLocale;
  author?: string;
}

export const WATERMARK_TEXT = "Invoice-ish";
const WATERMARK_SIZE = 86;
export const WATERMARK_ROTATION_DEGREES = 24;

const COLORS = {
  ink: rgb(0.08, 0.08, 0.08),
  muted: rgb(0.42, 0.42, 0.42),
  line: rgb(0.82, 0.82, 0.82),
  watermark: rgb(0.945, 0.945, 0.945),
};

const MARGIN = 56;

const PAGE_SIZE = {
  width: 595.28,
  height: 841.89,
};

/** Return the baseline x coordinate that centers a rotated text run. */
export function centeredRotatedTextX(
  pageWidth: number,
  textWidth: number,
  rotationDegrees: number,
): number {
  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const projectedWidth = textWidth * Math.cos(rotationRadians);
  return pageWidth / 2 - projectedWidth / 2;
}

function bytesToBlob(bytes: Uint8Array): Blob {
  // TypeScript's DOM lib correctly treats a Uint8Array backed by a
  // SharedArrayBuffer as incompatible with BlobPart. Copy into a plain
  // ArrayBuffer so this remains portable across browser runtimes.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

/**
 * Standard PDF fonts use WinAnsi. Most Hungarian characters are supported,
 * but ő/ű are not; replace only those two characters so a PDF can always be
 * produced with the built-in fonts requested by the app.
 */
function pdfText(value: string): string {
  return value
    .replace(/ő/g, "o")
    .replace(/Ő/g, "O")
    .replace(/ű/g, "u")
    .replace(/Ű/g, "U")
    .replace(/\u00a0/g, " ");
}

function fitText(value: string, font: PDFFont, size: number, maxWidth: number): string {
  let output = pdfText(value);
  if (font.widthOfTextAtSize(output, size) <= maxWidth) return output;
  while (output.length > 3 && font.widthOfTextAtSize(`${output.slice(0, -3)}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output.slice(0, -1)}...`;
}

function wrappedLines(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfText(value).split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      if (lines.length < maxLines) lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = next;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length >= maxLines) break;
  }
  if (lines.length === 0) lines.push("");
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines.length - 1;
  if (last >= 0 && font.widthOfTextAtSize(lines[last], size) > maxWidth) {
    lines[last] = fitText(lines[last], font, size, maxWidth);
  }
  return lines;
}

function drawRight(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color = COLORS.ink,
) {
  const text = pdfText(value);
  page.drawText(text, {
    x: x - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function baselineForTop(pageHeight: number, top: number, size: number): number {
  return pageHeight - top - size;
}

function drawPartyColumn(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  width: number,
  top: number,
  heading: string,
  party: InvoiceDocument["sender"],
  pageHeight: number,
) {
  page.drawText(pdfText(heading), {
    x,
    y: baselineForTop(pageHeight, top, 10),
    size: 10,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(fitText(party.name, fonts.bold, 13, width), {
    x,
    y: baselineForTop(pageHeight, top + 26, 13),
    size: 13,
    font: fonts.bold,
    color: COLORS.ink,
  });

  const secondary = [party.address, party.email, party.taxNumber ? `Tax no. ${party.taxNumber}` : undefined]
    .filter((entry): entry is string => Boolean(entry));
  let secondaryTop = top + 52;
  for (const entry of secondary) {
    for (const line of wrappedLines(entry, fonts.regular, 11, width, 1)) {
      page.drawText(line, {
        x,
        y: baselineForTop(pageHeight, secondaryTop, 11),
        size: 11,
        font: fonts.regular,
        color: COLORS.muted,
      });
      secondaryTop += 14;
    }
  }
}

/** Generate a one-page invoice PDF as bytes, entirely in the browser. */
export async function generateInvoicePdf(
  input: InvoiceInput | InvoiceDocument,
  options: InvoicePdfOptions = {},
): Promise<Uint8Array> {
  const document = createInvoiceDocument(input);
  const locale = options.locale ?? document.locale;
  const labels = getInvoiceLabels(locale);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${labels.invoice} ${document.invoiceNumber}`);
  pdf.setAuthor(options.author ?? "Invoice-ish");
  pdf.setSubject("Invoice");

  const page = pdf.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const { width, height } = page.getSize();
  const contentWidth = width - MARGIN * 2;

  // The old macOS renderer places a large, nearly-white signature through the
  // middle/lower half of the page. Draw it first so all document content stays
  // legible where the watermark passes behind it.
  const watermarkWidth = fonts.bold.widthOfTextAtSize(WATERMARK_TEXT, WATERMARK_SIZE);
  page.drawText(WATERMARK_TEXT, {
    x: centeredRotatedTextX(width, watermarkWidth, WATERMARK_ROTATION_DEGREES),
    y: height * 0.36,
    size: WATERMARK_SIZE,
    font: fonts.bold,
    color: COLORS.watermark,
    rotate: degrees(WATERMARK_ROTATION_DEGREES),
  });

  page.drawText(WATERMARK_TEXT, {
    x: MARGIN,
    y: baselineForTop(height, 52, 30),
    size: 30,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawText(
    fitText(`${labels.invoice} ${document.invoiceNumber}`, fonts.bold, 14, contentWidth / 2 - 12),
    {
      x: MARGIN,
      y: baselineForTop(height, 94, 14),
      size: 14,
      font: fonts.bold,
      color: COLORS.ink,
    },
  );

  const dateRight = width - MARGIN;
  drawRight(
    page,
    fonts.regular,
    `${labels.issueDate}: ${formatInvoiceDate(document.issueDate, locale)}`,
    dateRight,
    baselineForTop(height, 94, 11),
    11,
    COLORS.muted,
  );
  drawRight(
    page,
    fonts.regular,
    `${labels.dueDate}: ${formatInvoiceDate(document.dueDate, locale)}`,
    dateRight,
    baselineForTop(height, 114, 11),
    11,
    COLORS.muted,
  );

  const columnGap = 24;
  const columnWidth = (contentWidth - columnGap) / 2;
  drawPartyColumn(page, fonts, MARGIN, columnWidth, 154, labels.from, document.sender, height);
  drawPartyColumn(
    page,
    fonts,
    MARGIN + columnWidth + columnGap,
    columnWidth,
    154,
    labels.billTo,
    document.recipient,
    height,
  );

  const tableTop = 268;
  const firstRowTop = tableTop + 34;
  const rowHeight = 32;
  const descriptionWidth = contentWidth * 0.64;
  const amountRight = width - MARGIN;

  // Keep the complete invoice on one page. The old renderer has no pagination;
  // when there are too many rows, retain the existing compact overflow row
  // rather than allowing content to collide with the note/footer area.
  const footerTop = height - 55;
  const noteBottomReserve = document.note ? 174 : 0;
  const maxTableBottom = footerTop - 18 - noteBottomReserve;
  const maxRows = Math.max(1, Math.floor((maxTableBottom - firstRowTop) / rowHeight));
  const needsOverflowRow = document.lineItems.length > maxRows;
  const visibleItems = needsOverflowRow
    ? document.lineItems.slice(0, Math.max(1, maxRows - 1))
    : document.lineItems;
  const omittedItems = needsOverflowRow ? document.lineItems.slice(visibleItems.length) : [];
  const rows = omittedItems.length
    ? [
        ...visibleItems,
        {
          description: `+ ${omittedItems.length} more line item${omittedItems.length === 1 ? "" : "s"}`,
          quantity: 1,
          unitPrice: omittedItems.reduce((sum, item) => sum + item.amount, 0),
          amount: omittedItems.reduce((sum, item) => sum + item.amount, 0),
        },
      ]
    : visibleItems;

  page.drawText(pdfText(labels.description), {
    x: MARGIN,
    y: baselineForTop(height, tableTop, 10),
    size: 10,
    font: fonts.bold,
    color: COLORS.muted,
  });
  drawRight(
    page,
    fonts.bold,
    labels.amount,
    amountRight,
    baselineForTop(height, tableTop, 10),
    10,
    COLORS.muted,
  );

  rows.forEach((item, index) => {
    const rowTop = firstRowTop + index * rowHeight;
    const textTop = rowTop + 2;
    const rowDescription = fitText(item.description, fonts.regular, 12, descriptionWidth - 12);
    page.drawText(rowDescription, {
      x: MARGIN,
      y: baselineForTop(height, textTop, 12),
      size: 12,
      font: fonts.regular,
      color: COLORS.ink,
    });
    drawRight(
      page,
      fonts.regular,
      formatCurrency(item.amount, document.currency, locale),
      amountRight,
      baselineForTop(height, textTop, 12),
      12,
      COLORS.ink,
    );
  });

  const tableBottom = firstRowTop + rows.length * rowHeight;
  const ruleTop = tableBottom + 8;
  page.drawLine({
    start: { x: MARGIN, y: height - ruleTop },
    end: { x: width - MARGIN, y: height - ruleTop },
    thickness: 1,
    color: COLORS.line,
  });

  page.drawText(pdfText(labels.total), {
    x: MARGIN,
    y: baselineForTop(height, tableBottom + 22, 16),
    size: 16,
    font: fonts.bold,
    color: COLORS.ink,
  });
  drawRight(
    page,
    fonts.bold,
    formatCurrency(document.total, document.currency, locale),
    amountRight,
    baselineForTop(height, tableBottom + 21, 18),
    18,
    COLORS.ink,
  );

  if (document.note) {
    const noteTop = tableBottom + 86;
    page.drawText(pdfText(labels.note), {
      x: MARGIN,
      y: baselineForTop(height, noteTop, 10),
      size: 10,
      font: fonts.bold,
      color: COLORS.muted,
    });
    const noteLines = wrappedLines(document.note, fonts.regular, 12, contentWidth, 4);
    noteLines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN,
        y: baselineForTop(height, noteTop + 26 + index * 14, 12),
        size: 12,
        font: fonts.regular,
        color: COLORS.ink,
      });
    });
  }

  /*
   * The macOS renderer intentionally ends after the invoice content. Keeping
   * the web PDF free of the previous teal footer makes the two outputs match
   * while the issue date remains visible in the header.
   */
  return pdf.save();
}

export async function generateInvoicePdfBlob(
  input: InvoiceInput | InvoiceDocument,
  options: InvoicePdfOptions = {},
): Promise<Blob> {
  const bytes = await generateInvoicePdf(input, options);
  return bytesToBlob(bytes);
}

/** Trigger a browser download without sending the invoice or balance anywhere. */
export async function downloadInvoicePdf(
  input: InvoiceInput | InvoiceDocument,
  options: InvoicePdfOptions = {},
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("downloadInvoicePdf must be called in a browser.");
  }
  const bytes = await generateInvoicePdf(input, options);
  const blob = bytesToBlob(bytes);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const normalizedFilename = options.filename?.trim() || `${createInvoiceDocument(input).invoiceNumber}.pdf`;
  anchor.href = url;
  anchor.download = normalizedFilename.toLowerCase().endsWith(".pdf") ? normalizedFilename : `${normalizedFilename}.pdf`;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
