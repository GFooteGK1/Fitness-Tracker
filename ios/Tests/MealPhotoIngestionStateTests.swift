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

    #expect(ledger.prepare(candidate()))
    #expect(!ledger.prepare(candidate()))

    ledger.markUploaded(contentHash: "hash-1")
    #expect(!ledger.prepare(candidate()))
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

    #expect(ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3) == nil)
    #expect(ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3) == nil)
    #expect(
        ledger.recordUploadFailure(contentHash: "hash-1", maximumAttempts: 3)
            == .uploadFailedClosed
    )
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
