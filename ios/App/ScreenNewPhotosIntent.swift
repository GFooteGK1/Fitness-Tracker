import AppIntents
import Foundation
import Photos
import Vision
import CoreML
import ImageIO
import UIKit

struct ScreenNewPhotosIntent: AppIntent {
    static var title: LocalizedStringResource { "Discover and Screen New Photos" }
    static var description: IntentDescription { IntentDescription("Discovers photos and evaluates food presence on this phone. No upload or macro analysis.") }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else {
            return .result(value: "Full Photos access is required. Open the Camera Shortcut tab.")
        }
        do {
            guard try LocalFoodScreeningRuntime.store.load()?.enabled == true else {
                return .result(value: "Enable Local Food Screening in the app first.")
            }
            _ = try await NewPhotoTrackingRuntime.session.discover(
                changes: { try NewPhotoTrackingRuntime.changes(since: $0) },
                resolve: { NewPhotoTrackingRuntime.resolve($0) })
            guard let tracking = try NewPhotoTrackingRuntime.store.load() else { throw NewPhotoTrackingError.notEnrolled }
            let summary = try await LocalFoodScreeningRuntime.session.screen(assets: Array(tracking.assets.values)) {
                await LocalFoodScreeningRuntime.classify($0)
            }
            return .result(value: summary.text)
        } catch FoodScreeningError.disabled {
            return .result(value: "Enable Local Food Screening in the app first.")
        } catch FoodScreeningError.busy {
            return .result(value: "Local food screening is already running. Try again after it completes.")
        } catch NewPhotoTrackingError.notEnrolled {
            return .result(value: "Start New Photo Tracking in the app first.")
        } catch NewPhotoTrackingError.capacityExceeded {
            return .result(value: "Tracking capacity reached. Saved state is preserved; open the app for review.")
        } catch PHPhotosError.persistentChangeTokenExpired {
            return .result(value: "Photos history expired. Saved state is preserved; capture diagnostics before recovery.")
        } catch PHPhotosError.persistentChangeDetailsUnavailable {
            return .result(value: "Photos history is unavailable. Saved state is preserved; try again later.")
        }
    }
}

enum LocalFoodScreeningRuntime {
    static let store = FoodScreeningStore(directory: URL.applicationSupportDirectory.appendingPathComponent("CameraCloseProbe", isDirectory: true))
    static let session = LocalFoodScreeningSession(store: store)

    static func classify(_ identifier: String) async -> FoodScreeningResult {
        let started = ContinuousClock.now
        let result = await classifyPhoto(identifier)
        let elapsed = started.duration(to: .now).components
        let milliseconds = Int(elapsed.seconds * 1_000 + elapsed.attoseconds / 1_000_000_000_000_000)
        return FoodScreeningResult(outcome: result.outcome, reason: result.reason, labels: result.labels,
            foodConfidence: result.foodConfidence, durationMilliseconds: milliseconds)
    }

    private static func classifyPhoto(_ identifier: String) async -> FoodScreeningResult {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else {
            return FoodScreeningResult(outcome: .error, reason: "photos_permission_required")
        }
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject,
              asset.mediaType == .image else {
            return FoodScreeningResult(outcome: .error, reason: "asset_unavailable")
        }
        let screenshot = asset.mediaSubtypes.contains(.photoScreenshot)
        guard let image = await readImage(asset) else {
            return FoodScreeningResult(outcome: .error, reason: "local_image_unavailable_or_timeout")
        }
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let request = VNClassifyImageRequest()
                request.revision = VNClassifyImageRequestRevision1
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

    static func readImage(_ asset: PHAsset) async -> LocalScreeningImage? {
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = false
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        return await withCheckedContinuation { continuation in
            let completion = ScreeningImageCompletion(continuation)
            let requestID = PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 512, height: 512),
                contentMode: .aspectFit, options: options) { image, info in
                if info?[PHImageResultIsDegradedKey] as? Bool == true { return }
                guard info?[PHImageErrorKey] == nil, info?[PHImageCancelledKey] as? Bool != true,
                      let image, let cgImage = image.cgImage,
                      cgImage.width <= 1_024, cgImage.height <= 1_024 else {
                    completion.resolve(nil); return
                }
                completion.resolve(LocalScreeningImage(cgImage: cgImage, orientation: image.imageOrientation.visionOrientation))
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
                if completion.resolve(nil) { PHImageManager.default().cancelImageRequest(requestID) }
            }
        }
    }
}

// CGImage is immutable; this wrapper transfers ownership without exposing a mutable UIImage.
struct LocalScreeningImage: @unchecked Sendable {
    let cgImage: CGImage
    let orientation: CGImagePropertyOrientation
}

private final class ScreeningImageCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<LocalScreeningImage?, Never>?
    init(_ continuation: CheckedContinuation<LocalScreeningImage?, Never>) { self.continuation = continuation }
    @discardableResult func resolve(_ image: LocalScreeningImage?) -> Bool {
        lock.lock(); let pending = continuation; continuation = nil; lock.unlock()
        guard let pending else { return false }
        pending.resume(returning: image); return true
    }
}

private extension UIImage.Orientation {
    var visionOrientation: CGImagePropertyOrientation {
        switch self {
        case .up: .up
        case .down: .down
        case .left: .left
        case .right: .right
        case .upMirrored: .upMirrored
        case .downMirrored: .downMirrored
        case .leftMirrored: .leftMirrored
        case .rightMirrored: .rightMirrored
        @unknown default: .up
        }
    }
}
