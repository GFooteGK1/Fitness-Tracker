import Foundation

public enum CameraCloseProbePhase: String, Codable, Sendable {
    case entered, permissionRequired, noPhotos, resourceUnavailable, timedOut, photoRead, completed

    public var description: String {
        switch self {
        case .entered: "Action entered; completion not recorded"
        case .permissionRequired: "Full Photos access required"
        case .noPhotos: "No still photo found"
        case .resourceUnavailable: "Local thumbnail unavailable"
        case .timedOut: "Photo read timed out"
        case .photoRead: "Local thumbnail read; completion not recorded"
        case .completed: "Completed local thumbnail check"
        }
    }
}

/// Local diagnostic evidence only. No photo identity, bytes, or upload state.
public struct CameraCloseProbeRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let runID: UUID
    public let version: String
    public let build: String
    public let enteredAt: Date
    public var phase: CameraCloseProbePhase
    public var photoReadAt: Date?
    public var completedAt: Date?

    public init(identity: ProtocolProbeBuildIdentity = .current, at: Date = Date()) {
        schemaVersion = 1
        runID = UUID()
        version = identity.version
        build = identity.build
        enteredAt = at
        phase = .entered
    }
}

public enum CameraCloseProbeRead: Equatable, Sendable {
    case missing, valid(CameraCloseProbeRecord), invalid, unavailable
}

public enum CameraCloseProbeStoreError: Error { case invalidExistingRecord, oversized }

/// App-private storage is sufficient: the shortcut executes the host App Intent.
/// Reads never create or replace evidence. The runner is the only writer.
public struct CameraCloseProbeStore: Sendable {
    public static let maximumBytes = 2_048
    private let fileURL: URL

    public init(directory: URL) {
        fileURL = directory.appendingPathComponent("camera-close-probe.json")
    }

    public func read() -> CameraCloseProbeRead {
        do {
            let handle = try FileHandle(forReadingFrom: fileURL)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: Self.maximumBytes + 1) ?? Data()
            guard data.count <= Self.maximumBytes else { return .invalid }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            guard let record = try? decoder.decode(CameraCloseProbeRecord.self, from: data),
                  record.schemaVersion == 1,
                  (record.phase != .completed || (record.photoReadAt != nil && record.completedAt != nil)) else {
                return .invalid
            }
            return .valid(record)
        } catch {
            let error = error as NSError
            if error.domain == NSCocoaErrorDomain &&
                [CocoaError.fileNoSuchFile.rawValue, CocoaError.fileReadNoSuchFile.rawValue].contains(error.code) {
                return .missing
            }
            return .unavailable
        }
    }

    public func save(_ record: CameraCloseProbeRecord) throws {
        switch read() {
        case .invalid: throw CameraCloseProbeStoreError.invalidExistingRecord
        case .unavailable: throw CocoaError(.fileReadNoPermission)
        case .missing, .valid: break
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(record)
        guard data.count <= Self.maximumBytes else { throw CameraCloseProbeStoreError.oversized }
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: fileURL, options: .atomic)
        #endif
    }
}

public enum CameraClosePhotoReadOutcome: Sendable {
    case readable, permissionRequired, noPhotos, unavailable, timedOut
}

public enum CameraCloseProbeRunResult: Sendable {
    case recorded(CameraCloseProbePhase), busy
}

/// Serializes action runs across suspension. This is not the future ingestion ledger.
public actor CameraCloseProbeRunner {
    private var running = false
    private let store: CameraCloseProbeStore

    public init(store: CameraCloseProbeStore) { self.store = store }

    public func run(
        readPhoto: @Sendable () async -> CameraClosePhotoReadOutcome
    ) async throws -> CameraCloseProbeRunResult {
        guard !running else { return .busy }
        running = true
        defer { running = false }
        var record = CameraCloseProbeRecord()
        try store.save(record)
        switch await readPhoto() {
        case .readable:
            record.phase = .photoRead
            record.photoReadAt = Date()
            try store.save(record)
            record.phase = .completed
            record.completedAt = Date()
        case .permissionRequired: record.phase = .permissionRequired
        case .noPhotos: record.phase = .noPhotos
        case .unavailable: record.phase = .resourceUnavailable
        case .timedOut: record.phase = .timedOut
        }
        try store.save(record)
        return .recorded(record.phase)
    }
}
