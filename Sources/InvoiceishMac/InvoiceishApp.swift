import AppKit
import SwiftUI

@main
struct InvoiceishApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        MenuBarExtra("Invoice-ish", systemImage: "doc.text.fill") {
            InvoicePanelView()
                .frame(width: 430)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .frame(width: 470)
                .scenePadding()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }
}
