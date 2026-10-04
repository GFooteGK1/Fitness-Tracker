import Foundation
import CryptoKit
import ImageIO
import SociusFitAutoMealsCore

private struct EvalCase: Decodable {
    let id: String
    let file: String
    let sha256: String
    let isScreenshot: Bool
}
private struct Manifest: Decodable {
    let schemaVersion: Int
    let cases: [EvalCase]
}
private struct CaseResult: Encodable {
    let id: String
    let sha256: String
    let result: FoodScreeningResult
    var scene: LocalSceneEvidence? = nil
}
private struct Report: Encodable {
    let schemaVersion = 1
    let completed: Bool
    let manifestSHA256: String
    let policyVersion: String
    let requestRevision: Int
    let operatingSystem: String
    let generatedAt: String
    let preprocessing = "ImageIO oriented thumbnail, maximum 512 pixels"
    let cases: [CaseResult]
    var sceneGuardVersion: String? = nil
    var sceneRevisions: [String: Int]? = nil
    var sceneMinimumConfidence: Float? = nil
    var sceneMinimumPosePoints: Int? = nil
    var sceneMaximumHandCount: Int? = nil
}
private enum EvalError: Error { case invalidArguments, invalidManifest, invalidImage, unavailableOS }
private func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

@main
private enum LocalFoodEval {
    static func main() async {
        do {
            guard CommandLine.arguments.count == 4 ||
                  (CommandLine.arguments.count == 5 && CommandLine.arguments[4] == "scene") else { throw EvalError.invalidArguments }
            if #available(macOS 14.0, *) { try await run() }
            else { throw EvalError.unavailableOS }
        } catch {
            FileHandle.standardError.write(Data("LocalFoodEval failed: \(error). Usage: LocalFoodEval MANIFEST IMAGE_DIRECTORY NEW_REPORT [scene]\n".utf8))
            exit(1)
        }
    }

    @available(macOS 14.0, *)
    private static func run() async throws {
        let args = CommandLine.arguments
        let sceneMode = args.count == 5
        let manifestURL = URL(fileURLWithPath: args[1])
        let root = URL(fileURLWithPath: args[2]).resolvingSymlinksInPath().standardizedFileURL
        let output = URL(fileURLWithPath: args[3])
        let partial = URL(fileURLWithPath: args[3] + ".partial.json")
        guard !FileManager.default.fileExists(atPath: output.path),
              !FileManager.default.fileExists(atPath: partial.path) else { throw EvalError.invalidArguments }
        let manifestData = try boundedRead(manifestURL, limit: 1_048_576)
        let manifest = try JSONDecoder().decode(Manifest.self, from: manifestData)
        guard manifest.schemaVersion == 1, !manifest.cases.isEmpty, manifest.cases.count <= 1_000,
              Set(manifest.cases.map(\.id)).count == manifest.cases.count else { throw EvalError.invalidManifest }
        // Validate every file before any inference. Expected answers are never passed to Vision.
        for item in manifest.cases { _ = try imageData(item, root: root) }
        var results: [CaseResult] = []
        func encodedReport(completed: Bool) throws -> Data {
            var report = Report(completed: completed, manifestSHA256: digest(manifestData),
                policyVersion: sceneMode ? LocalScenePolicy.guardVersion : LocalFoodScreeningPolicy.version,
                requestRevision: sceneMode ? 0 : Int(LocalFoodVisionClassifier.requestRevision),
                operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
                generatedAt: ISO8601DateFormatter().string(from: Date()), cases: results)
            if sceneMode {
                report.sceneGuardVersion = LocalScenePolicy.guardVersion; report.sceneRevisions = LocalSceneGuard.revisions
                report.sceneMinimumConfidence = LocalScenePolicy.minimumConfidence
                report.sceneMinimumPosePoints = LocalScenePolicy.minimumPosePoints
                report.sceneMaximumHandCount = LocalScenePolicy.maximumHandCount
            }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            return try encoder.encode(report)
        }
        // Create a new checkpoint first; only this invocation's checkpoint is replaced later.
        try encodedReport(completed: false).write(to: partial, options: .withoutOverwriting)
        for item in manifest.cases {
            let data = try imageData(item, root: root)
            let result: FoodScreeningResult
            var scene: LocalSceneEvidence? = nil
            let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 512, kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCache: false]
            if let source = CGImageSourceCreateWithData(data as CFData, nil),
               let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) {
                if sceneMode {
                    scene = await LocalSceneGuard.inspect(LocalScreeningImage(cgImage: image, orientation: .up))
                    result = FoodScreeningResult(outcome: scene?.completed == true ? .uncertain : .error,
                        reason: scene?.reason ?? "scene_evidence_unavailable", durationMilliseconds: scene?.durationMilliseconds ?? 0)
                } else {
                    result = await LocalFoodVisionClassifier.classify(
                        LocalScreeningImage(cgImage: image, orientation: .up), isScreenshot: item.isScreenshot)
                }
            } else {
                result = FoodScreeningResult(outcome: .error, reason: "fixture_decode_failed")
            }
            results.append(CaseResult(id: item.id, sha256: item.sha256, result: result, scene: scene))
            try encodedReport(completed: false).write(to: partial, options: .atomic)
            print("\(item.id): \(result.outcome.rawValue) (\(result.reason))")
            if sceneMode && scene?.completed != true { throw EvalError.invalidImage }
        }
        // Exclusive creation preserves previous evidence even if another runner chooses the same path.
        try encodedReport(completed: true).write(to: output, options: .withoutOverwriting)
    }

    private static func boundedRead(_ url: URL, limit: Int) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        let data = try handle.read(upToCount: limit + 1) ?? Data()
        guard data.count <= limit else { throw EvalError.invalidImage }
        return data
    }

    private static func imageData(_ item: EvalCase, root: URL) throws -> Data {
        guard !item.id.isEmpty, item.id.utf8.count <= 128, !item.file.hasPrefix("/"),
              !item.file.contains("\\"), !item.file.split(separator: "/").contains(".."),
              item.sha256.count == 64, item.sha256.allSatisfy({ $0.isHexDigit }) else { throw EvalError.invalidManifest }
        let url = root.appendingPathComponent(item.file).resolvingSymlinksInPath().standardizedFileURL
        guard url.path.hasPrefix(root.path + "/") else { throw EvalError.invalidManifest }
        let data = try boundedRead(url, limit: 10_485_760)
        guard digest(data) == item.sha256 else { throw EvalError.invalidImage }
        return data
    }
}
