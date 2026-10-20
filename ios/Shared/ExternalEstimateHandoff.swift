import Foundation
import CryptoKit

public enum EstimateHandoffError: Error, LocalizedError {
    case invalid, disabled, full, changedImage, awaitingEstimate
    public var errorDescription: String? {
        switch self {
        case .invalid: "Estimate handoff is unavailable. Original capture state is preserved."
        case .disabled: "Enable the separate ChatGPT handoff first."
        case .full: "Estimate capture capacity reached. Existing identities are preserved."
        case .changedImage: "The photo changed or is unavailable. The original capture ID cannot be rebound."
        case .awaitingEstimate: "The original image was already handed off. Continue its estimate or check its original ID; do not estimate it again."
        }
    }
}
public struct EstimateCaptureEnvelope: Codable, Equatable, Sendable {
    public let requestId: String
    public let capturedAt: String
    public let contentHash: String
    public var isValid: Bool {
        UUID(uuidString: requestId)?.uuidString.lowercased() == requestId &&
        Self.date(capturedAt).map { Self.time($0) == capturedAt } == true && contentHash.count == 64 && contentHash.allSatisfy { "0123456789abcdef".contains($0) }
    }
    public static func date(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text)
    }
    public static func time(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
    public static func imageHash(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
}
public enum EstimateHandoffPhase: String, Codable, Sendable { case prepared, imageHandedOff, importSubmitted, complete }
public struct EstimateHandoffEntry: Codable, Equatable, Sendable {
    // PhotoKit identifiers remain local; only capture is exposed to the Shortcut.
    public let localIdentifier: String
    public let capture: EstimateCaptureEnvelope
    public var phase: EstimateHandoffPhase = .prepared
    public var estimateJSON: String?
    public var receiptJSON: String?
}
public struct EstimateHandoffLedger: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public var epoch: UUID
    public var enabled: Bool
    public var admissionBoundary: Date
    public private(set) var entries: [String: EstimateHandoffEntry]
    public init(epoch: UUID, at: Date) { schemaVersion = 1; self.epoch = epoch; enabled = true; admissionBoundary = at; entries = [:] }
    public var isValid: Bool {
        schemaVersion == 1 && admissionBoundary.timeIntervalSince1970.isFinite && entries.count <= 200 &&
        Set(entries.values.map { $0.capture.requestId }).count == entries.count &&
        entries.allSatisfy { key, value in
            key == value.localIdentifier && !key.isEmpty && key.utf8.count <= 512 && value.capture.isValid &&
            (value.estimateJSON?.utf8.count ?? 0) <= 32 * 1024 && (value.receiptJSON?.utf8.count ?? 0) <= 32 * 1024 &&
            ((value.phase == .prepared || value.phase == .imageHandedOff) ? value.estimateJSON == nil && value.receiptJSON == nil : value.estimateJSON != nil) &&
            (value.estimateJSON == nil || (try? ExternalFoodEstimate.parse(value.estimateJSON!)) != nil) &&
            (value.phase != .importSubmitted || value.receiptJSON == nil) && (value.phase != .complete || Self.validReceipt(value.receiptJSON, capture: value.capture, estimateJSON: value.estimateJSON))
        }
    }
    public var pending: EstimateHandoffEntry? {
        entries.values.filter { $0.phase != .complete }.sorted { ($0.capture.capturedAt, $0.capture.requestId) < ($1.capture.capturedAt, $1.capture.requestId) }.first
    }
    @discardableResult public mutating func prepare(asset: NewPhotoTrackedAsset, bytes: Data, requestID: UUID = UUID()) throws -> EstimateHandoffEntry {
        guard enabled, asset.kind == .stillPhoto, let date = asset.capturedAt, date >= admissionBoundary,
              bytes.count >= 1000, bytes.count <= 1024 * 1024,
              try CloudPhotoJPEG.withoutMetadata(bytes) == bytes else { throw EstimateHandoffError.invalid }
        let contentHash = EstimateCaptureEnvelope.imageHash(bytes)
        if let previous = entries[asset.localIdentifier] {
            guard previous.capture.contentHash == contentHash else { throw EstimateHandoffError.changedImage }
            return previous
        }
        guard pending == nil else { throw EstimateHandoffError.awaitingEstimate }
        guard entries.count < 200 else { throw EstimateHandoffError.full }
        let entry = EstimateHandoffEntry(localIdentifier: asset.localIdentifier,
            capture: EstimateCaptureEnvelope(requestId: requestID.uuidString.lowercased(), capturedAt: EstimateCaptureEnvelope.time(date), contentHash: contentHash))
        guard !entries.values.contains(where: { $0.capture.requestId == entry.capture.requestId || $0.capture.contentHash == entry.capture.contentHash }) else { throw EstimateHandoffError.invalid }
        entries[asset.localIdentifier] = entry
        return entry
    }
    public func entry(_ id: String) throws -> EstimateHandoffEntry {
        guard let entry = entries.values.first(where: { $0.capture.requestId == id }), entry.capture.isValid else { throw EstimateHandoffError.invalid }
        return entry
    }
    public mutating func handOff(_ id: String, bytes: Data) throws {
        var item = try entry(id)
        guard enabled, item.phase == .prepared else { throw EstimateHandoffError.awaitingEstimate }
        guard bytes.count >= 1000, bytes.count <= 1024 * 1024, try CloudPhotoJPEG.withoutMetadata(bytes) == bytes,
              EstimateCaptureEnvelope.imageHash(bytes) == item.capture.contentHash else { throw EstimateHandoffError.changedImage }
        item.phase = .imageHandedOff; entries[item.localIdentifier] = item
    }
    public mutating func submit(_ id: String, estimateJSON: String) throws {
        var item = try entry(id)
        guard enabled, item.phase == .imageHandedOff, !estimateJSON.isEmpty, estimateJSON.utf8.count <= 32 * 1024 else { throw EstimateHandoffError.invalid }
        let estimate = try ExternalFoodEstimate.parse(estimateJSON)
        guard let captureDate = EstimateCaptureEnvelope.date(item.capture.capturedAt),
              let estimatedDate = EstimateCaptureEnvelope.date(estimate.estimatedAt), estimatedDate >= captureDate else { throw EstimateHandoffError.invalid }
        // Freeze exact external output BEFORE transport; no automatic replay or re-estimation.
        item.estimateJSON = estimateJSON; item.phase = .importSubmitted; entries[item.localIdentifier] = item
    }
    public mutating func complete(_ id: String, receiptJSON: String) throws {
        var item = try entry(id)
        guard item.phase == .importSubmitted, receiptJSON.utf8.count <= 32 * 1024,
              Self.validReceipt(receiptJSON, capture: item.capture, estimateJSON: item.estimateJSON) else { throw EstimateHandoffError.invalid }
        item.receiptJSON = receiptJSON; item.phase = .complete; entries[item.localIdentifier] = item
    }
    private static func validReceipt(_ text: String?, capture: EstimateCaptureEnvelope, estimateJSON: String?) -> Bool {
        guard let text, let estimateJSON, let expected = try? ExternalFoodEstimate.parse(estimateJSON),
              let bytes = text.data(using: .utf8), let receipt = try? JSONDecoder().decode(EstimateImportReceipt.self, from: bytes) else { return false }
        return receipt.schemaVersion == 1 && receipt.requestId == capture.requestId && receipt.capture == capture &&
            receipt.state == "estimated_unreviewed" && receipt.canonicalChanged == false && receipt.consumption == "unknown" &&
            receipt.eventTimeMeaning == "photo_capture_only" && receipt.sourceModelVerified == false && UUID(uuidString: receipt.draftId) != nil && receipt.originalEstimate == expected
    }
}
public struct EstimateImportReceipt: Decodable, Sendable {
    public let schemaVersion: Int; public let requestId: String; public let capture: EstimateCaptureEnvelope
    public let state: String; public let canonicalChanged: Bool; public let consumption: String
    public let eventTimeMeaning: String; public let sourceModelVerified: Bool; public let draftId: String
    public let originalEstimate: ExternalFoodEstimate
}
public struct EstimateHandoffStore: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    public func lease() throws -> CloudPhotoLease { try CloudPhotoLease(directory) }
    public func load() throws -> EstimateHandoffLedger? {
        let url = directory.appendingPathComponent("external-estimate-handoff.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
        let data = try file.read(upToCount: 1024 * 1024 + 1) ?? Data()
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        guard data.count <= 1024 * 1024, let ledger = try? decoder.decode(EstimateHandoffLedger.self, from: data), ledger.isValid else { throw EstimateHandoffError.invalid }
        return ledger
    }
    public func save(_ ledger: EstimateHandoffLedger) throws {
        _ = try load() // Never replace corrupt, future or unreadable state.
        guard ledger.isValid else { throw EstimateHandoffError.invalid }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(ledger)
        guard data.count <= 1024 * 1024 else { throw EstimateHandoffError.full }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("external-estimate-handoff.json")
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
