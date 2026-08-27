import XCTest
@testable import InvoiceishCore

final class InvoiceishCoreTests: XCTestCase {
    func testCurrencyFormatting() {
        XCTAssertEqual(CurrencyFormatting.string(for: Decimal(1500), currency: .huf), "1 500 Ft")
        XCTAssertEqual(CurrencyFormatting.string(for: Decimal(15), currency: .usd), "$15.00")
        XCTAssertEqual(CurrencyFormatting.string(for: Decimal(15), currency: .eur), "€15.00")
    }

    func testInvoiceNumbering() {
        XCTAssertEqual(InvoiceNumbering.invoiceNumber(prefix: "ish", nextNumber: 1), "ISH-0001")
        XCTAssertEqual(InvoiceNumbering.invoiceNumber(prefix: " LOL ", nextNumber: 42), "LOL-0042")
        XCTAssertEqual(InvoiceNumbering.invoiceNumber(prefix: "", nextNumber: 0), "ISH-0001")
    }

    func testValidationRejectsEmptyDraft() {
        let issues = InvoiceValidator.issues(for: InvoiceDraft())

        XCTAssertTrue(issues.contains { $0.field == .recipient })
        XCTAssertTrue(issues.contains { $0.field == .items })
    }

    func testValidationRejectsInvalidItemRows() {
        let itemID = UUID()
        let draft = InvoiceDraft(
            recipient: "Bence",
            items: [
                InvoiceItem(id: itemID, description: " ", amount: Decimal.zero)
            ]
        )

        let issues = InvoiceValidator.issues(for: draft)

        XCTAssertTrue(issues.contains { $0.field == .itemDescription(itemID) })
        XCTAssertTrue(issues.contains { $0.field == .itemAmount(itemID) })
    }

    func testValidationAcceptsCompleteDraft() {
        let draft = InvoiceDraft(
            recipient: "Friend",
            currency: .usd,
            items: [
                InvoiceItem(description: "Being late", amount: Decimal(15))
            ],
            note: "Pay in snacks."
        )

        XCTAssertTrue(InvoiceValidator.isValid(draft))
    }

    func testHungarianLabels() {
        let labels = InvoiceLanguage.hungarian.labels

        XCTAssertEqual(labels.invoice, "Számla")
        XCTAssertEqual(labels.billTo, "Címzett")
        XCTAssertEqual(labels.dueDate, "Fizetési határidő")
        XCTAssertEqual(labels.total, "Végösszeg")
    }
}
