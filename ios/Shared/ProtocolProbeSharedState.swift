import Foundation

public let protocolProbeAppGroupIdentifier = "group.com.sociusfit.automeals"

public enum ProtocolProbePhase: String, Codable, Equatable, Sendable {
    case neverInvoked
    case readyForCapture
    case extensionInvoked
    case baselineEstablished
    case noInsertedPhotos
    case resourceUnavailable
    case jobRegistered
    case jobResultObserved
    case tokenExpired
    case jobLimitReached
    case terminationRequested
    case disabled
    case configurationError
    case failed
}

public struct ProtocolProbeDiagnostics: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 1

    public var schemaVersion: Int
    public var phase: ProtocolProbePhase
    public var lastUpdatedAt: Date?
    public var lastInvocationAt: Date?
    public var lastInitializationAt: Date?
    public var canaryPreparedAt: Date?
    public var invocationCount: Int
    public var hasBaselineToken: Bool
    public var insertedPhotoCount: Int
    public var originalResourceAvailable: Bool?
    public var jobRegistered: Bool
    public var lastJobState: String?
    public var lastRequestID: String?
    public var lastErrorDomain: String?
    public var lastErrorCode: Int?

    public init(
        schemaVersion: Int = ProtocolProbeDiagnostics.currentSchemaVersion,
        phase: ProtocolProbePhase = .neverInvoked,
        lastUpdatedAt: Date? = nil,
        lastInvocationAt: Date? = nil,
        invocationCount: Int = 0,
        hasBaselineToken: Bool = false,
        insertedPhotoCount: Int = 0,
        originalResourceAvailable: Bool? = nil,
        jobRegistered: Bool = false,
        lastJobState: String? = nil,
        lastRequestID: String? = nil,
        lastErrorDomain: String? = nil,
        lastErrorCode: Int? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.phase = phase
        self.lastUpdatedAt = lastUpdatedAt
        self.lastInvocationAt = lastInvocationAt
        self.lastInitializationAt = nil
        self.canaryPreparedAt = nil
        self.invocationCount = invocationCount
        self.hasBaselineToken = hasBaselineToken
        self.insertedPhotoCount = insertedPhotoCount
        self.originalResourceAvailable = originalResourceAvailable
        self.jobRegistered = jobRegistered
        self.lastJobState = lastJobState
        self.lastRequestID = lastRequestID
        self.lastErrorDomain = lastErrorDomain
        self.lastErrorCode = lastErrorCode
    }

    public mutating func prepareFreshCanary(at date: Date) {
        self = ProtocolProbeDiagnostics(
            phase: .readyForCapture,
            lastUpdatedAt: date,
            hasBaselineToken: true
        )
        canaryPreparedAt = date
    }

    public mutating func beginInvocation(hasBaselineToken: Bool, at date: Date) {
        phase = .extensionInvoked
        lastUpdatedAt = date
        lastInvocationAt = date
        invocationCount += 1
        self.hasBaselineToken = hasBaselineToken
        insertedPhotoCount = 0
        originalResourceAvailable = nil
        jobRegistered = false
        lastErrorDomain = nil
        lastErrorCode = nil
    }

    public mutating func mark(
        phase: ProtocolProbePhase,
        at date: Date,
        insertedPhotoCount: Int? = nil,
        originalResourceAvailable: Bool? = nil,
        jobRegistered: Bool? = nil
    ) {
        self.phase = phase
        lastUpdatedAt = date
        if let insertedPhotoCount {
            self.insertedPhotoCount = insertedPhotoCount
        }
        if let originalResourceAvailable {
            self.originalResourceAvailable = originalResourceAvailable
        }
        if let jobRegistered {
            self.jobRegistered = jobRegistered
        }
    }

    public mutating func recordJobResult(
        state: String,
        requestID: String?,
        errorDomain: String?,
        errorCode: Int?,
        at date: Date
    ) {
        phase = .jobResultObserved
        lastUpdatedAt = date
        lastJobState = state
        lastRequestID = requestID
        lastErrorDomain = errorDomain
        lastErrorCode = errorCode
    }

    public mutating func recordFailure(
        phase: ProtocolProbePhase = .failed,
        domain: String,
        code: Int,
        at date: Date
    ) {
        self.phase = phase
        lastUpdatedAt = date
        lastErrorDomain = domain
        lastErrorCode = code
    }
}

public enum ProtocolProbeDiagnosticsRead: Equatable, Sendable {
    case valid(ProtocolProbeDiagnostics)
    case missing
    case wrongType
    case corrupt
    case unsupportedSchema(Int)
    case unavailable

    public var snapshot: ProtocolProbeDiagnostics? {
        guard case .valid(let snapshot) = self else { return nil }
        return snapshot
    }

    public var category: String {
        switch self {
        case .valid: "Valid recorded snapshot"
        case .missing: "No observable snapshot"
        case .wrongType: "Wrong stored type"
        case .corrupt: "Corrupt snapshot"
        case .unsupportedSchema: "Unsupported snapshot schema"
        case .unavailable: "App Group unavailable"
        }
    }
}

public enum ProtocolProbeDiagnosticsUpdate: Equatable, Sendable {
    case updated
    case skipped(ProtocolProbeDiagnosticsRead)
    case encodingFailed
}

public final class ProtocolProbeSharedStore {
    private enum Key {
        static let diagnostics = "ProtocolProbe.Diagnostics"
        static let persistentChangeToken = "ProtocolProbe.PersistentChangeToken"
    }

    private let defaults: UserDefaults

    public convenience init?() {
        #if os(iOS)
        guard FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: protocolProbeAppGroupIdentifier
        ) != nil else {
            return nil
        }
        #endif
        guard let defaults = UserDefaults(suiteName: protocolProbeAppGroupIdentifier) else {
            return nil
        }
        self.init(defaults: defaults)
    }

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public func readDiagnostics() -> ProtocolProbeDiagnosticsRead {
        guard let value = defaults.object(forKey: Key.diagnostics) else { return .missing }
        guard let data = value as? Data else { return .wrongType }
        struct Header: Decodable { let schemaVersion: Int }
        guard let header = try? JSONDecoder().decode(Header.self, from: data) else {
            return .corrupt
        }
        guard header.schemaVersion == ProtocolProbeDiagnostics.currentSchemaVersion else {
            return .unsupportedSchema(header.schemaVersion)
        }
        guard let snapshot = try? JSONDecoder().decode(ProtocolProbeDiagnostics.self, from: data) else {
            return .corrupt
        }
        return .valid(snapshot)
    }

    public func saveDiagnostics(_ diagnostics: ProtocolProbeDiagnostics) throws {
        defaults.set(try JSONEncoder().encode(diagnostics), forKey: Key.diagnostics)
    }

    @discardableResult
    public func updateDiagnostics(
        initializeIfMissing: Bool = false,
        _ update: (inout ProtocolProbeDiagnostics) -> Void
    ) -> ProtocolProbeDiagnosticsUpdate {
        let read = readDiagnostics()
        var diagnostics: ProtocolProbeDiagnostics
        switch read {
        case .valid(let snapshot): diagnostics = snapshot
        case .missing where initializeIfMissing: diagnostics = ProtocolProbeDiagnostics()
        default: return .skipped(read)
        }
        update(&diagnostics)
        do {
            try saveDiagnostics(diagnostics)
            return .updated
        } catch {
            return .encodingFailed
        }
    }

    public func prepareFreshCanary(tokenData: Data, at date: Date = Date()) throws {
        var diagnostics = ProtocolProbeDiagnostics()
        diagnostics.prepareFreshCanary(at: date)
        defaults.set(tokenData, forKey: Key.persistentChangeToken)
        try saveDiagnostics(diagnostics)
    }

    public func loadPersistentChangeTokenData() -> Data? {
        defaults.data(forKey: Key.persistentChangeToken)
    }

    public func savePersistentChangeTokenData(_ data: Data) {
        defaults.set(data, forKey: Key.persistentChangeToken)
    }

    public func removePersistentChangeTokenData() {
        defaults.removeObject(forKey: Key.persistentChangeToken)
    }
}
