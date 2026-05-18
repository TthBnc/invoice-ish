# MVP PRD: Invoice-ish

## Product

Invoice-ish is a playful macOS menu bar app for quickly generating simple friend invoices. It is intentionally lightweight: open from the menu bar, add a recipient, add a few items with amounts, choose currency, generate a polished PDF, and paste/send it immediately.

## Goal

Make it possible to create a funny invoice in under 30 seconds.

## Target User

One person using their own Mac, mostly for jokes with friends. No accounting, no tax compliance, no business workflows.

## Core Flow

1. User clicks the Invoice-ish menu bar icon.
2. A compact panel opens.
3. User enters who the invoice is for.
4. User adds one or more line items, each with a description and amount.
5. User selects currency: `Ft`, `$`, or `€`.
6. User optionally adds a short note.
7. User clicks `Generate`.
8. App creates a PDF in `~/Documents/Invoice-ish/`.
9. App copies the generated PDF to the clipboard.
10. User can paste it into Messages, Mail, Slack, etc.

## MVP Features

## Menu Bar Panel

- Always accessible from macOS menu bar.
- Fields:
  - `Bill to`
  - Currency selector: `Ft`, `$`, `€`
  - Item rows: description + amount
  - Add item button
  - Remove item button per row
  - Optional note
- Actions:
  - `Generate PDF`
  - `Settings`
  - `Quit`

## PDF Output

- One-page invoice-style PDF.
- Header: `Invoice-ish`
- Invoice number, e.g. `ISH-0001`
- Date generated
- Sender details from settings
- Recipient name
- Table of items
- Total amount
- Optional note
- Large, subtle `Invoice-ish` watermark in the background.
- Language-sensitive labels:
  - English: `Invoice`, `Bill to`, `Date`, `Description`, `Amount`, `Total`
  - Hungarian: `Számla`, `Címzett`, `Dátum`, `Megnevezés`, `Összeg`, `Végösszeg`

## Settings Window

- Opens as a normal macOS window.
- Settings:
  - Invoice language: `English` / `Hungarian`
  - Your name
  - Email or phone
  - Address, optional
  - Default currency
  - Invoice number prefix, default `ISH`
  - Next invoice number
  - Output folder, default `~/Documents/Invoice-ish/`
- Settings persist between launches.

## Currency Formatting

- HUF: `1 500 Ft`
- USD: `$15.00`
- EUR: `€15.00`
- MVP can keep currency conversion out of scope. User manually enters the amount.

## Clipboard Behavior

- After generation, app writes the PDF file URL to the macOS pasteboard.
- Also attempts to write PDF data where supported, so pasting into apps works as naturally as possible.
- Show a success state: `Generated and copied`.

## Validation

- Recipient is required.
- At least one item is required.
- Item description is required.
- Amount must be greater than zero.
- Generate button is disabled until valid.

## Non-Goals For MVP

- No real tax invoice support.
- No VAT/tax calculations.
- No customer database.
- No payment links.
- No recurring invoices.
- No iCloud sync.
- No app store polish required yet.
- No currency conversion.

## Design And Platform Requirements

- Invoice-ish should feel like a native modern macOS utility, not a web app wrapped in a shell.
- Primary design target: native **Liquid Glass** visual style where available.
- Use native macOS materials, translucency, depth, rounded surfaces, and system controls where supported.
- Provide a compatibility fallback for older macOS versions where Liquid Glass APIs/materials are unavailable.
- Fallback should still feel native: clean SwiftUI layout, standard macOS vibrancy/materials, system typography, and normal macOS control styling.
- Use native SwiftUI/AppKit animations for panel transitions, row insertion/removal, settings window appearance, validation states, and generation success feedback.
- Animations should be quick, subtle, and functional. Avoid custom flashy effects that make the app feel non-native.
- Respect macOS accessibility settings:
  - Reduce Motion
  - Increase Contrast
  - Differentiate Without Color
  - VoiceOver labels for controls
- The app should adapt visually to Light Mode and Dark Mode.
- The menu bar panel should feel compact, polished, and system-integrated, with no custom heavy theming.

## Technical Stack

- SwiftUI macOS app
- `MenuBarExtra` for menu bar presence
- Native SwiftUI/AppKit materials for Liquid Glass-style UI where supported
- Runtime or availability checks for older macOS fallback styling
- SwiftUI animation APIs for native transitions and feedback
- SwiftUI settings window
- `UserDefaults` or `AppStorage` for preferences
- `PDFKit` or Core Graphics for PDF creation
- `NSPasteboard` for clipboard copy
- `FileManager` for saving into Documents

## Acceptance Criteria

- App launches into menu bar without showing a dock window.
- Clicking the icon opens the invoice panel.
- User can create, edit, and remove item rows.
- User can select `Ft`, `$`, or `€`.
- User can open settings and save sender/language preferences.
- Clicking generate creates a valid PDF in Documents.
- The generated PDF includes the `Invoice-ish` watermark.
- The generated PDF is copied to clipboard.
- Invoice number increments after each successful generation.
- App works offline.
