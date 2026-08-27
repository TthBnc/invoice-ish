import Foundation

public enum InvoiceLanguage: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
    case english
    case hungarian

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .english:
            return "English"
        case .hungarian:
            return "Hungarian"
        }
    }

    public var labels: InvoiceLabels {
        switch self {
        case .english:
            return InvoiceLabels(
                invoice: "Invoice",
                billTo: "Bill to",
                date: "Date",
                dueDate: "Due date",
                description: "Description",
                amount: "Amount",
                total: "Total",
                note: "Note"
            )
        case .hungarian:
            return InvoiceLabels(
                invoice: "Számla",
                billTo: "Címzett",
                date: "Dátum",
                dueDate: "Fizetési határidő",
                description: "Megnevezés",
                amount: "Összeg",
                total: "Végösszeg",
                note: "Megjegyzés"
            )
        }
    }
}

public struct InvoiceLabels: Equatable, Sendable {
    public let invoice: String
    public let billTo: String
    public let date: String
    public let dueDate: String
    public let description: String
    public let amount: String
    public let total: String
    public let note: String
}
