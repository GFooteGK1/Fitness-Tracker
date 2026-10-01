import AppIntents
import Foundation
import Photos

/// Slice 1: prove host execution and a local thumbnail read; no ingestion yet.
struct CheckCameraPhotoAccessIntent: AppIntent {
    static var title: LocalizedStringResource { "Check Camera Photo Access" }
    static var description: IntentDescription {
        IntentDescription("Checks local access to the latest still photo. No image is uploaded or analyzed.")
    }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let result = try await CameraCloseProbeRuntime.runner.run {
            await CameraCloseProbeRuntime.readLatestThumbnail()
        }
        switch result {
        case .busy: return .result(value: "A photo access check is already running.")
        case .recorded(let phase): return .result(value: phase.description)
        }
    }
}

enum CameraCloseProbeRuntime {
    static let store = CameraCloseProbeStore(directory: URL.applicationSupportDirectory
        .appendingPathComponent("CameraCloseProbe", isDirectory: true))
    static let runner = CameraCloseProbeRunner(store: store)

    static func readLatestThumbnail() async -> CameraClosePhotoReadOutcome {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else {
            return .permissionRequired
        }
        let fetch = PHFetchOptions()
        fetch.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        fetch.fetchLimit = 1
        guard let asset = PHAsset.fetchAssets(with: .image, options: fetch).firstObject else {
            return .noPhotos
        }
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = false
        options.deliveryMode = .fastFormat
        options.resizeMode = .exact
        return await withCheckedContinuation { continuation in
            let completion = ThumbnailCompletion(continuation)
            let requestID = PHImageManager.default().requestImage(
                for: asset, targetSize: CGSize(width: 64, height: 64),
                contentMode: .aspectFit, options: options
            ) { image, info in
                let failed = info?[PHImageErrorKey] != nil || (info?[PHImageCancelledKey] as? Bool == true)
                completion.resolve(!failed && image != nil ? .readable : .unavailable)
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 10) {
                if completion.resolve(.timedOut) {
                    PHImageManager.default().cancelImageRequest(requestID)
                }
            }
        }
    }
}

/// Photos may call before requestImage returns. Callback and deadline compete once.
private final class ThumbnailCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<CameraClosePhotoReadOutcome, Never>?

    init(_ continuation: CheckedContinuation<CameraClosePhotoReadOutcome, Never>) {
        self.continuation = continuation
    }

    @discardableResult
    func resolve(_ outcome: CameraClosePhotoReadOutcome) -> Bool {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        guard let pending else { return false }
        pending.resume(returning: outcome)
        return true
    }
}
