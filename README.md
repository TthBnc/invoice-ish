# Invoice-ish

Invoice-ish is a playful macOS menu bar app for quickly generating simple friend invoices.

The project is currently in PRD and implementation-planning phase.

- [Product Requirements](PRD.md)
- [Implementation Plan](IMPLEMENTATION_PLAN.md)

## Development

The current implementation is a Swift package with:

- `InvoiceishCore`: invoice models, validation, numbering, localization labels, and currency formatting.
- `Invoiceish`: a macOS SwiftUI menu bar executable using `MenuBarExtra`.

Build:

```bash
swift build
```

Create a local `.app` bundle:

```bash
./scripts/build-app-bundle.sh
```

The bundle is written to `.build/release/Invoice-ish.app` and includes `LSUIElement`, so it behaves as a menu-bar utility instead of a normal Dock app.

Tests are included under `Tests/InvoiceishCoreTests`. Running them requires a full Xcode installation/selection because this machine's active Command Line Tools setup does not expose XCTest correctly.
