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

private func isolatedProtocolProbeStore() -> (
    store: ProtocolProbeSharedStore,
    defaults: UserDefaults,
    suiteName: String
) {
    let suiteName = "ProtocolProbeTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    return (ProtocolProbeSharedStore(defaults: defaults), defaults, suiteName)
}

@Test("Fresh canary stores its baseline before reporting ready")
func freshCanaryStoresBaseline() throws {
    let fixture = isolatedProtocolProbeStore()
    defer {
        fixture.defaults.removePersistentDomain(forName: fixture.suiteName)
    }
    let tokenData = Data([7, 8, 9])
    let preparedAt = Date(timeIntervalSince1970: 1_777_000_000)

    try fixture.store.prepareFreshCanary(tokenData: tokenData, at: preparedAt)

    #expect(fixture.store.loadPersistentChangeTokenData() == tokenData)
    let diagnostics = try #require(fixture.store.readDiagnostics().snapshot)
    #expect(diagnostics.phase == .readyForCapture)
    #expect(diagnostics.hasBaselineToken)
    #expect(diagnostics.lastUpdatedAt == preparedAt)
    #expect(diagnostics.invocationCount == 0)
    #expect(diagnostics.canaryPreparedAt == preparedAt)
}

@Test("Snapshot reads classify evidence and preserve invalid bytes on ordinary updates")
func diagnosticReadStatesPreserveEvidence() throws {
    let fixture = isolatedProtocolProbeStore()
    defer { fixture.defaults.removePersistentDomain(forName: fixture.suiteName) }
    let token = Data([12, 34])
    fixture.store.savePersistentChangeTokenData(token)
    #expect(fixture.store.readDiagnostics() == .missing)
    #expect(fixture.store.readDiagnostics().snapshot == nil)
    #expect(fixture.store.updateDiagnostics { $0.phase = .disabled } == .skipped(.missing))
    #expect(fixture.store.readDiagnostics() == .missing)

    let cases: [(Any, ProtocolProbeDiagnosticsRead)] = [
        ("wrong type", .wrongType),
        (Data("broken".utf8), .corrupt),
        (Data("{\"schemaVersion\":1}".utf8), .corrupt),
        (Data("{\"schemaVersion\":99,\"phase\":[]}".utf8), .unsupportedSchema(99))
    ]
    for (value, expected) in cases {
        fixture.defaults.set(value, forKey: "ProtocolProbe.Diagnostics")
        #expect(fixture.store.readDiagnostics() == expected)
        #expect(fixture.store.readDiagnostics().snapshot == nil)
        let outcome = fixture.store.updateDiagnostics(initializeIfMissing: true) {
            $0.beginInvocation(hasBaselineToken: true, at: Date())
        }
        #expect(outcome == .skipped(expected))
        if let bytes = value as? Data {
            #expect(fixture.defaults.data(forKey: "ProtocolProbe.Diagnostics") == bytes)
        } else {
            #expect(fixture.defaults.string(forKey: "ProtocolProbe.Diagnostics") == "wrong type")
        }
        #expect(fixture.store.loadPersistentChangeTokenData() == token)
    }
    let date = Date(timeIntervalSince1970: 1_777_000_000)
    try fixture.store.prepareFreshCanary(tokenData: token, at: date)
    #expect(fixture.store.readDiagnostics().snapshot?.canaryPreparedAt == date)
    #expect(fixture.store.readDiagnostics().snapshot?.invocationCount == 0)
}

@Test("Both historical schema-1 builds remain readable with unknown canary provenance")
func historicalSnapshotVersions() throws {
    let fixture = isolatedProtocolProbeStore()
    defer { fixture.defaults.removePersistentDomain(forName: fixture.suiteName) }
    for includesInitialization in [false, true] {
        var snapshot = ProtocolProbeDiagnostics()
        if includesInitialization { snapshot.lastInitializationAt = Date(timeIntervalSince1970: 123) }
        try fixture.store.saveDiagnostics(snapshot)
        let read = try #require(fixture.store.readDiagnostics().snapshot)
        #expect(read == snapshot)
        #expect(read.canaryPreparedAt == nil)
    }
}

@Test("A diagnostic encoding failure is observational and preserves the previous value")
func diagnosticEncodingFailureIsNonfatal() throws {
    let fixture = isolatedProtocolProbeStore()
    defer { fixture.defaults.removePersistentDomain(forName: fixture.suiteName) }
    try fixture.store.prepareFreshCanary(tokenData: Data([1]))
    let previous = fixture.defaults.data(forKey: "ProtocolProbe.Diagnostics")
    let outcome = fixture.store.updateDiagnostics { $0.lastUpdatedAt = Date(timeIntervalSince1970: .infinity) }
    #expect(outcome == .encodingFailed)
    #expect(fixture.defaults.data(forKey: "ProtocolProbe.Diagnostics") == previous)
    #expect(fixture.store.loadPersistentChangeTokenData() == Data([1]))
}

@Test("Extension invocation increments shared diagnostics and preserves baseline state")
func extensionInvocationIsShared() throws {
    let fixture = isolatedProtocolProbeStore()
    defer {
        fixture.defaults.removePersistentDomain(forName: fixture.suiteName)
    }
    try fixture.store.prepareFreshCanary(tokenData: Data([1]))
    let invokedAt = Date(timeIntervalSince1970: 1_777_000_100)

    fixture.store.updateDiagnostics(initializeIfMissing: true) {
        $0.beginInvocation(hasBaselineToken: true, at: invokedAt)
    }

    let diagnostics = try #require(fixture.store.readDiagnostics().snapshot)
    #expect(diagnostics.phase == .extensionInvoked)
    #expect(diagnostics.invocationCount == 1)
    #expect(diagnostics.hasBaselineToken)
    #expect(diagnostics.lastInvocationAt == invokedAt)
}

@Test("Finished job records only sanitized result fields")
func finishedJobRecordsSanitizedResult() throws {
    let fixture = isolatedProtocolProbeStore()
    defer {
        fixture.defaults.removePersistentDomain(forName: fixture.suiteName)
    }

    fixture.store.updateDiagnostics(initializeIfMissing: true) {
        $0.recordJobResult(
            state: "failed",
            requestID: "receipt-123",
            errorDomain: "PHPhotosErrorDomain",
            errorCode: 42,
            at: Date(timeIntervalSince1970: 1_777_000_200)
        )
    }

    let diagnostics = try #require(fixture.store.readDiagnostics().snapshot)
    #expect(diagnostics.phase == .jobResultObserved)
    #expect(diagnostics.lastJobState == "failed")
    #expect(diagnostics.lastRequestID == "receipt-123")
    #expect(diagnostics.lastErrorDomain == "PHPhotosErrorDomain")
    #expect(diagnostics.lastErrorCode == 42)
}

@Test("Diagnostic snapshot excludes private photo and endpoint metadata")
func diagnosticsExcludePrivateMetadata() throws {
    var diagnostics = ProtocolProbeDiagnostics()
    diagnostics.beginInvocation(hasBaselineToken: true, at: Date())
    diagnostics.mark(
        phase: .jobRegistered,
        at: Date(),
        insertedPhotoCount: 1,
        originalResourceAvailable: true,
        jobRegistered: true
    )

    let encoded = try JSONEncoder().encode(diagnostics)
    let payload = String(decoding: encoded, as: UTF8.self)
    for forbidden in [
        "IMG_0042.HEIC",
        "asset-local-identifier",
        "33.0198,-96.6989",
        "https://private-probe.example.test",
    ] {
        #expect(!payload.contains(forbidden))
    }
}

@Test("Build 5 diagnostics decode without a startup timestamp")
func legacyDiagnosticsRemainReadable() throws {
    var legacy = ProtocolProbeDiagnostics()
    legacy.prepareFreshCanary(at: Date(timeIntervalSince1970: 1_777_000_000))
    legacy.canaryPreparedAt = nil
    let encoded = try JSONEncoder().encode(legacy)
    var payload = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    payload.removeValue(forKey: "lastInitializationAt")
    let decoded = try JSONDecoder().decode(
        ProtocolProbeDiagnostics.self,
        from: JSONSerialization.data(withJSONObject: payload)
    )
    #expect(decoded == legacy)
    #expect(decoded.lastInitializationAt == nil)
    #expect(decoded.phase == .readyForCapture)
}

@Test("Initialization evidence survives reads without claiming a processing invocation")
func initializationDoesNotClaimProcessing() throws {
    let fixture = isolatedProtocolProbeStore()
    defer {
        fixture.defaults.removePersistentDomain(forName: fixture.suiteName)
    }
    let baseline = Data([4, 5, 6])
    let preparedAt = Date(timeIntervalSince1970: 1_777_000_000)
    let initializedAt = preparedAt.addingTimeInterval(60)
    try fixture.store.prepareFreshCanary(tokenData: baseline, at: preparedAt)
    fixture.store.updateDiagnostics(initializeIfMissing: true) { $0.lastInitializationAt = initializedAt }

    let diagnostics = try #require(fixture.store.readDiagnostics().snapshot)
    #expect(diagnostics.lastInitializationAt == initializedAt)
    #expect(diagnostics.invocationCount == 0)
    #expect(diagnostics.lastInvocationAt == nil)
    #expect(diagnostics.lastUpdatedAt == preparedAt)
    #expect(diagnostics.phase == .readyForCapture)
    #expect(!diagnostics.jobRegistered)
    #expect(fixture.store.loadPersistentChangeTokenData() == baseline)
    #expect(fixture.store.readDiagnostics().snapshot == diagnostics)

    fixture.store.updateDiagnostics(initializeIfMissing: true) {
        $0.beginInvocation(hasBaselineToken: true, at: initializedAt.addingTimeInterval(1))
    }
    #expect(fixture.store.readDiagnostics().snapshot?.lastInitializationAt == initializedAt)
    #expect(fixture.store.readDiagnostics().snapshot?.invocationCount == 1)
}
