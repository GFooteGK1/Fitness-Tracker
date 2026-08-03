// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "SociusFitAutoMealsCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "SociusFitAutoMealsCore", targets: ["SociusFitAutoMealsCore"]),
    ],
    targets: [
        .target(
            name: "SociusFitAutoMealsCore",
            path: "Shared"
        ),
        .testTarget(
            name: "SociusFitAutoMealsCoreTests",
            dependencies: ["SociusFitAutoMealsCore"],
            path: "Tests"
        ),
    ]
)
