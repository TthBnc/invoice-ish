// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "Invoiceish",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "InvoiceishCore",
            targets: ["InvoiceishCore"]
        ),
        .executable(
            name: "Invoiceish",
            targets: ["InvoiceishMac"]
        )
    ],
    targets: [
        .target(
            name: "InvoiceishCore"
        ),
        .executableTarget(
            name: "InvoiceishMac",
            dependencies: ["InvoiceishCore"]
        ),
        .testTarget(
            name: "InvoiceishCoreTests",
            dependencies: ["InvoiceishCore"]
        )
    ]
)
