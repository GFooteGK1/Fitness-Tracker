import AppIntents
import Foundation
import Photos

struct DiscoverNewPhotosIntent: AppIntent {
    static var title: LocalizedStringResource { "Discover New Photos" }
    static var description: IntentDescription {
        IntentDescription("Tracks newly added still photos after enrollment. Keeps all identifiers local; no upload or analysis.")
    }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else {
            return .result(value: "Full Photos access is required. Open the Camera Shortcut tab.")
        }
        do {
            let summary = try await NewPhotoTrackingRuntime.session.discover(
                changes: { try NewPhotoTrackingRuntime.changes(since: $0) },
                resolve: { NewPhotoTrackingRuntime.resolve($0) }
            )
            return .result(value: summary.text)
        } catch NewPhotoTrackingError.notEnrolled {
            return .result(value: "Open the app and Start New Photo Tracking before taking test photos.")
        } catch NewPhotoTrackingError.capacityExceeded {
            return .result(value: "Tracking capacity reached. Discovery checkpoint was preserved; open the app for review.")
        } catch PHPhotosError.persistentChangeTokenExpired {
            return .result(value: "Photos change history expired. Tracking state was preserved; capture diagnostics before recovery.")
        } catch PHPhotosError.persistentChangeDetailsUnavailable {
            return .result(value: "Photos change history is unavailable. Tracking state was preserved; try again later.")
        }
    }
}

enum NewPhotoTrackingRuntime {
    static let store = NewPhotoTrackingStore(directory: URL.applicationSupportDirectory
        .appendingPathComponent("CameraCloseProbe", isDirectory: true))
    static let session = NewPhotoTrackingSession(store: store)

    static func enroll() async throws {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else {
            throw CocoaError(.fileReadNoPermission)
        }
        let token = try archive(PHPhotoLibrary.shared().currentChangeToken)
        try await session.enroll(token: token)
    }

    static func changes(since data: Data) throws -> NewPhotoDiscoveryBatch {
        guard let previous = try NSKeyedUnarchiver.unarchivedObject(ofClass: PHPersistentChangeToken.self, from: data) else {
            throw NewPhotoTrackingError.invalidRecord
        }
        let changes = try PHPhotoLibrary.shared().fetchPersistentChanges(since: previous)
        var batch = NewPhotoDiscoveryBatch(token: data, inserted: [])
        for change in changes {
            let details = try change.changeDetails(for: .asset)
            batch.append(token: try archive(change.changeToken), inserted: details.insertedLocalIdentifiers,
                         deleted: details.deletedLocalIdentifiers, updated: details.updatedLocalIdentifiers)
            // Bound discovery before looking up assets; no checkpoint has been written.
            guard batch.inserted.union(batch.deleted).union(batch.updated).count <= NewPhotoTrackingLedger.maximumAssets else {
                throw NewPhotoTrackingError.capacityExceeded
            }
        }
        return batch
    }

    static func resolve(_ identifiers: [String]) -> [NewPhotoTrackedAsset] {
        guard !identifiers.isEmpty else { return [] }
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
        var resolved: [NewPhotoTrackedAsset] = []
        for index in 0..<assets.count {
            let asset = assets.object(at: index)
            resolved.append(NewPhotoTrackedAsset(
                localIdentifier: asset.localIdentifier,
                kind: asset.mediaType == .image ? .stillPhoto : .otherMedia,
                capturedAt: asset.creationDate
            ))
        }
        // Missing assets stay unresolved; do not confuse late availability with deletion.
        return resolved
    }

    private static func archive(_ token: PHPersistentChangeToken) throws -> Data {
        try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    }
}
