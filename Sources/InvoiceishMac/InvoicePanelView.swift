import AppKit
import InvoiceishCore
import SwiftUI

struct InvoicePanelView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @AppStorage(SettingsKeys.language) private var languageRaw = AppDefaults.language
    @AppStorage(SettingsKeys.senderName) private var senderName = ""
    @AppStorage(SettingsKeys.senderContact) private var senderContact = ""
    @AppStorage(SettingsKeys.senderAddress) private var senderAddress = ""
    @AppStorage(SettingsKeys.defaultCurrency) private var defaultCurrencyRaw = AppDefaults.defaultCurrency
    @AppStorage(SettingsKeys.invoiceNumberPrefix) private var invoiceNumberPrefix = AppDefaults.invoiceNumberPrefix
    @AppStorage(SettingsKeys.nextInvoiceNumber) private var nextInvoiceNumber = AppDefaults.nextInvoiceNumber
    @AppStorage(SettingsKeys.outputFolderPath) private var outputFolderPath = AppDefaults.outputFolderPath

    @State private var recipient = ""
    @State private var selectedCurrencyRaw = AppDefaults.defaultCurrency
    @State private var note = ""
    @State private var items = [DraftLineItem()]
    @State private var didApplyDefaultCurrency = false
    @State private var generationState = GenerationState.idle
    @State private var isGenerating = false

    private var draft: InvoiceDraft {
        InvoiceDraft(
            recipient: recipient,
            currency: InvoiceCurrency(rawValue: selectedCurrencyRaw) ?? .huf,
            items: items.map(\.invoiceItem),
            note: note
        )
    }

    private var settings: InvoiceSettingsSnapshot {
        SettingsSnapshotBuilder.make(
            languageRaw: languageRaw,
            senderName: senderName,
            senderContact: senderContact,
            senderAddress: senderAddress,
            defaultCurrencyRaw: defaultCurrencyRaw,
            invoiceNumberPrefix: invoiceNumberPrefix,
            nextInvoiceNumber: nextInvoiceNumber,
            outputFolderPath: outputFolderPath
        )
    }

    private var validationIssues: [InvoiceValidationIssue] {
        InvoiceValidator.issues(for: draft)
    }

    private var canGenerate: Bool {
        validationIssues.isEmpty && !isGenerating
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            recipientAndCurrency
            itemsSection
            noteSection
            statusSection
            actionBar
        }
        .padding(16)
        .nativePanelBackground()
        .onAppear(perform: applyDefaultCurrencyOnce)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: items)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: generationState)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.text.fill")
                .font(.title2)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("Invoice-ish")
                    .font(.headline)
                Text(InvoiceNumbering.invoiceNumber(prefix: invoiceNumberPrefix, nextNumber: nextInvoiceNumber))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }

    private var recipientAndCurrency: some View {
        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
            GridRow {
                Text("Bill to")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Friend name", text: $recipient)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Bill to")
            }

            GridRow {
                Text("Currency")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Currency", selection: $selectedCurrencyRaw) {
                    ForEach(InvoiceCurrency.allCases) { currency in
                        Text(currency.displayName)
                            .tag(currency.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Currency")
            }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Items")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button {
                    withOptionalAnimation {
                        items.append(DraftLineItem())
                    }
                } label: {
                    Label("Add item", systemImage: "plus.circle")
                }
                .accessibilityLabel("Add item")
            }

            VStack(spacing: 8) {
                ForEach($items) { $item in
                    ItemRowView(item: $item) {
                        remove(itemID: item.id)
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
    }

    private var noteSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Note")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Optional note", text: $note, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Optional note")
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        switch generationState {
        case .idle:
            if let firstIssue = validationIssues.first {
                StatusPill(text: firstIssue.message, tone: .neutral)
                    .transition(.opacity)
            }
        case .success(let url):
            HStack(spacing: 8) {
                StatusPill(text: "Generated and copied", tone: .success)
                    .help(url.path)

                Button {
                    openGeneratedPDF(url)
                } label: {
                    Label("Open", systemImage: "arrow.up.right.square")
                }
                .accessibilityLabel("Open generated PDF")
                .accessibilityHint("Opens the generated PDF in the default PDF viewer.")
            }
            .transition(.opacity)
        case .failure(let message):
            StatusPill(text: message, tone: .error)
                .transition(.opacity)
        }
    }

    private var actionBar: some View {
        HStack {
            settingsControl

            Button {
                NSApp.terminate(nil)
            } label: {
                Label("Quit", systemImage: "power")
            }

            Spacer()

            Button {
                generate()
            } label: {
                if isGenerating {
                    ProgressView()
                        .controlSize(.small)
                    Text("Generating")
                } else {
                    Label("Generate PDF", systemImage: "doc.badge.plus")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canGenerate)
            .accessibilityHint(canGenerate ? "Creates a PDF and copies it to the clipboard." : "Complete required invoice fields before generating.")
        }
    }

    @ViewBuilder
    private var settingsControl: some View {
        if #available(macOS 14.0, *) {
            SettingsLink {
                Label("Settings", systemImage: "gearshape")
            }
        } else {
            Button {
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            } label: {
                Label("Settings", systemImage: "gearshape")
            }
        }
    }

    private func applyDefaultCurrencyOnce() {
        guard !didApplyDefaultCurrency else {
            return
        }

        selectedCurrencyRaw = defaultCurrencyRaw
        didApplyDefaultCurrency = true
    }

    private func remove(itemID: UUID) {
        guard items.count > 1 else {
            items[0] = DraftLineItem()
            return
        }

        withOptionalAnimation {
            items.removeAll { $0.id == itemID }
        }
    }

    private func generate() {
        guard canGenerate else {
            return
        }

        isGenerating = true
        generationState = .idle

        do {
            let outputURL = try InvoiceGenerationService.generate(draft: draft, settings: settings)
            nextInvoiceNumber = max(1, nextInvoiceNumber) + 1
            generationState = .success(outputURL)
        } catch {
            generationState = .failure(error.localizedDescription)
        }

        isGenerating = false
    }

    private func openGeneratedPDF(_ url: URL) {
        NSWorkspace.shared.open(url)
    }

    private func withOptionalAnimation(_ updates: () -> Void) {
        if reduceMotion {
            updates()
        } else {
            withAnimation(.easeOut(duration: 0.16), updates)
        }
    }
}

private struct ItemRowView: View {
    @Binding var item: DraftLineItem
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            TextField("Description", text: $item.description)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Item description")

            TextField("Amount", text: $item.amountText)
                .textFieldStyle(.roundedBorder)
                .frame(width: 94)
                .accessibilityLabel("Item amount")

            Button(role: .destructive, action: onRemove) {
                Image(systemName: "minus.circle")
                    .accessibilityHidden(true)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Remove item")
        }
        .accessibilityElement(children: .contain)
    }
}

private enum GenerationState: Equatable {
    case idle
    case success(URL)
    case failure(String)
}
