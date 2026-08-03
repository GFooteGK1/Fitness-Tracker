import Foundation

public struct MealPhotoCandidate: Codable, Equatable, Sendable {
    public let resourceLocalIdentifier: String
    public let contentHash: String
    public let capturedAt: Date
    public let timezoneOffsetMinutes: Int
    public private(set) var attempts: Int

    public init(
        resourceLocalIdentifier: String,
        contentHash: String,
        capturedAt: Date,
        timezoneOffsetMinutes: Int,
        attempts: Int = 0
    ) {
        self.resourceLocalIdentifier = resourceLocalIdentifier
        self.contentHash = contentHash
        self.capturedAt = capturedAt
        self.timezoneOffsetMinutes = timezoneOffsetMinutes
        self.attempts = attempts
    }

    public mutating func recordAttempt() {
        attempts += 1
    }
}

public enum MealPhotoDisposition: String, Codable, Equatable, Sendable {
    case uploaded
    case skippedOnDevice
    case uploadFailedClosed
}

public struct MealPhotoIngestionLedger: Codable, Equatable, Sendable {
    public private(set) var persistentChangeTokenData: Data?
    public private(set) var pendingByHash: [String: MealPhotoCandidate]
    public private(set) var processedByHash: [String: MealPhotoDisposition]

    public init(
        persistentChangeTokenData: Data? = nil,
        pendingByHash: [String: MealPhotoCandidate] = [:],
        processedByHash: [String: MealPhotoDisposition] = [:]
    ) {
        self.persistentChangeTokenData = persistentChangeTokenData
        self.pendingByHash = pendingByHash
        self.processedByHash = processedByHash
    }

    @discardableResult
    public mutating func prepare(_ candidate: MealPhotoCandidate) -> Bool {
        guard processedByHash[candidate.contentHash] == nil,
              pendingByHash[candidate.contentHash] == nil else {
            return false
        }

        pendingByHash[candidate.contentHash] = candidate
        return true
    }

    public mutating func markSkipped(contentHash: String) {
        pendingByHash.removeValue(forKey: contentHash)
        processedByHash[contentHash] = .skippedOnDevice
    }

    public mutating func markUploaded(contentHash: String) {
        pendingByHash.removeValue(forKey: contentHash)
        processedByHash[contentHash] = .uploaded
    }

    @discardableResult
    public mutating func recordUploadFailure(
        contentHash: String,
        maximumAttempts: Int
    ) -> MealPhotoDisposition? {
        guard maximumAttempts > 0,
              var candidate = pendingByHash[contentHash] else {
            return nil
        }

        candidate.recordAttempt()
        if candidate.attempts >= maximumAttempts {
            pendingByHash.removeValue(forKey: contentHash)
            processedByHash[contentHash] = .uploadFailedClosed
            return .uploadFailedClosed
        }

        pendingByHash[contentHash] = candidate
        return nil
    }

    public mutating func advancePersistentChangeToken(to data: Data) {
        persistentChangeTokenData = data
    }

    public static func idempotencyKey(deviceID: String, contentHash: String) -> String {
        "\(deviceID):\(contentHash)"
    }
}
