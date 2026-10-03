import Foundation

public enum FoodScreeningOutcome: String, Codable, Sendable, CaseIterable {
    case foodCandidate, nonFood, uncertain, error

    public var title: String {
        switch self {
        case .foodCandidate: "Food candidate"
        case .nonFood: "Non-food"
        case .uncertain: "Uncertain"
        case .error: "Error"
        }
    }
}

public struct FoodScreeningLabel: Codable, Equatable, Sendable {
    public let identifier: String
    public let confidence: Float
    public init(_ identifier: String, _ confidence: Float) {
        self.identifier = identifier; self.confidence = confidence
    }
    public var isValid: Bool {
        !identifier.isEmpty && identifier.utf8.count <= 128 && confidence.isFinite && (0...1).contains(confidence)
    }
}

public struct FoodScreeningResult: Codable, Equatable, Sendable {
    public let outcome: FoodScreeningOutcome
    public let reason: String
    public let labels: [FoodScreeningLabel]
    public let foodConfidence: Float?
    public let durationMilliseconds: Int

    public init(outcome: FoodScreeningOutcome, reason: String, labels: [FoodScreeningLabel] = [],
                foodConfidence: Float? = nil, durationMilliseconds: Int = 0) {
        self.outcome = outcome; self.reason = reason; self.labels = labels
        self.foodConfidence = foodConfidence; self.durationMilliseconds = durationMilliseconds
    }
    public var isValid: Bool {
        !reason.isEmpty && reason.utf8.count <= 128 && labels.count <= 3 && labels.allSatisfy(\.isValid) &&
        (foodConfidence.map { $0.isFinite && (0...1).contains($0) } ?? true) && durationMilliseconds >= 0
    }
}

/// Experimental scores, not calibrated probabilities or permission to upload.
public enum LocalFoodScreeningPolicy {
    public static let version = "vision-r1-food-v1"
    public static func evaluate(labels: [FoodScreeningLabel], supportsFood: Bool, isScreenshot: Bool,
                                durationMilliseconds: Int = 0) -> FoodScreeningResult {
        func result(_ outcome: FoodScreeningOutcome, _ reason: String, _ food: Float? = nil) -> FoodScreeningResult {
            FoodScreeningResult(outcome: outcome, reason: reason,
                labels: Array(labels.sorted { $0.confidence > $1.confidence }.prefix(3)),
                foodConfidence: food, durationMilliseconds: durationMilliseconds)
        }
        guard supportsFood else { return FoodScreeningResult(outcome: .error, reason: "food_label_unsupported") }
        guard !labels.isEmpty, labels.allSatisfy(\.isValid),
              Set(labels.map(\.identifier)).count == labels.count else {
            return FoodScreeningResult(outcome: .error, reason: "invalid_observations")
        }
        if isScreenshot { return result(.uncertain, "screenshot") }
        guard let food = labels.first(where: { $0.identifier == "food" })?.confidence else {
            return result(.uncertain, "food_label_missing")
        }
        let blockers: Set<String> = ["people", "document", "text", "screen", "computer", "monitor"]
        if labels.contains(where: { blockers.contains($0.identifier) && $0.confidence >= 0.2 }) {
            return result(.uncertain, "mixed_or_sensitive_scene", food)
        }
        if food >= 0.65 { return result(.foodCandidate, "food_score", food) }
        if food <= 0.1 && labels.contains(where: { $0.identifier != "food" && $0.confidence >= 0.8 }) {
            return result(.nonFood, "low_food_score", food)
        }
        return result(.uncertain, "ambiguous_scores", food)
    }
}

public enum FoodPresenceLabel: String, Codable, Sendable, CaseIterable { case unlabelled, food, nonFood, uncertain }
public enum MacroSuitabilityLabel: String, Codable, Sendable, CaseIterable { case unlabelled, suitable, unsuitable, uncertain }
public enum FoodEvaluationSplit: String, Codable, Sendable, CaseIterable { case development, heldOut }
public enum FoodScreeningError: Error { case disabled, busy, invalidRecord, missingRecord }

public struct FoodScreeningRecord: Codable, Equatable, Sendable {
    public let localIdentifier: String
    public let capturedAt: Date?
    public var attempts: Int = 0
    public var result: FoodScreeningResult?
    public var checkedAt: Date?
    public var presence: FoodPresenceLabel = .unlabelled
    public var suitability: MacroSuitabilityLabel = .unlabelled
    public var split: FoodEvaluationSplit = .development
    public var needsAttempt: Bool { attempts < 3 && (result == nil || result?.outcome == .error) }
}

public struct FoodScreeningLedger: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let policyVersion: String
    public let startedAt: Date
    public var enabled: Bool
    public var records: [String: FoodScreeningRecord]

    public init(at: Date = Date()) {
        schemaVersion = 1; policyVersion = LocalFoodScreeningPolicy.version
        startedAt = at; enabled = true; records = [:]
    }
    public var isValid: Bool {
        schemaVersion == 1 && policyVersion == LocalFoodScreeningPolicy.version && records.count <= 1_000 &&
        records.allSatisfy { key, record in
            key == record.localIdentifier && !key.isEmpty && key.utf8.count <= 512 &&
            (0...3).contains(record.attempts) && (record.result?.isValid ?? true) &&
            (record.result == nil || (record.attempts > 0 && record.checkedAt != nil))
        }
    }
}

public struct FoodScreeningStore: Sendable {
    private let fileURL: URL
    public init(directory: URL) { fileURL = directory.appendingPathComponent("local-food-screening.json") }

    public func load() throws -> FoodScreeningLedger? {
        let data: Data
        do {
            let handle = try FileHandle(forReadingFrom: fileURL)
            defer { try? handle.close() }
            data = try handle.read(upToCount: 1_048_577) ?? Data()
        } catch {
            let error = error as NSError
            if error.domain == NSCocoaErrorDomain &&
                [CocoaError.fileNoSuchFile.rawValue, CocoaError.fileReadNoSuchFile.rawValue].contains(error.code) { return nil }
            throw error
        }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        guard data.count <= 1_048_576,
              let ledger = try? decoder.decode(FoodScreeningLedger.self, from: data), ledger.isValid else {
            throw FoodScreeningError.invalidRecord
        }
        return ledger
    }

    public func save(_ ledger: FoodScreeningLedger) throws {
        _ = try load() // Preserve corrupt, unavailable and future-version evidence.
        guard ledger.isValid else { throw FoodScreeningError.invalidRecord }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(ledger)
        guard data.count <= 1_048_576 else { throw FoodScreeningError.invalidRecord }
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: fileURL, options: .atomic)
        #endif
    }
}

public struct FoodScreeningSummary: Sendable {
    public let checked: Int
    public let pending: Int
    public let errors: Int
    public var text: String { "Locally checked: \(checked). Pending: \(pending). Errors: \(errors). Open the app for results." }
}

public struct FoodScreeningEvaluation: Sendable {
    public let clearMeals: Int
    public let detectedMeals: Int
    public let nonFood: Int
    public let falsePasses: Int
    public let pendingLabels: Int
    public init(records: [FoodScreeningRecord], split: FoodEvaluationSplit) {
        let subset = records.filter { $0.split == split }
        let meals = subset.filter { $0.presence == .food && $0.suitability == .suitable }
        let negatives = subset.filter { $0.presence == .nonFood }
        clearMeals = meals.count
        detectedMeals = meals.filter { $0.result?.outcome == .foodCandidate }.count
        nonFood = negatives.count
        falsePasses = negatives.filter { $0.result?.outcome == .foodCandidate }.count
        pendingLabels = subset.filter { $0.presence != .unlabelled && $0.result == nil && $0.needsAttempt }.count
    }
}

/// Host-process single writer. Explicit busy guard remains set across suspension.
public actor LocalFoodScreeningSession {
    private let store: FoodScreeningStore
    private var running = false
    public init(store: FoodScreeningStore) { self.store = store }

    public func setEnabled(_ enabled: Bool) throws {
        guard !running else { throw FoodScreeningError.busy }
        var ledger = try store.load() ?? FoodScreeningLedger()
        ledger.enabled = enabled
        try store.save(ledger)
    }

    public func label(_ identifier: String, presence: FoodPresenceLabel,
                      suitability: MacroSuitabilityLabel, split: FoodEvaluationSplit) throws {
        guard !running else { throw FoodScreeningError.busy }
        guard var ledger = try store.load(), ledger.records[identifier] != nil else { throw FoodScreeningError.missingRecord }
        ledger.records[identifier]?.presence = presence
        ledger.records[identifier]?.suitability = suitability
        ledger.records[identifier]?.split = split
        try store.save(ledger)
    }

    public func screen(assets: [NewPhotoTrackedAsset],
                       classify: @Sendable (String) async -> FoodScreeningResult) async throws -> FoodScreeningSummary {
        guard !running else { throw FoodScreeningError.busy }
        guard var ledger = try store.load(), ledger.enabled else { throw FoodScreeningError.disabled }
        running = true
        defer { running = false }
        let eligible = assets.filter { $0.kind == .stillPhoto }
        let identifiers = Set(eligible.map(\.localIdentifier))
        for asset in eligible where ledger.records[asset.localIdentifier] == nil {
            ledger.records[asset.localIdentifier] = FoodScreeningRecord(localIdentifier: asset.localIdentifier, capturedAt: asset.capturedAt)
        }
        try store.save(ledger) // Preserve every candidate before reading image bytes.
        let candidates = ledger.records.values.filter { identifiers.contains($0.localIdentifier) && $0.needsAttempt }
            .sorted {
                if $0.attempts != $1.attempts { return $0.attempts < $1.attempts } // A deferred image cannot starve new captures.
                if $0.capturedAt != $1.capturedAt { return ($0.capturedAt ?? .distantPast) < ($1.capturedAt ?? .distantPast) }
                return $0.localIdentifier < $1.localIdentifier
            }
        var checked = 0
        let started = ContinuousClock.now
        for candidate in candidates.prefix(3) {
            // Soft start budget only. The current Vision operation uses cooperative cancellation.
            // Device qualification must measure total time; this does not guarantee a 20-second return.
            if Task.isCancelled || started.duration(to: .now) >= .seconds(20) { break }
            ledger.records[candidate.localIdentifier]?.attempts += 1
            try store.save(ledger) // An interrupted attempt consumes the bounded retry budget.
            let result = await classify(candidate.localIdentifier)
            guard result.isValid else { throw FoodScreeningError.invalidRecord }
            ledger.records[candidate.localIdentifier]?.result = result
            ledger.records[candidate.localIdentifier]?.checkedAt = Date()
            try store.save(ledger)
            checked += 1
        }
        return FoodScreeningSummary(checked: checked,
            pending: ledger.records.values.filter { identifiers.contains($0.localIdentifier) && $0.needsAttempt }.count,
            errors: ledger.records.values.filter { $0.result?.outcome == .error || ($0.result == nil && !$0.needsAttempt) }.count)
    }
}
