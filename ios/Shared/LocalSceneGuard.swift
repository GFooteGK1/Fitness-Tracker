import Foundation

public struct LocalSceneEvidence: Codable, Equatable, Sendable {
    public let completed: Bool
    public let reason: String
    public let stages: [String]
    public let faceCount: Int
    public let humanRectangleCount: Int
    public let bodyPoseCount: Int
    public let handPoseCount: Int
    public let durationMilliseconds: Int

    public init(completed: Bool, reason: String, stages: [String] = [], faceCount: Int = 0,
                humanRectangleCount: Int = 0, bodyPoseCount: Int = 0, handPoseCount: Int = 0,
                durationMilliseconds: Int = 0) {
        self.completed = completed; self.reason = reason; self.stages = stages
        self.faceCount = faceCount; self.humanRectangleCount = humanRectangleCount
        self.bodyPoseCount = bodyPoseCount; self.handPoseCount = handPoseCount
        self.durationMilliseconds = durationMilliseconds
    }
    public var isValid: Bool {
        !reason.isEmpty && reason.utf8.count <= 128 && durationMilliseconds >= 0 &&
        [faceCount, humanRectangleCount, bodyPoseCount, handPoseCount].allSatisfy { (0...10_000).contains($0) } &&
        Set(stages).count == stages.count && Set(stages).isSubset(of: Set(LocalScenePolicy.requiredStages)) &&
        (!completed || Set(stages) == Set(LocalScenePolicy.requiredStages))
    }
    public var containsHumanGeometry: Bool { faceCount + humanRectangleCount + bodyPoseCount + handPoseCount > 0 }
}

/// Evaluation proposal only. No app runtime or persisted-v1 policy uses this enum.
public enum LocalScenePolicy {
    public static let version = "siglip2-geometry-v2"
    public static let guardVersion = "vision-human-geometry-v1"
    public static let requiredStages = ["face", "humanRectangle", "bodyPose", "handPose"]
    public static let minimumConfidence: Float = 0.2
    public static let minimumPosePoints = 2
    public static let maximumHandCount = 4

    public static func evaluate(foodMargin: Float, contextMargin: Float, scene: LocalSceneEvidence?,
                                isScreenshot: Bool) -> FoodScreeningResult {
        if isScreenshot { return FoodScreeningResult(outcome: .uncertain, reason: "screenshot") }
        guard let scene, scene.isValid, scene.completed else {
            return FoodScreeningResult(outcome: .uncertain, reason: "scene_evidence_unavailable")
        }
        guard foodMargin.isFinite, contextMargin.isFinite else {
            return FoodScreeningResult(outcome: .error, reason: "invalid_semantic_scores")
        }
        let confidence = Float(1 / (1 + exp(-Double(max(-80, min(80, foodMargin))))))
        if scene.containsHumanGeometry {
            return FoodScreeningResult(outcome: .uncertain, reason: "human_geometry", foodConfidence: confidence)
        }
        if contextMargin >= 0 {
            return FoodScreeningResult(outcome: .uncertain, reason: "context_similarity", foodConfidence: confidence)
        }
        if foodMargin >= 1 {
            return FoodScreeningResult(outcome: .foodCandidate, reason: "food_similarity_margin", foodConfidence: confidence)
        }
        if foodMargin <= -1 {
            return FoodScreeningResult(outcome: .nonFood, reason: "non_food_similarity_margin", foodConfidence: confidence)
        }
        return FoodScreeningResult(outcome: .uncertain, reason: "ambiguous_similarity_margin", foodConfidence: confidence)
    }
}

#if canImport(Vision) && canImport(CoreML)
import Vision
import CoreML

@available(macOS 14.0, iOS 17.0, *)
public enum LocalSceneGuard {
    public static let revisions = ["face": Int(VNDetectFaceRectanglesRequestRevision3),
        "humanRectangle": Int(VNDetectHumanRectanglesRequestRevision2),
        "bodyPose": Int(VNDetectHumanBodyPoseRequestRevision1), "handPose": Int(VNDetectHumanHandPoseRequestRevision1)]

    public static func inspect(_ image: LocalScreeningImage) async -> LocalSceneEvidence {
        guard image.cgImage.width <= 1_024, image.cgImage.height <= 1_024 else {
            return LocalSceneEvidence(completed: false, reason: "image_dimensions_exceeded")
        }
        let started = ContinuousClock.now
        let result: LocalSceneEvidence = await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let face = VNDetectFaceRectanglesRequest(); face.revision = VNDetectFaceRectanglesRequestRevision3
                let human = VNDetectHumanRectanglesRequest(); human.revision = VNDetectHumanRectanglesRequestRevision2
                human.upperBodyOnly = false
                let body = VNDetectHumanBodyPoseRequest(); body.revision = VNDetectHumanBodyPoseRequestRevision1
                let hand = VNDetectHumanHandPoseRequest(); hand.revision = VNDetectHumanHandPoseRequestRevision1
                hand.maximumHandCount = LocalScenePolicy.maximumHandCount
                let requests: [VNRequest] = [face, human, body, hand]
                let deadline = DispatchWorkItem { requests.forEach { $0.cancel() } }
                DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: deadline)
                defer { deadline.cancel() }
                do {
                    for request in requests {
                        request.preferBackgroundProcessing = true
                        let stages = try request.supportedComputeStageDevices
                        guard !stages.isEmpty else {
                            continuation.resume(returning: LocalSceneEvidence(completed: false, reason: "cpu_compute_unavailable")); return
                        }
                        for (stage, devices) in stages {
                            guard let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) else {
                                continuation.resume(returning: LocalSceneEvidence(completed: false, reason: "cpu_compute_unavailable")); return
                            }
                            request.setComputeDevice(cpu, for: stage)
                        }
                    }
                    let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: image.orientation)
                    try handler.perform(requests)
                    let threshold = LocalScenePolicy.minimumConfidence
                    let faces = (face.results ?? []).filter { $0.confidence >= threshold }.count
                    let humans = (human.results ?? []).filter { $0.confidence >= threshold }.count
                    var bodies = 0; var hands = 0
                    for observation in body.results ?? [] {
                        let points = try observation.recognizedPoints(.all)
                        if points.values.filter({ $0.confidence >= threshold }).count >= LocalScenePolicy.minimumPosePoints { bodies += 1 }
                    }
                    for observation in hand.results ?? [] {
                        let points = try observation.recognizedPoints(.all)
                        if points.values.filter({ $0.confidence >= threshold }).count >= LocalScenePolicy.minimumPosePoints { hands += 1 }
                    }
                    continuation.resume(returning: LocalSceneEvidence(completed: true, reason: "geometry_completed",
                        stages: LocalScenePolicy.requiredStages, faceCount: faces, humanRectangleCount: humans,
                        bodyPoseCount: bodies, handPoseCount: hands))
                } catch {
                    continuation.resume(returning: LocalSceneEvidence(completed: false, reason: "scene_failed_or_cancelled"))
                }
            }
        }
        let elapsed = started.duration(to: .now).components
        return LocalSceneEvidence(completed: result.completed, reason: result.reason, stages: result.stages,
            faceCount: result.faceCount, humanRectangleCount: result.humanRectangleCount,
            bodyPoseCount: result.bodyPoseCount, handPoseCount: result.handPoseCount,
            durationMilliseconds: Int(elapsed.seconds * 1_000 + elapsed.attoseconds / 1_000_000_000_000_000))
    }
}
#endif
