import Foundation
import InvoiceishCore

struct DraftLineItem: Identifiable, Equatable {
    let id: UUID
    var description: String
    var amountText: String

    init(id: UUID = UUID(), description: String = "", amountText: String = "") {
        self.id = id
        self.description = description
        self.amountText = amountText
    }

    var amount: Decimal {
        DecimalParser.parse(amountText) ?? Decimal.zero
    }

    var invoiceItem: InvoiceItem {
        InvoiceItem(id: id, description: description, amount: amount)
    }

    var isBlank: Bool {
        description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            amountText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum DecimalParser {
    static func parse(_ text: String) -> Decimal? {
        let normalized = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: ".")

        guard !normalized.isEmpty else {
            return nil
        }

        return Decimal(string: normalized, locale: Locale(identifier: "en_US_POSIX"))
    }
}
