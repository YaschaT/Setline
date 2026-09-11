// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SetlineCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "SetlineCore", targets: ["SetlineCore"]),
    ],
    targets: [
        .target(name: "SetlineCore"),
        .testTarget(
            name: "SetlineCoreTests",
            dependencies: ["SetlineCore"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
