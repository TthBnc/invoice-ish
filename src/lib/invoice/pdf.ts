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
  formatQuantity,
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

const WATERMARK_TEXT = "INVOICE-ISH";
const WATERMARK_SIZE = 52;
const WATERMARK_ROTATION_DEGREES = -24;

const COLORS = {
  ink: rgb(0.08, 0.1, 0.13),
  muted: rgb(0.37, 0.4, 0.44),
  faint: rgb(0.94, 0.95, 0.95),
  line: rgb(0.85, 0.87, 0.88),
  accent: rgb(0.12, 0.42, 0.38),
  accentSoft: rgb(0.89, 0.95, 0.93),
  watermark: rgb(0.92, 0.94, 0.94),
  white: rgb(1, 1, 1),
};

const MARGIN = 42;

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

function drawPartyCard(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  x: number,
  y: number,
  width: number,
  height: number,
  heading: string,
  party: InvoiceDocument["sender"],
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLORS.faint,
    borderColor: COLORS.line,
    borderWidth: 0.8,
  });
  page.drawText(pdfText(heading.toUpperCase()), {
    x: x + 13,
    y: y + height - 19,
    size: 7,
    font: fonts.bold,
    color: COLORS.accent,
  });
  page.drawText(fitText(party.name, fonts.bold, 12, width - 26), {
    x: x + 13,
    y: y + height - 39,
    size: 12,
    font: fonts.bold,
    color: COLORS.ink,
  });

  const secondary = [party.address, party.email, party.taxNumber ? `Tax no. ${party.taxNumber}` : undefined]
    .filter((entry): entry is string => Boolean(entry));
  let lineY = y + height - 55;
  for (const entry of secondary) {
    for (const line of wrappedLines(entry, fonts.regular, 8.5, width - 26, 1)) {
      page.drawText(line, {
        x: x + 13,
        y: lineY,
        size: 8.5,
        font: fonts.regular,
        color: COLORS.muted,
      });
      lineY -= 11;
      if (lineY < y + 9) return;
    }
  }
}

function drawMeta(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  labels: ReturnType<typeof getInvoiceLabels>,
  document: InvoiceDocument,
  x: number,
  y: number,
  width: number,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height: 66,
    color: COLORS.accentSoft,
    borderColor: COLORS.line,
    borderWidth: 0.8,
  });
  page.drawText(pdfText(labels.invoiceNumber.toUpperCase()), {
    x: x + 13,
    y: y + 47,
    size: 7,
    font: fonts.bold,
    color: COLORS.accent,
  });
  page.drawText(fitText(document.invoiceNumber, fonts.bold, 12, width - 26), {
    x: x + 13,
    y: y + 29,
    size: 12,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawText(`${pdfText(labels.issueDate)}  ${pdfText(formatInvoiceDate(document.issueDate, document.locale))}`, {
    x: x + 13,
    y: y + 13,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
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

  const page = pdf.addPage([595.28, 841.89]);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const { width, height } = page.getSize();
  const contentWidth = width - MARGIN * 2;

  // Quiet watermark gives the page a recognizable Invoice-ish signature.
  const watermarkWidth = fonts.bold.widthOfTextAtSize(WATERMARK_TEXT, WATERMARK_SIZE);
  page.drawText(WATERMARK_TEXT, {
    x: centeredRotatedTextX(width, watermarkWidth, WATERMARK_ROTATION_DEGREES),
    y: height / 2 - 18,
    size: WATERMARK_SIZE,
    font: fonts.bold,
    color: COLORS.watermark,
    rotate: degrees(WATERMARK_ROTATION_DEGREES),
  });

  page.drawText(pdfText(labels.invoice), {
    x: MARGIN,
    y: height - MARGIN - 10,
    size: 30,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawText("INVOICE-ISH", {
    x: MARGIN + 2,
    y: height - MARGIN - 29,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.accent,
  });
  drawMeta(page, fonts, labels, { ...document, locale }, width - MARGIN - 190, height - MARGIN - 70, 190);

  const cardTop = height - 151;
  const cardHeight = 78;
  const cardGap = 14;
  const cardWidth = (contentWidth - cardGap) / 2;
  drawPartyCard(page, fonts, MARGIN, cardTop - cardHeight, cardWidth, cardHeight, labels.from, document.sender);
  drawPartyCard(
    page,
    fonts,
    MARGIN + cardWidth + cardGap,
    cardTop - cardHeight,
    cardWidth,
    cardHeight,
    labels.billTo,
    document.recipient,
  );

  const tableTop = cardTop - cardHeight - 25;
  const tableHeaderHeight = 25;
  const lowerContentY = document.note ? 252 : 218;
  const availableItemsHeight = tableTop - tableHeaderHeight - lowerContentY;
  const rowHeight = 21;
  const maxRows = Math.max(1, Math.floor(availableItemsHeight / rowHeight));
  const needsOverflowRow = document.lineItems.length > maxRows;
  const visibleItems = needsOverflowRow ? document.lineItems.slice(0, Math.max(1, maxRows - 1)) : document.lineItems;
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
  const tableHeight = tableHeaderHeight + rows.length * rowHeight;
  const tableBottom = tableTop - tableHeight;

  page.drawRectangle({
    x: MARGIN,
    y: tableBottom,
    width: contentWidth,
    height: tableHeight,
    borderColor: COLORS.line,
    borderWidth: 0.8,
  });
  page.drawRectangle({
    x: MARGIN,
    y: tableTop - tableHeaderHeight,
    width: contentWidth,
    height: tableHeaderHeight,
    color: COLORS.ink,
  });

  const quantityRight = MARGIN + contentWidth - 189;
  const unitRight = MARGIN + contentWidth - 92;
  const amountRight = MARGIN + contentWidth - 12;
  const descriptionX = MARGIN + 12;
  const headerY = tableTop - 16;
  page.drawText(pdfText(labels.description.toUpperCase()), { x: descriptionX, y: headerY, size: 7, font: fonts.bold, color: COLORS.white });
  drawRight(page, fonts.bold, labels.quantity.toUpperCase(), quantityRight, headerY, 7, COLORS.white);
  drawRight(page, fonts.bold, labels.unitPrice.toUpperCase(), unitRight, headerY, 7, COLORS.white);
  drawRight(page, fonts.bold, labels.amount.toUpperCase(), amountRight, headerY, 7, COLORS.white);

  rows.forEach((item, index) => {
    const rowTop = tableTop - tableHeaderHeight - index * rowHeight;
    const rowY = rowTop - rowHeight;
    if (index % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: rowY, width: contentWidth, height: rowHeight, color: COLORS.faint });
    }
    const textY = rowY + 7;
    const rowDescription = fitText(item.description, fonts.regular, 8.5, quantityRight - descriptionX - 16);
    page.drawText(rowDescription, { x: descriptionX, y: textY, size: 8.5, font: fonts.regular, color: COLORS.ink });
    drawRight(page, fonts.regular, formatQuantity(item.quantity, locale), quantityRight, textY, 8.5, COLORS.muted);
    drawRight(page, fonts.regular, formatCurrency(item.unitPrice, document.currency, locale), unitRight, textY, 8.5, COLORS.muted);
    drawRight(page, fonts.bold, formatCurrency(item.amount, document.currency, locale), amountRight, textY, 8.5, COLORS.ink);
  });

  const summaryY = lowerContentY - 2;
  const totalsWidth = 210;
  const totalsX = width - MARGIN - totalsWidth;
  const totalsHeight = 78;
  page.drawRectangle({
    x: totalsX,
    y: summaryY,
    width: totalsWidth,
    height: totalsHeight,
    color: COLORS.accentSoft,
  });
  page.drawText(pdfText(labels.subtotal), { x: totalsX + 13, y: summaryY + 50, size: 8.5, font: fonts.regular, color: COLORS.muted });
  drawRight(page, fonts.regular, formatCurrency(document.subtotal, document.currency, locale), totalsX + totalsWidth - 13, summaryY + 50, 8.5, COLORS.ink);
  page.drawLine({ start: { x: totalsX + 13, y: summaryY + 39 }, end: { x: totalsX + totalsWidth - 13, y: summaryY + 39 }, thickness: 0.6, color: COLORS.line });
  page.drawText(pdfText(labels.total), { x: totalsX + 13, y: summaryY + 19, size: 9, font: fonts.bold, color: COLORS.accent });
  drawRight(page, fonts.bold, formatCurrency(document.total, document.currency, locale), totalsX + totalsWidth - 13, summaryY + 17, 13, COLORS.ink);

  const noteWidth = totalsX - MARGIN - 22;
  if (document.note) {
    page.drawText(pdfText(labels.note.toUpperCase()), { x: MARGIN, y: summaryY + 62, size: 7, font: fonts.bold, color: COLORS.accent });
    const noteLines = wrappedLines(document.note, fonts.regular, 8.5, noteWidth, 4);
    noteLines.forEach((line, index) => page.drawText(line, { x: MARGIN, y: summaryY + 45 - index * 11, size: 8.5, font: fonts.regular, color: COLORS.muted }));
  } else {
    page.drawText(pdfText(labels.thankYou), { x: MARGIN, y: summaryY + 34, size: 9, font: fonts.regular, color: COLORS.muted });
  }

  page.drawLine({ start: { x: MARGIN, y: 55 }, end: { x: width - MARGIN, y: 55 }, thickness: 0.7, color: COLORS.line });
  page.drawText("Invoice-ish", { x: MARGIN, y: 38, size: 7.5, font: fonts.bold, color: COLORS.accent });
  drawRight(page, fonts.regular, pdfText(formatInvoiceDate(document.issueDate, locale)), width - MARGIN, 38, 7.5, COLORS.muted);

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
