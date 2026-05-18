import AppKit
import Foundation

enum PasteboardWriter {
    static func copyPDF(at url: URL) throws {
        let data = try Data(contentsOf: url)

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.writeObjects([url as NSURL])
        pasteboard.setData(data, forType: .pdf)
        pasteboard.setString(url.absoluteString, forType: .fileURL)
    }
}
