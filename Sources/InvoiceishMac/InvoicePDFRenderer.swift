import AppKit
import CoreGraphics
import Foundation
import InvoiceishCore

enum InvoicePDFRenderer {
    static func render(
        draft: InvoiceDraft,
        settings: InvoiceSettingsSnapshot,
        invoiceNumber: String,
        date: Date,
        outputURL: URL
    ) throws {
        var mediaBox = CGRect(x: 0, y: 0, width: 595, height: 842)
        guard let context = CGContext(outputURL as CFURL, mediaBox: &mediaBox, nil) else {
            throw PDFRenderError.couldNotCreateContext
        }

        context.beginPDFPage(nil)
        context.translateBy(x: 0, y: mediaBox.height)
        context.scaleBy(x: 1, y: -1)

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        drawPage(
            in: context,
            pageRect: mediaBox,
            draft: draft,
            settings: settings,
            invoiceNumber: invoiceNumber,
            date: date
        )
        NSGraphicsContext.restoreGraphicsState()

        context.endPDFPage()
        context.closePDF()
    }

    private static func drawPage(
        in context: CGContext,
        pageRect: CGRect,
        draft: InvoiceDraft,
        settings: InvoiceSettingsSnapshot,
        invoiceNumber: String,
        date: Date
    ) {
        let margin: CGFloat = 56
        let contentWidth = pageRect.width - margin * 2
        let labels = settings.language.labels

        drawWatermark(in: context, pageRect: pageRect)

        drawText(
            "Invoice-ish",
            in: CGRect(x: margin, y: 52, width: contentWidth, height: 36),
            attributes: titleAttributes
        )

        drawText(
            "\(labels.invoice) \(invoiceNumber)",
            in: CGRect(x: margin, y: 94, width: contentWidth / 2, height: 22),
            attributes: headlineAttributes
        )
        drawText(
            "\(labels.date): \(formatted(date: date, language: settings.language))",
            in: CGRect(x: margin + contentWidth / 2, y: 94, width: contentWidth / 2, height: 22),
            attributes: rightAlignedSecondaryAttributes
        )

        drawSender(settings.sender, at: CGPoint(x: margin, y: 140), width: contentWidth / 2 - 12)
        drawRecipient(draft.recipient, labels: labels, at: CGPoint(x: margin + contentWidth / 2 + 12, y: 140), width: contentWidth / 2 - 12)

        let tableTop: CGFloat = 250
        drawTableHeader(labels: labels, x: margin, y: tableTop, width: contentWidth)

        var currentY = tableTop + 34
        for item in draft.items {
            drawTableRow(
                item: item,
                currency: draft.currency,
                x: margin,
                y: currentY,
                width: contentWidth
            )
            currentY += 32
        }

        drawRule(x: margin, y: currentY + 8, width: contentWidth, in: context)
        drawText(
            labels.total,
            in: CGRect(x: margin, y: currentY + 22, width: contentWidth * 0.64, height: 28),
            attributes: totalLabelAttributes
        )
        drawText(
            CurrencyFormatting.string(for: draft.total, currency: draft.currency),
            in: CGRect(x: margin + contentWidth * 0.64, y: currentY + 22, width: contentWidth * 0.36, height: 28),
            attributes: totalAmountAttributes
        )

        let trimmedNote = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedNote.isEmpty {
            drawText(
                labels.note,
                in: CGRect(x: margin, y: currentY + 86, width: contentWidth, height: 20),
                attributes: captionAttributes
            )
            drawText(
                trimmedNote,
                in: CGRect(x: margin, y: currentY + 112, width: contentWidth, height: 70),
                attributes: bodyAttributes
            )
        }
    }

    private static func drawSender(_ sender: SenderDetails, at origin: CGPoint, width: CGFloat) {
        drawText("From", in: CGRect(x: origin.x, y: origin.y, width: width, height: 18), attributes: captionAttributes)
        drawText(sender.name.isEmpty ? "Invoice-ish user" : sender.name, in: CGRect(x: origin.x, y: origin.y + 26, width: width, height: 20), attributes: bodyBoldAttributes)

        var detailLines: [String] = []
        if !sender.contact.isEmpty {
            detailLines.append(sender.contact)
        }
        if !sender.address.isEmpty {
            detailLines.append(sender.address)
        }

        drawText(detailLines.joined(separator: "\n"), in: CGRect(x: origin.x, y: origin.y + 52, width: width, height: 58), attributes: secondaryAttributes)
    }

    private static func drawRecipient(_ recipient: String, labels: InvoiceLabels, at origin: CGPoint, width: CGFloat) {
        drawText(labels.billTo, in: CGRect(x: origin.x, y: origin.y, width: width, height: 18), attributes: captionAttributes)
        drawText(recipient, in: CGRect(x: origin.x, y: origin.y + 26, width: width, height: 30), attributes: bodyBoldAttributes)
    }

    private static func drawTableHeader(labels: InvoiceLabels, x: CGFloat, y: CGFloat, width: CGFloat) {
        drawText(labels.description, in: CGRect(x: x, y: y, width: width * 0.64, height: 24), attributes: tableHeaderAttributes)
        drawText(labels.amount, in: CGRect(x: x + width * 0.64, y: y, width: width * 0.36, height: 24), attributes: tableHeaderRightAttributes)
    }

    private static func drawTableRow(item: InvoiceItem, currency: InvoiceCurrency, x: CGFloat, y: CGFloat, width: CGFloat) {
        drawText(item.description, in: CGRect(x: x, y: y, width: width * 0.64, height: 24), attributes: bodyAttributes)
        drawText(
            CurrencyFormatting.string(for: item.amount, currency: currency),
            in: CGRect(x: x + width * 0.64, y: y, width: width * 0.36, height: 24),
            attributes: amountAttributes
        )
    }

    private static func drawWatermark(in context: CGContext, pageRect: CGRect) {
        context.saveGState()
        context.translateBy(x: pageRect.midX, y: pageRect.midY)
        context.rotate(by: -CGFloat.pi / 7)

        let text = "Invoice-ish" as NSString
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 86, weight: .bold),
            .foregroundColor: NSColor.secondaryLabelColor.withAlphaComponent(0.08)
        ]
        let size = text.size(withAttributes: attributes)
        text.draw(at: CGPoint(x: -size.width / 2, y: -size.height / 2), withAttributes: attributes)

        context.restoreGState()
    }

    private static func drawRule(x: CGFloat, y: CGFloat, width: CGFloat, in context: CGContext) {
        context.saveGState()
        context.setStrokeColor(NSColor.separatorColor.cgColor)
        context.setLineWidth(1)
        context.move(to: CGPoint(x: x, y: y))
        context.addLine(to: CGPoint(x: x + width, y: y))
        context.strokePath()
        context.restoreGState()
    }

    private static func drawText(
        _ text: String,
        in rect: CGRect,
        attributes: [NSAttributedString.Key: Any]
    ) {
        (text as NSString).draw(in: rect, withAttributes: attributes)
    }

    private static func formatted(date: Date, language: InvoiceLanguage) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        formatter.locale = Locale(identifier: language == .hungarian ? "hu_HU" : "en_US")
        return formatter.string(from: date)
    }
}

private enum PDFRenderError: LocalizedError {
    case couldNotCreateContext

    var errorDescription: String? {
        switch self {
        case .couldNotCreateContext:
            return "Could not create the PDF file."
        }
    }
}

private let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 30, weight: .bold),
    .foregroundColor: NSColor.labelColor
]

private let headlineAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 14, weight: .semibold),
    .foregroundColor: NSColor.labelColor
]

private let bodyAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 12),
    .foregroundColor: NSColor.labelColor
]

private let bodyBoldAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
    .foregroundColor: NSColor.labelColor
]

private let secondaryAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 11),
    .foregroundColor: NSColor.secondaryLabelColor
]

private let captionAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 10, weight: .semibold),
    .foregroundColor: NSColor.secondaryLabelColor
]

private let rightAlignedSecondaryAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 11),
    .foregroundColor: NSColor.secondaryLabelColor,
    .paragraphStyle: rightAlignedParagraphStyle
]

private let tableHeaderAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 10, weight: .semibold),
    .foregroundColor: NSColor.secondaryLabelColor
]

private let tableHeaderRightAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 10, weight: .semibold),
    .foregroundColor: NSColor.secondaryLabelColor,
    .paragraphStyle: rightAlignedParagraphStyle
]

private let amountAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular),
    .foregroundColor: NSColor.labelColor,
    .paragraphStyle: rightAlignedParagraphStyle
]

private let totalLabelAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 16, weight: .semibold),
    .foregroundColor: NSColor.labelColor
]

private let totalAmountAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedDigitSystemFont(ofSize: 18, weight: .bold),
    .foregroundColor: NSColor.labelColor,
    .paragraphStyle: rightAlignedParagraphStyle
]

private let rightAlignedParagraphStyle: NSParagraphStyle = {
    let style = NSMutableParagraphStyle()
    style.alignment = .right
    return style
}()
