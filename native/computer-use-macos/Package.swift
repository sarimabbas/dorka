// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "DorkaComputerUseMacOS",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "DorkaComputerUseMacOSCore",
            targets: ["DorkaComputerUseMacOSCore"]
        ),
        .executable(
            name: "dorka-computer-use-macos",
            targets: ["DorkaComputerUseMacOS"]
        )
    ],
    targets: [
        .target(
            name: "DorkaComputerUseMacOSCore",
            path: "Sources/DorkaComputerUseMacOSCore"
        ),
        .executableTarget(
            name: "DorkaComputerUseMacOS",
            dependencies: ["DorkaComputerUseMacOSCore"],
            path: "Sources/DorkaComputerUseMacOS"
        ),
        .testTarget(
            name: "DorkaComputerUseMacOSTests",
            dependencies: ["DorkaComputerUseMacOSCore"],
            path: "Tests/DorkaComputerUseMacOSTests"
        )
    ]
)
