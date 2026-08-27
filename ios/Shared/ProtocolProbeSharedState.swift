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

public final class ProtocolProbeSharedStore {
    private enum Key {
        static let diagnostics = "ProtocolProbe.Diagnostics"
        static let persistentChangeToken = "ProtocolProbe.PersistentChangeToken"
    }

    private let defaults: UserDefaults

    public convenience init?() {
        guard let defaults = UserDefaults(suiteName: protocolProbeAppGroupIdentifier) else {
            return nil
        }
        self.init(defaults: defaults)
    }

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public func loadDiagnostics() -> ProtocolProbeDiagnostics {
        guard let data = defaults.data(forKey: Key.diagnostics),
              let diagnostics = try? JSONDecoder().decode(
                  ProtocolProbeDiagnostics.self,
                  from: data
              ),
              diagnostics.schemaVersion == ProtocolProbeDiagnostics.currentSchemaVersion else {
            return ProtocolProbeDiagnostics()
        }
        return diagnostics
    }

    public func saveDiagnostics(_ diagnostics: ProtocolProbeDiagnostics) throws {
        defaults.set(try JSONEncoder().encode(diagnostics), forKey: Key.diagnostics)
    }

    public func updateDiagnostics(
        _ update: (inout ProtocolProbeDiagnostics) -> Void
    ) throws {
        var diagnostics = loadDiagnostics()
        update(&diagnostics)
        try saveDiagnostics(diagnostics)
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
