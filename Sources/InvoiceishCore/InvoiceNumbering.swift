import Foundation

public enum InvoiceNumbering {
    public static func invoiceNumber(prefix: String, nextNumber: Int) -> String {
        let normalizedPrefix = normalized(prefix: prefix)
        let clampedNumber = max(1, nextNumber)
        return "\(normalizedPrefix)-\(String(format: "%04d", clampedNumber))"
    }

    public static func normalized(prefix: String) -> String {
        let trimmed = prefix.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "ISH" : trimmed.uppercased()
    }
}
