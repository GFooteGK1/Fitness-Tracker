import Foundation

public enum NewPhotoTrackingError: Error, Equatable {
    case notEnrolled, alreadyEnrolled, invalidRecord, capacityExceeded
}

public enum NewPhotoAssetKind: String, Codable, Sendable {
    case unresolved, stillPhoto, otherMedia, deleted
}

public struct NewPhotoTrackedAsset: Codable, Equatable, Sendable {
    public let localIdentifier: String
    public var kind: NewPhotoAssetKind
    public var capturedAt: Date?
    public var wasCountedAsPhoto: Bool

    public init(localIdentifier: String, kind: NewPhotoAssetKind = .unresolved, capturedAt: Date? = nil) {
        self.localIdentifier = localIdentifier
        self.kind = kind
        self.capturedAt = capturedAt
        wasCountedAsPhoto = kind == .stillPhoto
    }
}

public struct NewPhotoDiscoveryBatch: Sendable {
    public private(set) var token: Data
    public private(set) var inserted: Set<String>
    public private(set) var deleted: Set<String>
    public private(set) var updated: Set<String>

    public init(token: Data, inserted: Set<String>, deleted: Set<String> = [], updated: Set<String> = []) {
        self.token = token
        self.inserted = inserted
        self.deleted = deleted
        self.updated = updated
    }

    /// Consume history in Photos enumeration order, retaining final per-ID state.
    public mutating func append(token: Data, inserted: Set<String>, deleted: Set<String>, updated: Set<String>) {
        self.deleted.subtract(inserted.union(updated))
        self.inserted.formUnion(inserted)
        self.updated.formUnion(updated)
        self.deleted.formUnion(deleted)
        // Retain every insertion as a candidate even if it is later deleted.
        // A later restoration may be an update rather than another insertion.
        self.updated.subtract(deleted)
        self.token = token
    }
}

/// Local asset identities are never diagnostic or request metadata.
/// One atomic snapshot binds the discovery checkpoint to every retained candidate.
public struct NewPhotoTrackingLedger: Codable, Equatable, Sendable {
    public static let maximumAssets = 1_000
    public let schemaVersion: Int
    public let enrolledAt: Date
    public private(set) var token: Data
    public private(set) var assets: [String: NewPhotoTrackedAsset]
    public private(set) var lastDiscoveryAt: Date?
    public private(set) var lastNewPhotoCount: Int

    public init(token: Data, at: Date = Date()) throws {
        guard !token.isEmpty else { throw NewPhotoTrackingError.invalidRecord }
        schemaVersion = 1
        enrolledAt = at
        self.token = token
        assets = [:]
        lastNewPhotoCount = 0
    }

    public var isValid: Bool {
        schemaVersion == 1 && !token.isEmpty && assets.count <= Self.maximumAssets &&
        lastNewPhotoCount >= 0 && lastNewPhotoCount <= assets.count &&
        assets.allSatisfy { key, value in
            key == value.localIdentifier && !key.isEmpty && key.utf8.count <= 512 &&
            (value.kind != .stillPhoto || value.wasCountedAsPhoto)
        }
    }

    public var stillPhotoCount: Int { assets.values.filter { $0.kind == .stillPhoto }.count }
    public var unresolvedIdentifiers: [String] {
        assets.values.filter { $0.kind == .unresolved }.map(\.localIdentifier).sorted()
    }

    public func applying(_ batch: NewPhotoDiscoveryBatch, at: Date = Date()) throws -> Self {
        guard !batch.token.isEmpty,
              batch.inserted.union(batch.deleted).union(batch.updated).allSatisfy({ !$0.isEmpty && $0.utf8.count <= 512 }) else {
            throw NewPhotoTrackingError.invalidRecord
        }
        let additions = batch.inserted.subtracting(Set(assets.keys))
        guard assets.count + additions.count <= Self.maximumAssets else {
            throw NewPhotoTrackingError.capacityExceeded
        }
        var next = self
        for identifier in additions {
            next.assets[identifier] = NewPhotoTrackedAsset(localIdentifier: identifier)
        }
        for identifier in batch.inserted.union(batch.updated).subtracting(batch.deleted)
            where next.assets[identifier]?.kind == .deleted {
            next.assets[identifier]?.kind = .unresolved
        }
        for identifier in batch.deleted where next.assets[identifier] != nil {
            next.assets[identifier]?.kind = .deleted
        }
        next.token = batch.token
        next.lastDiscoveryAt = at
        next.lastNewPhotoCount = 0
        return next
    }

    public mutating func resolve(_ resolved: [NewPhotoTrackedAsset]) {
        for asset in resolved where assets[asset.localIdentifier]?.kind == .unresolved {
            guard asset.kind == .stillPhoto || asset.kind == .otherMedia else { continue }
            let previouslyCounted = assets[asset.localIdentifier]?.wasCountedAsPhoto == true
            var retained = asset
            retained.wasCountedAsPhoto = previouslyCounted || asset.kind == .stillPhoto
            assets[asset.localIdentifier] = retained
            if asset.kind == .stillPhoto && !previouslyCounted { lastNewPhotoCount += 1 }
        }
    }
}

public struct NewPhotoTrackingStore: Sendable {
    public static let maximumBytes = 1_048_576
    private let fileURL: URL

    public init(directory: URL) { fileURL = directory.appendingPathComponent("new-photo-tracking.json") }

    public func load() throws -> NewPhotoTrackingLedger? {
        let data: Data
        do {
            let handle = try FileHandle(forReadingFrom: fileURL)
            defer { try? handle.close() }
            data = try handle.read(upToCount: Self.maximumBytes + 1) ?? Data()
        } catch {
            let error = error as NSError
            if error.domain == NSCocoaErrorDomain &&
                [CocoaError.fileNoSuchFile.rawValue, CocoaError.fileReadNoSuchFile.rawValue].contains(error.code) {
                return nil
            }
            throw error
        }
        guard data.count <= Self.maximumBytes else { throw NewPhotoTrackingError.invalidRecord }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let ledger = try? decoder.decode(NewPhotoTrackingLedger.self, from: data), ledger.isValid else {
            throw NewPhotoTrackingError.invalidRecord
        }
        return ledger
    }

    public func save(_ ledger: NewPhotoTrackingLedger) throws {
        // Preserve unreadable/corrupt/future evidence; never silently re-enroll.
        _ = try load()
        guard ledger.isValid else { throw NewPhotoTrackingError.invalidRecord }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(ledger)
        guard data.count <= Self.maximumBytes else { throw NewPhotoTrackingError.capacityExceeded }
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: fileURL, options: .atomic)
        #endif
    }
}

public struct NewPhotoTrackingSummary: Sendable {
    public let newPhotos: Int
    public let unresolved: Int
    public let totalPhotos: Int

    public var text: String { "New photos found: \(newPhotos). Unresolved assets: \(unresolved)." }
}

/// A single writer in the host process; no suspension between discovery and commits.
public actor NewPhotoTrackingSession {
    private let store: NewPhotoTrackingStore
    public init(store: NewPhotoTrackingStore) { self.store = store }

    public func enroll(token: Data) throws {
        guard try store.load() == nil else { throw NewPhotoTrackingError.alreadyEnrolled }
        try store.save(NewPhotoTrackingLedger(token: token))
    }

    public func discover(
        changes: @Sendable (Data) throws -> NewPhotoDiscoveryBatch,
        resolve: @Sendable ([String]) throws -> [NewPhotoTrackedAsset]
    ) throws -> NewPhotoTrackingSummary {
        guard let prior = try store.load() else { throw NewPhotoTrackingError.notEnrolled }
        var next = try prior.applying(changes(prior.token))
        // Durably preserve even temporarily unavailable asset IDs before advancing.
        try store.save(next)
        next.resolve(try resolve(next.unresolvedIdentifiers))
        try store.save(next)
        return NewPhotoTrackingSummary(
            newPhotos: next.lastNewPhotoCount,
            unresolved: next.unresolvedIdentifiers.count,
            totalPhotos: next.stillPhotoCount
        )
    }
}
