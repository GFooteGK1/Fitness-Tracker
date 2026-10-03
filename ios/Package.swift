// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "SociusFitAutoMealsCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "SociusFitAutoMealsCore", targets: ["SociusFitAutoMealsCore"]),
        .executable(name: "LocalFoodEval", targets: ["LocalFoodEval"]),
    ],
    targets: [
        .target(
            name: "SociusFitAutoMealsCore",
            path: "Shared"
        ),
        .executableTarget(name: "LocalFoodEval", dependencies: ["SociusFitAutoMealsCore"], path: "Evaluation"),
        .testTarget(
            name: "SociusFitAutoMealsCoreTests",
            dependencies: ["SociusFitAutoMealsCore"],
            path: "Tests"
        ),
    ]
)
