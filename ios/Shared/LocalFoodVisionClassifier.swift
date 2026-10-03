#if canImport(Vision) && canImport(CoreML)
import Foundation
import Vision
import CoreML
import ImageIO
import CoreGraphics

// CGImage is immutable. Both Photos and the offline evaluator use this input.
public struct LocalScreeningImage: @unchecked Sendable {
    public let cgImage: CGImage
    public let orientation: CGImagePropertyOrientation
    public init(cgImage: CGImage, orientation: CGImagePropertyOrientation) {
        self.cgImage = cgImage; self.orientation = orientation
    }
}

@available(macOS 14.0, iOS 17.0, *)
public enum LocalFoodVisionClassifier {
    public static let requestRevision = VNClassifyImageRequestRevision1

    public static func classify(_ image: LocalScreeningImage, isScreenshot screenshot: Bool) async -> FoodScreeningResult {
        guard image.cgImage.width <= 1_024, image.cgImage.height <= 1_024 else {
            return FoodScreeningResult(outcome: .error, reason: "image_dimensions_exceeded")
        }
        let started = ContinuousClock.now
        let result = await perform(image, isScreenshot: screenshot)
        let elapsed = started.duration(to: .now).components
        return FoodScreeningResult(outcome: result.outcome, reason: result.reason, labels: result.labels,
            foodConfidence: result.foodConfidence,
            durationMilliseconds: Int(elapsed.seconds * 1_000 + elapsed.attoseconds / 1_000_000_000_000_000))
    }

    private static func perform(_ image: LocalScreeningImage, isScreenshot screenshot: Bool) async -> FoodScreeningResult {
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let request = VNClassifyImageRequest()
                request.revision = requestRevision
                request.preferBackgroundProcessing = true
                let deadline = DispatchWorkItem { request.cancel() }
                DispatchQueue.global().asyncAfter(deadline: .now() + 10, execute: deadline)
                defer { deadline.cancel() }
                do {
                    // Select CPU for every supported stage; never assume a locked-device accelerator works.
                    let stages = try request.supportedComputeStageDevices
                    guard !stages.isEmpty else {
                        continuation.resume(returning: FoodScreeningResult(outcome: .error, reason: "cpu_compute_unavailable"))
                        return
                    }
                    for (stage, devices) in stages {
                        guard let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) else {
                            continuation.resume(returning: FoodScreeningResult(outcome: .error, reason: "cpu_compute_unavailable"))
                            return
                        }
                        request.setComputeDevice(cpu, for: stage)
                    }
                    let supported = try request.supportedIdentifiers().contains("food")
                    guard supported else {
                        continuation.resume(returning: FoodScreeningResult(outcome: .error, reason: "food_label_unsupported"))
                        return
                    }
                    let handler = VNImageRequestHandler(cgImage: image.cgImage, orientation: image.orientation)
                    try handler.perform([request])
                    let labels = (request.results ?? []).map { FoodScreeningLabel($0.identifier, $0.confidence) }
                    continuation.resume(returning: LocalFoodScreeningPolicy.evaluate(labels: labels,
                        supportsFood: true, isScreenshot: screenshot))
                } catch {
                    continuation.resume(returning: FoodScreeningResult(outcome: .error, reason: "vision_failed_or_cancelled"))
                }
            }
        }
    }
}
#endif
