import ExtensionFoundation
import Foundation
import OSLog
import Photos

@main
final class BackgroundUploadExtension: PHBackgroundResourceUploadExtension {
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "SociusFitAutoMealsBackgroundUpload",
        category: "ProtocolProbe"
    )
    private let tokenStore = ProtocolProbeChangeTokenStore()
    private let terminationLock = NSLock()
    private var terminationRequested = false

    required init() {}

    func process() -> PHBackgroundResourceUploadProcessingResult {
        do {
            try acknowledgeFinishedJobs()

            guard !isTerminationRequested else {
                return .processing
            }

            guard let configuration = probeConfiguration() else {
                logger.notice("Probe endpoint is not configured; no photo can be uploaded")
                return .completed
            }

            let library = PHPhotoLibrary.shared()
            guard let previousToken = tokenStore.load() else {
                try tokenStore.save(library.currentChangeToken)
                logger.notice("Protocol probe baseline established; capture one disposable photo next")
                return .completed
            }

            let changes = try library.fetchPersistentChanges(since: previousToken)
            var insertedAssetIdentifiers = Set<String>()
            var nextToken = previousToken

            for change in changes {
                nextToken = change.changeToken
                let details = try change.changeDetails(for: .asset)
                insertedAssetIdentifiers.formUnion(details.insertedLocalIdentifiers)
            }

            let insertedAssets = fetchInsertedPhotos(with: insertedAssetIdentifiers)
            let action = ProtocolProbeBatchPlanner.action(
                hasPersistentChangeToken: true,
                insertedAssets: insertedAssets
            )

            switch action {
            case .establishBaseline:
                return .completed
            case .noUpload:
                try tokenStore.save(nextToken)
                return .completed
            case .enqueue(let localIdentifier):
                guard let resource = originalPhotoResource(for: localIdentifier) else {
                    try tokenStore.save(nextToken)
                    logger.notice("Newest inserted asset has no original photo resource; skipped locally")
                    return .completed
                }

                var destination = URLRequest(url: configuration.uploadURL)
                destination.httpMethod = "POST"
                destination.cachePolicy = .reloadIgnoringLocalCacheData
                destination.setValue("options-501-v1", forHTTPHeaderField: "x-sociusfit-probe")

                try library.performChangesAndWait {
                    _ = PHAssetResourceUploadJobChangeRequest.creationRequestForJob(
                        destination: destination,
                        resource: resource
                    )
                }

                // Advance only after registration so relaunch cannot duplicate this change.
                try tokenStore.save(nextToken)
                logger.notice("Registered one disposable-photo protocol probe job")
                return .processing
            }
        } catch PHPhotosError.persistentChangeTokenExpired {
            tokenStore.remove()
            logger.notice("Persistent change token expired; discarded it and will rebaseline")
            return .processing
        } catch PHPhotosError.limitExceeded {
            logger.notice("PhotoKit upload-job limit reached; waiting for another invocation")
            return .processing
        } catch {
            logger.error("Protocol probe failed closed: \(String(describing: error), privacy: .public)")
            return .failure
        }
    }

    func notifyTermination() {
        terminationLock.withLock {
            terminationRequested = true
        }
    }

    private var isTerminationRequested: Bool {
        terminationLock.withLock { terminationRequested }
    }

    private func probeConfiguration() -> ProtocolProbeConfiguration? {
        guard let baseURLString = Bundle.main.object(
            forInfoDictionaryKey: "BackgroundUploadURLBase"
        ) as? String else {
            return nil
        }

        return ProtocolProbeConfiguration(baseURLString: baseURLString)
    }

    private func fetchInsertedPhotos(
        with localIdentifiers: Set<String>
    ) -> [ProtocolProbeInsertedAsset] {
        guard !localIdentifiers.isEmpty else {
            return []
        }

        let assets = PHAsset.fetchAssets(
            withLocalIdentifiers: Array(localIdentifiers),
            options: nil
        )
        var insertedPhotos: [ProtocolProbeInsertedAsset] = []
        insertedPhotos.reserveCapacity(assets.count)

        for index in 0..<assets.count {
            let asset = assets.object(at: index)
            guard asset.mediaType == .image else {
                continue
            }
            insertedPhotos.append(
                ProtocolProbeInsertedAsset(
                    localIdentifier: asset.localIdentifier,
                    capturedAt: asset.creationDate
                )
            )
        }

        return insertedPhotos
    }

    private func originalPhotoResource(for localIdentifier: String) -> PHAssetResource? {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil)
        guard assets.count == 1 else {
            return nil
        }

        return PHAssetResource.assetResources(for: assets.object(at: 0))
            .first { $0.type == .photo }
    }

    private func acknowledgeFinishedJobs() throws {
        let finishedJobs = PHAssetResourceUploadJob.fetchJobs(action: .acknowledge, options: nil)
        guard finishedJobs.count > 0 else {
            return
        }

        for index in 0..<finishedJobs.count {
            let job = finishedJobs.object(at: index)
            let requestID = job.responseHeaderFields?["x-probe-request-id"] ?? "missing"
            logger.notice(
                "Acknowledging protocol probe job state=\(String(describing: job.state), privacy: .public) request=\(requestID, privacy: .public)"
            )
        }

        try PHPhotoLibrary.shared().performChangesAndWait {
            for index in 0..<finishedJobs.count {
                let job = finishedJobs.object(at: index)
                PHAssetResourceUploadJobChangeRequest(for: job)?.acknowledge()
            }
        }
    }
}

private final class ProtocolProbeChangeTokenStore {
    private let defaults: UserDefaults
    private let key = "ProtocolProbe.PersistentChangeToken"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> PHPersistentChangeToken? {
        guard let data = defaults.data(forKey: key) else {
            return nil
        }

        do {
            return try NSKeyedUnarchiver.unarchivedObject(
                ofClass: PHPersistentChangeToken.self,
                from: data
            )
        } catch {
            defaults.removeObject(forKey: key)
            return nil
        }
    }

    func save(_ token: PHPersistentChangeToken) throws {
        let data = try NSKeyedArchiver.archivedData(
            withRootObject: token,
            requiringSecureCoding: true
        )
        defaults.set(data, forKey: key)
    }

    func remove() {
        defaults.removeObject(forKey: key)
    }
}
