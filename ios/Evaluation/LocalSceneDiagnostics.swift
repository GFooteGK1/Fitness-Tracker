import Foundation
import ImageIO
import Vision
import CoreML
import SociusFitAutoMealsCore

struct ScenePointDiagnostic: Encodable, Sendable {
    let confidence: Float
    let x: Double
    let y: Double
}
struct SceneObservationDiagnostic: Encodable, Sendable {
    let confidence: Float
    let rectangle: [Double]?
    let pointCount: Int
    let acceptedPointCount: Int
    let pointsTruncated: Bool
    let points: [ScenePointDiagnostic]
    let accepted: Bool
}
struct SceneStageDiagnostic: Encodable, Sendable {
    let stage: String
    let resultsAvailable: Bool
    let rawCount: Int
    let acceptedCount: Int
    let observationsTruncated: Bool
    let observations: [SceneObservationDiagnostic]
}
struct SceneProfileDiagnostic: Encodable, Sendable {
    let profile: String
    let maximumPixels: Int
    let humanUpperBodyOnly: Bool
    var width = 0
    var height = 0
    let orientation = "up after ImageIO transform"
    var completed = false
    var reason = "not_started"
    var durationMilliseconds = 0
    var stages: [SceneStageDiagnostic] = []
    var errorDomain: String? = nil
    var errorCode: Int? = nil
}
private enum SceneDiagnosticError: Error { case invalidObservation, decode, cpuUnavailable }

/// Executable-only diagnostic evidence; never a food-routing or upload decision.
@available(macOS 14.0, *)
enum LocalSceneDiagnostics {
    static let version = "vision-geometry-diagnostics-v1"
    static let maximumObservations = 64
    static let maximumPoints = 32
    static let profiles = [("full-body-512", 512, false), ("full-body-1024", 1024, false), ("upper-body-512", 512, true)]

    static func inspect(_ data: Data) async -> [SceneProfileDiagnostic] {
        var results: [SceneProfileDiagnostic] = []
        for (name, maximum, upper) in profiles {
            let result = await inspectProfile(data, name: name, maximum: maximum, upper: upper)
            results.append(result)
            if !result.completed { break }
        }
        return results
    }

    private static func observation(_ confidence: Float, rectangle: CGRect? = nil,
                                    points: [VNRecognizedPoint]? = nil) throws -> SceneObservationDiagnostic {
        guard confidence.isFinite, (0...1).contains(confidence) else { throw SceneDiagnosticError.invalidObservation }
        let rectangleValues = rectangle.map { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
        guard rectangleValues?.allSatisfy({ $0.isFinite }) != false else { throw SceneDiagnosticError.invalidObservation }
        let values = try (points ?? []).map { point -> ScenePointDiagnostic in
            guard point.confidence.isFinite, (0...1).contains(point.confidence), point.location.x.isFinite,
                  point.location.y.isFinite else { throw SceneDiagnosticError.invalidObservation }
            return ScenePointDiagnostic(confidence: point.confidence, x: Double(point.location.x), y: Double(point.location.y))
        }.sorted { a, b in
            if a.confidence != b.confidence { return a.confidence > b.confidence }
            if a.x != b.x { return a.x < b.x }; return a.y < b.y
        }
        let acceptedPoints = values.filter { $0.confidence >= LocalScenePolicy.minimumConfidence }.count
        return SceneObservationDiagnostic(confidence: confidence, rectangle: rectangleValues, pointCount: values.count,
            acceptedPointCount: acceptedPoints, pointsTruncated: values.count > maximumPoints,
            points: Array(values.prefix(maximumPoints)), accepted: points == nil
                ? confidence >= LocalScenePolicy.minimumConfidence : acceptedPoints >= LocalScenePolicy.minimumPosePoints)
    }

    private static func stage(_ name: String, available: Bool, observations: [SceneObservationDiagnostic]) -> SceneStageDiagnostic {
        SceneStageDiagnostic(stage: name, resultsAvailable: available, rawCount: observations.count,
            acceptedCount: observations.filter(\.accepted).count,
            observationsTruncated: observations.count > maximumObservations,
            observations: Array(observations.prefix(maximumObservations)))
    }

    private static func inspectProfile(_ data: Data, name: String, maximum: Int, upper: Bool) async -> SceneProfileDiagnostic {
        let started = ContinuousClock.now
        var result: SceneProfileDiagnostic = await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                var report = SceneProfileDiagnostic(profile: name, maximumPixels: maximum, humanUpperBodyOnly: upper)
                let face = VNDetectFaceRectanglesRequest(); face.revision = VNDetectFaceRectanglesRequestRevision3
                let human = VNDetectHumanRectanglesRequest(); human.revision = VNDetectHumanRectanglesRequestRevision2
                human.upperBodyOnly = upper
                let body = VNDetectHumanBodyPoseRequest(); body.revision = VNDetectHumanBodyPoseRequestRevision1
                let hand = VNDetectHumanHandPoseRequest(); hand.revision = VNDetectHumanHandPoseRequestRevision1
                hand.maximumHandCount = LocalScenePolicy.maximumHandCount
                let requests: [VNRequest] = [face, human, body, hand]
                let deadline = DispatchWorkItem { requests.forEach { $0.cancel() } }
                DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: deadline)
                defer { deadline.cancel() }
                do {
                    let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: maximum, kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceShouldCache: false]
                    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                          let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                        throw SceneDiagnosticError.decode
                    }
                    report.width = image.width; report.height = image.height
                    for request in requests {
                        request.preferBackgroundProcessing = true
                        let devicesByStage = try request.supportedComputeStageDevices
                        guard !devicesByStage.isEmpty else { throw SceneDiagnosticError.cpuUnavailable }
                        for (computeStage, devices) in devicesByStage {
                            guard let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) else {
                                throw SceneDiagnosticError.cpuUnavailable
                            }
                            request.setComputeDevice(cpu, for: computeStage)
                        }
                    }
                    try VNImageRequestHandler(cgImage: image, orientation: .up).perform(requests)
                    report.stages.append(stage("face", available: face.results != nil,
                        observations: try (face.results ?? []).map { try observation($0.confidence, rectangle: $0.boundingBox) }))
                    report.stages.append(stage("humanRectangle", available: human.results != nil,
                        observations: try (human.results ?? []).map { try observation($0.confidence, rectangle: $0.boundingBox) }))
                    report.stages.append(stage("bodyPose", available: body.results != nil,
                        observations: try (body.results ?? []).map { try observation($0.confidence, points: Array($0.recognizedPoints(.all).values)) }))
                    report.stages.append(stage("handPose", available: hand.results != nil,
                        observations: try (hand.results ?? []).map { try observation($0.confidence, points: Array($0.recognizedPoints(.all).values)) }))
                    report.completed = true; report.reason = "diagnostic_completed"
                } catch {
                    report.reason = "diagnostic_failed_or_cancelled"
                    let failure = error as NSError
                    // Retain failure identity without localized text or file paths.
                    report.errorDomain = failure.domain
                    report.errorCode = failure.code
                }
                continuation.resume(returning: report)
            }
        }
        let elapsed = started.duration(to: .now).components
        result.durationMilliseconds = Int(elapsed.seconds * 1_000 + elapsed.attoseconds / 1_000_000_000_000_000)
        return result
    }
}
