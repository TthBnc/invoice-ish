import AppKit
import SwiftUI

@MainActor
final class MenuBarController: NSObject, NSPopoverDelegate {
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private let quitMenu = NSMenu()

    override init() {
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        self.popover = NSPopover()
        super.init()

        configureStatusItem()
        configurePopover()
        configureQuitMenu()
    }

    private func configureStatusItem() {
        guard let button = statusItem.button else {
            return
        }

        button.target = self
        button.action = #selector(statusItemClicked(_:))
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        button.toolTip = "Invoice-ish"
        button.image = NSImage(
            systemSymbolName: "doc.text.fill",
            accessibilityDescription: "Invoice-ish"
        )
        button.imagePosition = .imageOnly
        button.setAccessibilityLabel("Invoice-ish")
    }

    private func configurePopover() {
        popover.behavior = .transient
        popover.animates = true
        popover.delegate = self

        let panel = InvoicePanelView()
            .frame(width: 430)
        let host = NSHostingController(rootView: panel)
        host.view.frame = NSRect(origin: .zero, size: NSSize(width: 430, height: 440))

        popover.contentViewController = host
        popover.contentSize = NSSize(width: 430, height: 440)
    }

    private func configureQuitMenu() {
        let quitItem = NSMenuItem(
            title: "Quit Invoice-ish",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        quitItem.target = NSApp
        quitMenu.addItem(quitItem)
    }

    @objc private func statusItemClicked(_ sender: Any?) {
        if let event = NSApp.currentEvent,
           event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
            showQuitMenu()
            return
        }

        togglePopover()
    }

    private func showQuitMenu() {
        guard let button = statusItem.button else {
            return
        }

        quitMenu.popUp(
            positioning: quitMenu.items.first,
            at: NSPoint(x: 0, y: button.bounds.height + 3),
            in: button
        )
    }

    private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else {
            showPopover()
        }
    }

    private func showPopover() {
        guard let button = statusItem.button else {
            return
        }

        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        activatePopoverWindow()
        button.highlight(true)
    }

    nonisolated func popoverDidShow(_ notification: Notification) {
        Task { @MainActor [weak self] in
            self?.activatePopoverWindow()
        }
    }

    nonisolated func popoverDidClose(_ notification: Notification) {
        Task { @MainActor [weak self] in
            self?.statusItem.button?.highlight(false)
        }
    }

    private func activatePopoverWindow() {
        NSApp.activate(ignoringOtherApps: true)

        guard let window = popover.contentViewController?.view.window else {
            return
        }

        window.makeKey()
        window.invalidateShadow()
    }
}
