import Foundation
import InvoiceishCore

enum SettingsKeys {
    static let language = "settings.language"
    static let senderName = "settings.senderName"
    static let senderContact = "settings.senderContact"
    static let senderAddress = "settings.senderAddress"
    static let defaultCurrency = "settings.defaultCurrency"
    static let invoiceNumberPrefix = "settings.invoiceNumberPrefix"
    static let nextInvoiceNumber = "settings.nextInvoiceNumber"
    static let outputFolderPath = "settings.outputFolderPath"
}

enum AppDefaults {
    static let language = InvoiceLanguage.english.rawValue
    static let defaultCurrency = InvoiceCurrency.huf.rawValue
    static let invoiceNumberPrefix = "ISH"
    static let nextInvoiceNumber = 1
    static let outputFolderPath = InvoiceSettingsSnapshot.defaultOutputFolderPath()
}

enum SettingsSnapshotBuilder {
    static func make(
        languageRaw: String,
        senderName: String,
        senderContact: String,
        senderAddress: String,
        defaultCurrencyRaw: String,
        invoiceNumberPrefix: String,
        nextInvoiceNumber: Int,
        outputFolderPath: String
    ) -> InvoiceSettingsSnapshot {
        InvoiceSettingsSnapshot(
            language: InvoiceLanguage(rawValue: languageRaw) ?? .english,
            sender: SenderDetails(
                name: senderName,
                contact: senderContact,
                address: senderAddress
            ),
            defaultCurrency: InvoiceCurrency(rawValue: defaultCurrencyRaw) ?? .huf,
            invoiceNumberPrefix: invoiceNumberPrefix,
            nextInvoiceNumber: nextInvoiceNumber,
            outputFolderPath: outputFolderPath.isEmpty ? AppDefaults.outputFolderPath : outputFolderPath
        )
    }
}
