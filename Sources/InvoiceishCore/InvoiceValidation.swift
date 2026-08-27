import Foundation

public struct InvoiceValidationIssue: Equatable, Sendable {
    public enum Field: Equatable, Sendable {
        case recipient
        case items
        case itemDescription(UUID)
        case itemAmount(UUID)
    }

    public let field: Field
    public let message: String

    public init(field: Field, message: String) {
        self.field = field
        self.message = message
    }
}

public enum InvoiceValidator {
    public static func issues(for draft: InvoiceDraft) -> [InvoiceValidationIssue] {
        var issues: [InvoiceValidationIssue] = []

        if draft.recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append(InvoiceValidationIssue(field: .recipient, message: "Recipient is required."))
        }

        if draft.items.isEmpty {
            issues.append(InvoiceValidationIssue(field: .items, message: "At least one item is required."))
        }

        for item in draft.items {
            if item.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                issues.append(InvoiceValidationIssue(field: .itemDescription(item.id), message: "Item description is required."))
            }

            if item.amount <= Decimal.zero {
                issues.append(InvoiceValidationIssue(field: .itemAmount(item.id), message: "Amount must be greater than zero."))
            }
        }

        return issues
    }

    public static func isValid(_ draft: InvoiceDraft) -> Bool {
        issues(for: draft).isEmpty
    }
}
