import Foundation

public enum ProtocolProbeLifecycleEvent: String, Codable, CaseIterable, Sendable {
    case initialized
    case processEntered = "process-entered"
    case terminationRequested = "termination-requested"

    public var filename: String { rawValue + ".json" }
}

public struct ProtocolProbeBuildIdentity: Equatable, Sendable {
    public let version: String
    public let build: String

    public init(version: String, build: String) {
        self.version = Self.sanitize(version)
        self.build = Self.sanitize(build)
    }

    public static var current: Self {
        Self(
            version: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
            build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
        )
    }

    private static func sanitize(_ value: String) -> String {
        let allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_"
        let result = String(value.filter { allowed.contains($0) }.prefix(64))
        return result.isEmpty ? "unknown" : result
    }
}

public struct ProtocolProbeLifecycleRecord: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let event: ProtocolProbeLifecycleEvent
    public let timestamp: Date
    public let version: String
    public let build: String

    public func provenance(current: ProtocolProbeBuildIdentity, canaryPreparedAt: Date?) -> String {
        var labels: [String] = []
        if version != current.version || build != current.build {
            labels.append("Historical: different build")
        }
        if let canaryPreparedAt {
            labels.append(timestamp < canaryPreparedAt ? "Historical: before canary" : "At/after canary by device clock")
        } else {
            labels.append("Relationship to current canary unknown")
        }
        return labels.joined(separator: "; ")
    }
}

public enum ProtocolProbeLifecycleRead: Equatable, Sendable {
    case valid(ProtocolProbeLifecycleRecord)
    case missing
    case oversized
    case corrupt
    case unsupportedSchema(Int)
    case unavailable
    case readFailed(Int)

    public var category: String {
        switch self {
        case .valid: "Recorded"
        case .missing: "No evidence recorded in this slot"
        case .oversized: "Record exceeds size limit"
        case .corrupt: "Corrupt record or invalid event"
        case .unsupportedSchema(let version): "Unsupported schema (\(version))"
        case .unavailable: "App Group unavailable"
        case .readFailed(let code): "Read failed (code \(code))"
        }
    }
}

public enum ProtocolProbeLifecycleWrite: Equatable, Sendable {
    case written
    case unavailable
    case oversized
    case failed(Int)
}

/// Three independent latest-observation slots, not a counter or ordered journal.
/// Construction and reads never create or modify files. Only the extension calls record.
public struct ProtocolProbeLifecycleStore: Sendable {
    public static let maximumRecordBytes = 2_048
    public static let directoryName = "ProtocolProbeLifecycle"
    private let containerURL: URL?
    private let identity: ProtocolProbeBuildIdentity
    private let clock: @Sendable () -> Date
    private let writer: @Sendable (Data, URL) throws -> Void

    public init(
        containerURL: URL?,
        identity: ProtocolProbeBuildIdentity = .current,
        clock: @escaping @Sendable () -> Date = { Date() },
        writer: @escaping @Sendable (Data, URL) throws -> Void = { data, url in
            try ProtocolProbeLifecycleStore.atomicWrite(data, to: url)
        }
    ) {
        self.containerURL = containerURL
        self.identity = identity
        self.clock = clock
        self.writer = writer
    }

    public static func appGroup() -> Self {
        #if os(iOS)
        return Self(containerURL: FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: protocolProbeAppGroupIdentifier
        ))
        #else
        return Self(containerURL: nil)
        #endif
    }

    public func read(_ event: ProtocolProbeLifecycleEvent) -> ProtocolProbeLifecycleRead {
        guard let url = slotURL(event) else { return .unavailable }
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            // Never allocate an entire unexpected file.
            let data = try handle.read(upToCount: Self.maximumRecordBytes + 1) ?? Data()
            guard data.count <= Self.maximumRecordBytes else { return .oversized }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            struct Header: Decodable { let schemaVersion: Int }
            guard let header = try? decoder.decode(Header.self, from: data) else { return .corrupt }
            guard header.schemaVersion == 1 else { return .unsupportedSchema(header.schemaVersion) }
            guard let record = try? decoder.decode(ProtocolProbeLifecycleRecord.self, from: data),
                  record.event == event,
                  ProtocolProbeBuildIdentity(version: record.version, build: record.build).version == record.version,
                  ProtocolProbeBuildIdentity(version: record.version, build: record.build).build == record.build else {
                return .corrupt
            }
            return .valid(record)
        } catch {
            let error = error as NSError
            if error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError {
                return .missing
            }
            return .readFailed(error.code)
        }
    }

    @discardableResult
    public func record(_ event: ProtocolProbeLifecycleEvent) -> ProtocolProbeLifecycleWrite {
        guard let url = slotURL(event) else { return .unavailable }
        let record = ProtocolProbeLifecycleRecord(
            schemaVersion: 1, event: event, timestamp: clock(),
            version: identity.version, build: identity.build
        )
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(record)
            guard data.count <= Self.maximumRecordBytes else { return .oversized }
            try writer(data, url)
            return .written
        } catch {
            return .failed((error as NSError).code)
        }
    }

    private func slotURL(_ event: ProtocolProbeLifecycleEvent) -> URL? {
        containerURL?.appendingPathComponent(Self.directoryName, isDirectory: true)
            .appendingPathComponent(event.filename)
    }

    public static func atomicWrite(_ data: Data, to url: URL) throws {
        let directory = url.deletingLastPathComponent()
        #if os(iOS)
        let attributes: [FileAttributeKey: Any] = [
            .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
        ]
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: attributes)
        try FileManager.default.setAttributes(attributes, ofItemAtPath: directory.path)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        #endif
    }
}
