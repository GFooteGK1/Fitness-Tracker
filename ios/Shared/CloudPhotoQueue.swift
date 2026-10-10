import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

public enum CloudPhotoError: Error { case invalid, full, busy, disabled }
public enum CloudPhotoPhase: String, Codable, Sendable { case queued, submitted, complete, deferred }
public struct CloudPhotoEntry: Codable, Equatable, Sendable {
    public let localIdentifier: String
    public let requestID: UUID
    public let capturedAt: Date
    public var phase: CloudPhotoPhase = .queued
    public var contentHash: String?
    public var outcome: String?
}
public struct CloudPhotoQueue: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let deviceID: UUID
    public let origin: URL
    public let enabledAt: Date
    public let expiresAt: Date
    public var entries: [String: CloudPhotoEntry]
    public init(deviceID: UUID, origin: URL, enabledAt: Date, expiresAt: Date) throws {
        guard Self.allowedOrigin(origin), expiresAt > enabledAt else { throw CloudPhotoError.invalid }
        schemaVersion = 1; self.deviceID = deviceID; self.origin = origin
        self.enabledAt = enabledAt; self.expiresAt = expiresAt; entries = [:]
    }
    // Pair only with the existing Socius web project, never an arbitrary host.
    public static func allowedOrigin(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil, ["", "/"].contains(url.path), let host = url.host else { return false }
        return host == "sociusfit.com" || host == "www.sociusfit.com" || host == "fitness-tracker.vercel.app" ||
            (host.hasPrefix("fitness-tracker-") && host.hasSuffix("-gregs-projects-98860c8b.vercel.app"))
    }
    public var isValid: Bool {
        schemaVersion == 1 && Self.allowedOrigin(origin) && expiresAt > enabledAt && entries.count <= 200 &&
        entries.allSatisfy { key, item in key == item.localIdentifier && !key.isEmpty && key.utf8.count <= 512 && item.capturedAt >= enabledAt &&
            (item.phase != .submitted || item.contentHash?.count == 64) &&
            (item.contentHash == nil || item.contentHash!.allSatisfy { "0123456789abcdef".contains($0) } && item.contentHash!.count == 64) &&
            (item.outcome == nil || ["draft", "non_food", "review_required", "failed"].contains(item.outcome!)) }
    }
    public mutating func admit(_ assets: [NewPhotoTrackedAsset]) throws {
        let eligible = assets.filter { $0.kind == .stillPhoto && $0.capturedAt.map { $0 >= enabledAt } == true && entries[$0.localIdentifier] == nil }
        guard entries.count + eligible.count <= 200 else { throw CloudPhotoError.full }
        for asset in eligible { entries[asset.localIdentifier] = CloudPhotoEntry(localIdentifier: asset.localIdentifier, requestID: UUID(), capturedAt: asset.capturedAt!) }
        guard isValid else { throw CloudPhotoError.invalid }
    }
    public var next: CloudPhotoEntry? {
        entries.values.filter { $0.phase != .complete }.sorted {
            // Reconcile attempted requests before admitting another provider call.
            if ($0.phase == .submitted) != ($1.phase == .submitted) { return $0.phase == .submitted }
            return ($0.capturedAt, $0.localIdentifier) < ($1.capturedAt, $1.localIdentifier)
        }.first
    }
    public mutating func submitted(_ id: String, hash: String) throws {
        guard var item = entries[id], item.phase != .submitted && item.phase != .complete,
              hash.count == 64, hash.allSatisfy({ "0123456789abcdef".contains($0) }) else { throw CloudPhotoError.invalid }
        item.phase = .submitted; item.contentHash = hash; entries[id] = item
    }
    public mutating func complete(_ id: String, requestID: UUID, outcome: String) throws {
        guard var item = entries[id], item.phase == .submitted, item.requestID == requestID,
              ["draft", "non_food", "review_required", "failed"].contains(outcome) else { throw CloudPhotoError.invalid }
        item.phase = .complete; item.outcome = outcome; entries[id] = item
    }
}

/// The lease spans all awaits in a run. Actors alone do not serialize processes.
public final class CloudPhotoLease {
    private let descriptor: Int32
    init(_ directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        descriptor = open(directory.appendingPathComponent("cloud-photo.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw CloudPhotoError.invalid }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { close(descriptor); throw CloudPhotoError.busy }
    }
    deinit { _ = flock(descriptor, LOCK_UN); close(descriptor) }
}
public struct CloudPhotoStore: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    public func lease() throws -> CloudPhotoLease { try CloudPhotoLease(directory) }
    public func load() throws -> CloudPhotoQueue? {
        let url = directory.appendingPathComponent("cloud-photo-queue.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        let data = try handle.read(upToCount: 256 * 1024 + 1) ?? Data()
        guard data.count <= 256 * 1024 else { throw CloudPhotoError.invalid }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let queue = try decoder.decode(CloudPhotoQueue.self, from: data)
        guard queue.isValid else { throw CloudPhotoError.invalid }; return queue
    }
    public func save(_ queue: CloudPhotoQueue) throws {
        _ = try load() // Never overwrite corrupt, future or unreadable evidence.
        guard queue.isValid else { throw CloudPhotoError.invalid }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(queue); guard data.count <= 256 * 1024 else { throw CloudPhotoError.full }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("cloud-photo-queue.json")
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
