import Foundation

public struct InvoiceItem: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public var description: String
    public var amount: Decimal

    public init(id: UUID = UUID(), description: String, amount: Decimal) {
        self.id = id
        self.description = description
        self.amount = amount
    }
}

public struct InvoiceDraft: Codable, Equatable, Sendable {
    public var recipient: String
    public var currency: InvoiceCurrency
    public var items: [InvoiceItem]
    public var note: String

    public init(
        recipient: String = "",
        currency: InvoiceCurrency = .huf,
        items: [InvoiceItem] = [],
        note: String = ""
    ) {
        self.recipient = recipient
        self.currency = currency
        self.items = items
        self.note = note
    }

    public var total: Decimal {
        items.reduce(Decimal.zero) { partialResult, item in
            partialResult + item.amount
        }
    }
}

public struct SenderDetails: Codable, Equatable, Sendable {
    public var name: String
    public var contact: String
    public var address: String

    public init(name: String = "", contact: String = "", address: String = "") {
        self.name = name
        self.contact = contact
        self.address = address
    }
}

public struct InvoiceSettingsSnapshot: Codable, Equatable, Sendable {
    public var language: InvoiceLanguage
    public var sender: SenderDetails
    public var defaultCurrency: InvoiceCurrency
    public var invoiceNumberPrefix: String
    public var nextInvoiceNumber: Int
    public var outputFolderPath: String

    public init(
        language: InvoiceLanguage = .english,
        sender: SenderDetails = SenderDetails(),
        defaultCurrency: InvoiceCurrency = .huf,
        invoiceNumberPrefix: String = "ISH",
        nextInvoiceNumber: Int = 1,
        outputFolderPath: String = InvoiceSettingsSnapshot.defaultOutputFolderPath()
    ) {
        self.language = language
        self.sender = sender
        self.defaultCurrency = defaultCurrency
        self.invoiceNumberPrefix = invoiceNumberPrefix
        self.nextInvoiceNumber = nextInvoiceNumber
        self.outputFolderPath = outputFolderPath
    }

    public static func defaultOutputFolderPath(
        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
    ) -> String {
        homeDirectory
            .appendingPathComponent("Documents", isDirectory: true)
            .appendingPathComponent("Invoice-ish", isDirectory: true)
            .path
    }
}
