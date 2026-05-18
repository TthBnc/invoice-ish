import Foundation
import InvoiceishCore

enum InvoiceGenerationService {
    static func generate(
        draft: InvoiceDraft,
        settings: InvoiceSettingsSnapshot,
        date: Date = Date()
    ) throws -> URL {
        let issues = InvoiceValidator.issues(for: draft)
        guard issues.isEmpty else {
            throw InvoiceGenerationError.invalidInvoice(issues.first?.message ?? "Invoice is incomplete.")
        }

        let invoiceNumber = InvoiceNumbering.invoiceNumber(
            prefix: settings.invoiceNumberPrefix,
            nextNumber: settings.nextInvoiceNumber
        )
        let outputFolder = URL(fileURLWithPath: settings.outputFolderPath, isDirectory: true)
        try FileManager.default.createDirectory(at: outputFolder, withIntermediateDirectories: true)

        let outputURL = outputFolder.appendingPathComponent("\(invoiceNumber).pdf")
        try InvoicePDFRenderer.render(
            draft: draft,
            settings: settings,
            invoiceNumber: invoiceNumber,
            date: date,
            outputURL: outputURL
        )
        try PasteboardWriter.copyPDF(at: outputURL)

        return outputURL
    }
}

enum InvoiceGenerationError: LocalizedError {
    case invalidInvoice(String)

    var errorDescription: String? {
        switch self {
        case .invalidInvoice(let message):
            return message
        }
    }
}
