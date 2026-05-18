# Implementation Plan

## Current Scope

This repo is intentionally not scaffolded yet. The first implementation pass should build only the MVP described in `PRD.md`.

## Technical Direction

- Build a native macOS SwiftUI app using `MenuBarExtra` with `.menuBarExtraStyle(.window)` for the compact invoice panel.
- Set the app up as a menu-bar-only utility with `LSUIElement = true`, so launch does not show a Dock window.
- Use a SwiftUI `Settings` scene for preferences, opened from the panel and from the standard macOS Settings command.
- Keep invoice draft state separate from persisted settings. Draft row edits should be local UI state; sender details, language, output folder, prefix, next invoice number, and default currency should persist via `UserDefaults` or `AppStorage`.
- Use stable IDs for invoice item rows, not array indices, so row insertion and removal animate predictably.
- Use availability-gated Liquid Glass APIs where supported. Older macOS versions should use native SwiftUI materials, standard controls, system typography, and normal vibrancy/material styling.
- Prefer native SwiftUI controls and `Button` interactions. Use AppKit interop only where needed for pasteboard behavior, PDF generation details, or file/folder selection.
- Generate PDF output through Core Graphics or PDFKit, with a deterministic layout that is easy to snapshot-check.
- Copy both the file URL and PDF data to `NSPasteboard` after a successful write, then increment the invoice number only after the file and pasteboard operations succeed.

## Implementation Slices

1. Project scaffold and app lifecycle
2. Settings persistence and defaults
3. Invoice draft model, validation, and currency formatting
4. Menu bar panel UI
5. Settings window UI
6. PDF renderer and output-folder handling
7. Pasteboard integration
8. Accessibility, reduced-motion, contrast, and dark-mode pass
9. Focused tests for formatting, validation, settings persistence, invoice numbering, and PDF creation

## Notes From SwiftUI Review

- Use `MenuBarExtra` for persistent menu bar access and `Settings` for preferences.
- Gate Liquid Glass APIs with `#available` and provide native material fallbacks.
- Keep animation scopes narrow and always use `.animation(_:value:)` or explicit `withAnimation`.
- Use system text styles and accessibility modifiers such as `.accessibilityLabel`, `.accessibilityValue`, and `.accessibilityElement(children:)`.
- Avoid custom tap gestures for controls that can be modeled as `Button`.
