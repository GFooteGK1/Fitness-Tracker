import Foundation
import Testing
@testable import SociusFitAutoMealsCore

private func candidate(hash: String = "hash-1") -> MealPhotoCandidate {
    MealPhotoCandidate(
        resourceLocalIdentifier: "asset/resource",
        contentHash: hash,
        capturedAt: Date(timeIntervalSince1970: 1_775_000_000),
        timezoneOffsetMinutes: -300
    )
}

@Test("Duplicate content cannot be prepared twice")
func duplicateContentIsRejected() {
    var ledger = MealPhotoIngestionLedger()

    let firstPreparation = ledger.prepare(candidate())
    let duplicatePreparation = ledger.prepare(candidate())
    #expect(firstPreparation)
    #expect(!duplicatePreparation)

    ledger.markUploaded(contentHash: "hash-1")
    let processedPreparation = ledger.prepare(candidate())
    #expect(!processedPreparation)
}

@Test("A successful upload removes pending state")
func successfulUploadFinishesCandidate() {
    var ledger = MealPhotoIngestionLedger()
    ledger.prepare(candidate())

    ledger.markUploaded(contentHash: "hash-1")

    #expect(ledger.pendingByHash["hash-1"] == nil)
    #expect(ledger.processedByHash["hash-1"] == .uploaded)
}

@Test("Upload retries are bounded and fail closed")
func retryExhaustionFailsClosed() {
    var ledger = MealPhotoIngestionLedger()
    ledger.prepare(candidate())

    let firstFailure = ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3)
    let secondFailure = ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3)
    let finalFailure = ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3)

    #expect(firstFailure == nil)
    #expect(secondFailure == nil)
    #expect(finalFailure == .uploadFailedClosed)
    #expect(ledger.pendingByHash["hash-1"] == nil)
}

@Test("Persistent token and ledger survive Codable round trip")
func ledgerRoundTrip() throws {
    var ledger = MealPhotoIngestionLedger()
    ledger.prepare(candidate())
    ledger.advancePersistentChangeToken(to: Data([1, 2, 3]))

    let encoded = try JSONEncoder().encode(ledger)
    let decoded = try JSONDecoder().decode(MealPhotoIngestionLedger.self, from: encoded)

    #expect(decoded == ledger)
}

@Test("Idempotency identity is device plus content hash")
func idempotencyIdentity() {
    #expect(
        MealPhotoIngestionLedger.idempotencyKey(deviceID: "device-a", contentHash: "hash-1")
            == "device-a:hash-1"
    )
}

@Test("Protocol probe accepts only a private HTTPS base URL")
func protocolProbeConfigurationRequiresPrivateHTTPS() {
    #expect(ProtocolProbeConfiguration(baseURLString: "https://probe.example.test") != nil)
    #expect(ProtocolProbeConfiguration(baseURLString: "http://probe.example.test") == nil)
    #expect(ProtocolProbeConfiguration(baseURLString: "https://example.invalid") == nil)
    #expect(ProtocolProbeConfiguration(baseURLString: "https://user:secret@probe.example.test") == nil)
    #expect(ProtocolProbeConfiguration(baseURLString: "https://probe.example.test?token=secret") == nil)
}

@Test("Protocol probe appends its isolated upload path")
func protocolProbeBuildsUploadURL() throws {
    let configuration = try #require(
        ProtocolProbeConfiguration(baseURLString: "https://probe.example.test/base")
    )

    #expect(configuration.uploadURL.absoluteString == "https://probe.example.test/base/probe/photo")
}

@Test("First protocol probe run establishes a baseline without uploading")
func protocolProbeEstablishesBaselineFirst() {
    let action = ProtocolProbeBatchPlanner.action(
        hasPersistentChangeToken: false,
        insertedAssets: [
            ProtocolProbeInsertedAsset(
                localIdentifier: "asset-1",
                capturedAt: Date(timeIntervalSince1970: 100)
            ),
        ]
    )

    #expect(action == .establishBaseline)
}

@Test("Protocol probe enqueues at most the newest inserted photo")
func protocolProbeSelectsNewestInsertedAsset() {
    let action = ProtocolProbeBatchPlanner.action(
        hasPersistentChangeToken: true,
        insertedAssets: [
            ProtocolProbeInsertedAsset(
                localIdentifier: "asset-older",
                capturedAt: Date(timeIntervalSince1970: 100)
            ),
            ProtocolProbeInsertedAsset(
                localIdentifier: "asset-newer",
                capturedAt: Date(timeIntervalSince1970: 200)
            ),
        ]
    )

    #expect(action == .enqueue(localIdentifier: "asset-newer"))
}

@Test("Protocol probe stays idle when there are no inserted photos")
func protocolProbeStaysIdleWithoutInsertedAssets() {
    #expect(
        ProtocolProbeBatchPlanner.action(
            hasPersistentChangeToken: true,
            insertedAssets: []
        ) == .noUpload
    )
}
