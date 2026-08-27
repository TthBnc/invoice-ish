import Foundation

public enum InvoiceCurrency: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
    case huf = "Ft"
    case usd = "$"
    case eur = "€"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .huf:
            return "Ft"
        case .usd:
            return "$"
        case .eur:
            return "€"
        }
    }
}

public enum CurrencyFormatting {
    public static func string(for amount: Decimal, currency: InvoiceCurrency) -> String {
        switch currency {
        case .huf:
            return "\(groupedWholeNumber(amount)) Ft"
        case .usd:
            return "$\(fixedTwoDecimals(amount))"
        case .eur:
            return "€\(fixedTwoDecimals(amount))"
        }
    }

    private static func groupedWholeNumber(_ amount: Decimal) -> String {
        let rounded = NSDecimalNumber(decimal: amount).rounding(
            accordingToBehavior: NSDecimalNumberHandler(
                roundingMode: .plain,
                scale: 0,
                raiseOnExactness: false,
                raiseOnOverflow: false,
                raiseOnUnderflow: false,
                raiseOnDivideByZero: false
            )
        )

        let digits = rounded.stringValue
        var grouped = ""
        for (offset, character) in digits.reversed().enumerated() {
            if offset > 0 && offset % 3 == 0 {
                grouped.append(" ")
            }
            grouped.append(character)
        }
        return String(grouped.reversed())
    }

    private static func fixedTwoDecimals(_ amount: Decimal) -> String {
        let number = NSDecimalNumber(decimal: amount).rounding(
            accordingToBehavior: NSDecimalNumberHandler(
                roundingMode: .plain,
                scale: 2,
                raiseOnExactness: false,
                raiseOnOverflow: false,
                raiseOnUnderflow: false,
                raiseOnDivideByZero: false
            )
        )

        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.decimalSeparator = "."
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: number) ?? number.stringValue
    }
}
