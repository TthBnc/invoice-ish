import AppKit
import InvoiceishCore
import SwiftUI

struct SettingsView: View {
    @AppStorage(SettingsKeys.language) private var languageRaw = AppDefaults.language
    @AppStorage(SettingsKeys.senderName) private var senderName = ""
    @AppStorage(SettingsKeys.senderContact) private var senderContact = ""
    @AppStorage(SettingsKeys.senderAddress) private var senderAddress = ""
    @AppStorage(SettingsKeys.defaultCurrency) private var defaultCurrencyRaw = AppDefaults.defaultCurrency
    @AppStorage(SettingsKeys.invoiceNumberPrefix) private var invoiceNumberPrefix = AppDefaults.invoiceNumberPrefix
    @AppStorage(SettingsKeys.nextInvoiceNumber) private var nextInvoiceNumber = AppDefaults.nextInvoiceNumber
    @AppStorage(SettingsKeys.outputFolderPath) private var outputFolderPath = AppDefaults.outputFolderPath

    var body: some View {
        Form {
            Section("Invoice") {
                Picker("Language", selection: $languageRaw) {
                    ForEach(InvoiceLanguage.allCases) { language in
                        Text(language.displayName)
                            .tag(language.rawValue)
                    }
                }

                Picker("Default currency", selection: $defaultCurrencyRaw) {
                    ForEach(InvoiceCurrency.allCases) { currency in
                        Text(currency.displayName)
                            .tag(currency.rawValue)
                    }
                }

                TextField("Invoice number prefix", text: $invoiceNumberPrefix)
                Stepper("Next invoice number: \(nextInvoiceNumber)", value: $nextInvoiceNumber, in: 1...999_999)
            }

            Section("Your details") {
                TextField("Your name", text: $senderName)
                TextField("Email or phone", text: $senderContact)
                TextField("Address", text: $senderAddress, axis: .vertical)
                    .lineLimit(2...4)
            }

            Section("Output") {
                HStack {
                    TextField("Output folder", text: $outputFolderPath)
                    Button {
                        chooseOutputFolder()
                    } label: {
                        Label("Choose", systemImage: "folder")
                    }
                    .accessibilityLabel("Choose output folder")
                }
            }
        }
        .formStyle(.grouped)
    }

    private func chooseOutputFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        panel.message = "Choose where Invoice-ish saves generated PDFs."

        if panel.runModal() == .OK, let url = panel.url {
            outputFolderPath = url.path
        }
    }
}
