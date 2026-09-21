import ExtensionFoundation
import Foundation
import OSLog
import Photos

@main
final class BackgroundUploadExtension: PHBackgroundResourceUploadExtension {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "SociusFitAutoMealsBackgroundUpload",
        category: "ProtocolProbe"
    )
    private let sharedStore: ProtocolProbeSharedStore?
    private let lifecycleStore: ProtocolProbeLifecycleStore
    private let terminationLock = NSLock()
    private var terminationRequested = false

    required init() {
        Self.logger.notice("Protocol probe extension initialized")
        let lifecycle = ProtocolProbeLifecycleStore.appGroup()
        Self.logLifecycle(lifecycle.record(.initialized))
        lifecycleStore = lifecycle
        sharedStore = ProtocolProbeSharedStore()
        let identity = ProtocolProbeBuildIdentity.current
        Self.logger.notice("Protocol probe build version=\(identity.version, privacy: .public) build=\(identity.build, privacy: .public)")
        observe { $0.lastInitializationAt = Date() }
    }

    // Diagnostic failures never enter PhotoKit's processing catch/return paths.
    private func observe(_ update: (inout ProtocolProbeDiagnostics) -> Void) {
        guard let sharedStore else {
            Self.logger.error("Protocol probe diagnostic skipped: unavailable")
            return
        }
        switch sharedStore.updateDiagnostics(initializeIfMissing: true, update) {
        case .updated: break
        case .skipped(let read):
            Self.logger.error("Protocol probe diagnostic skipped: \(read.category, privacy: .public)")
        case .encodingFailed:
            Self.logger.error("Protocol probe diagnostic skipped: encoding failed")
        }
    }

    private static func logLifecycle(_ outcome: ProtocolProbeLifecycleWrite) {
        switch outcome {
        case .written: break
        case .unavailable: Self.logger.error("Protocol probe lifecycle write: unavailable")
        case .oversized: Self.logger.error("Protocol probe lifecycle write: oversized")
        case .failed(let code): Self.logger.error("Protocol probe lifecycle write failed code=\(code, privacy: .public)")
        }
    }

    func process() -> PHBackgroundResourceUploadProcessingResult {
        Self.logger.notice("Protocol probe process entered")
        Self.logLifecycle(lifecycleStore.record(.processEntered))
        guard let sharedStore else {
            Self.logger.error("Protocol probe App Group is unavailable")
            return .failure
        }

        do {
            let hasBaselineToken = sharedStore.loadPersistentChangeTokenData() != nil
            observe {
                $0.beginInvocation(hasBaselineToken: hasBaselineToken, at: Date())
            }

            if try acknowledgeFinishedJobs(using: sharedStore) {
                return .completed
            }

            guard !isTerminationRequested else {
                observe {
                    $0.mark(phase: .terminationRequested, at: Date())
                }
                return .processing
            }

            guard let configuration = probeConfiguration() else {
                observe {
                    $0.mark(phase: .configurationError, at: Date())
                }
                Self.logger.notice("Probe endpoint is not configured; no photo can be uploaded")
                return .completed
            }

            let library = PHPhotoLibrary.shared()
            guard let tokenData = sharedStore.loadPersistentChangeTokenData() else {
                try saveToken(library.currentChangeToken, to: sharedStore)
                observe {
                    $0.mark(phase: .baselineEstablished, at: Date())
                    $0.hasBaselineToken = true
                }
                Self.logger.notice("Protocol probe baseline established; prepare a fresh canary in the host app")
                return .completed
            }

            let previousToken = try unarchiveToken(from: tokenData)
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
                try saveToken(nextToken, to: sharedStore)
                observe {
                    $0.mark(phase: .baselineEstablished, at: Date())
                    $0.hasBaselineToken = true
                }
                return .completed

            case .noUpload:
                try saveToken(nextToken, to: sharedStore)
                observe {
                    $0.mark(
                        phase: .noInsertedPhotos,
                        at: Date(),
                        insertedPhotoCount: insertedAssets.count
                    )
                }
                return .completed

            case .enqueue(let localIdentifier):
                guard let resource = originalPhotoResource(for: localIdentifier) else {
                    try saveToken(nextToken, to: sharedStore)
                    observe {
                        $0.mark(
                            phase: .resourceUnavailable,
                            at: Date(),
                            insertedPhotoCount: insertedAssets.count,
                            originalResourceAvailable: false
                        )
                    }
                    Self.logger.notice("Newest inserted asset has no original photo resource; skipped locally")
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
                try saveToken(nextToken, to: sharedStore)
                observe {
                    $0.mark(
                        phase: .jobRegistered,
                        at: Date(),
                        insertedPhotoCount: insertedAssets.count,
                        originalResourceAvailable: true,
                        jobRegistered: true
                    )
                }
                Self.logger.notice("Registered one disposable-photo protocol probe job")
                return .processing
            }
        } catch PHPhotosError.persistentChangeTokenExpired {
            sharedStore.removePersistentChangeTokenData()
            observe {
                $0.mark(phase: .tokenExpired, at: Date())
                $0.hasBaselineToken = false
            }
            Self.logger.notice("Persistent change token expired; prepare a fresh canary in the host app")
            return .processing
        } catch PHPhotosError.limitExceeded {
            observe {
                $0.mark(phase: .jobLimitReached, at: Date())
            }
            Self.logger.notice("PhotoKit upload-job limit reached; waiting for another invocation")
            return .processing
        } catch {
            let nsError = error as NSError
            observe {
                $0.recordFailure(
                    domain: nsError.domain,
                    code: nsError.code,
                    at: Date()
                )
            }
            Self.logger.error(
                "Protocol probe failed closed domain=\(nsError.domain, privacy: .public) code=\(nsError.code, privacy: .public)"
            )
            return .failure
        }
    }

    func notifyTermination() {
        terminationLock.withLock {
            terminationRequested = true
        }
        Self.logger.notice("Protocol probe termination requested")
        Self.logLifecycle(lifecycleStore.record(.terminationRequested))
        observe {
            $0.mark(phase: .terminationRequested, at: Date())
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

    private func acknowledgeFinishedJobs(
        using sharedStore: ProtocolProbeSharedStore
    ) throws -> Bool {
        let finishedJobs = PHAssetResourceUploadJob.fetchJobs(action: .acknowledge, options: nil)
        guard finishedJobs.count > 0 else {
            return false
        }

        for index in 0..<finishedJobs.count {
            let job = finishedJobs.object(at: index)
            let jobError: NSError?
            if let error = job.error {
                jobError = error as NSError
            } else {
                jobError = nil
            }

            observe {
                $0.recordJobResult(
                    state: String(describing: job.state),
                    requestID: job.responseHeaderFields?["x-probe-request-id"],
                    errorDomain: jobError?.domain,
                    errorCode: jobError?.code,
                    at: Date()
                )
            }
            Self.logger.notice(
                "Observed one protocol probe job result state=\(String(describing: job.state), privacy: .public)"
            )
        }

        try PHPhotoLibrary.shared().performChangesAndWait {
            for index in 0..<finishedJobs.count {
                let job = finishedJobs.object(at: index)
                PHAssetResourceUploadJobChangeRequest(for: job)?.acknowledge()
            }
        }
        return true
    }

    private func unarchiveToken(from data: Data) throws -> PHPersistentChangeToken {
        guard let token = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: PHPersistentChangeToken.self,
            from: data
        ) else {
            throw NSError(domain: "SociusFit.ProtocolProbe.ChangeToken", code: 1)
        }
        return token
    }

    private func saveToken(
        _ token: PHPersistentChangeToken,
        to sharedStore: ProtocolProbeSharedStore
    ) throws {
        let data = try NSKeyedArchiver.archivedData(
            withRootObject: token,
            requiringSecureCoding: true
        )
        sharedStore.savePersistentChangeTokenData(data)
    }
}
