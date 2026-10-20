import XCTest
import ImageIO
@testable import SociusFitAutoMealsCore

final class ExternalEstimateHandoffTests: XCTestCase {
    private let date = Date(timeIntervalSince1970: 1_000)
    private func image() throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "external-estimate-synthetic", withExtension: "jpg", subdirectory: "Fixtures"))
        return try CloudPhotoJPEG.withoutMetadata(Data(contentsOf: url))
    }
    private func asset(_ name: String = "local-only-asset") -> NewPhotoTrackedAsset {
        NewPhotoTrackedAsset(localIdentifier: name, kind: .stillPhoto, capturedAt: date)
    }
    private func ledger() -> EstimateHandoffLedger { EstimateHandoffLedger(epoch: UUID(), at: date.addingTimeInterval(-1)) }
    private func estimateJSON(model: String = "synthetic") throws -> String {
        let value: [String: Any] = ["items": [["food": "Fixture", "portion": "1 unit", "protein": 0.3, "carbs": 1, "fat": 0, "calories": 10]],
            "totals": ["protein": 0.3, "carbs": 1, "fat": 0, "calories": 10], "estimatedAt": EstimateCaptureEnvelope.time(date.addingTimeInterval(1)), "model": model]
        return String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
    }
    private func receipt(_ capture: EstimateCaptureEnvelope, changed: [String: Any] = [:]) throws -> String {
        let captureValue = try JSONSerialization.jsonObject(with: JSONEncoder().encode(capture))
        var body: [String: Any] = ["schemaVersion": 1, "requestId": capture.requestId, "capture": captureValue,
            "state": "estimated_unreviewed", "canonicalChanged": false, "consumption": "unknown", "eventTimeMeaning": "photo_capture_only",
            "sourceModelVerified": false, "draftId": UUID().uuidString.lowercased(),
            "originalEstimate": try JSONSerialization.jsonObject(with: Data(estimateJSON().utf8))]
        body.merge(changed) { _, replacement in replacement }
        return String(data: try JSONSerialization.data(withJSONObject: body), encoding: .utf8)!
    }
    func testUsableSyntheticImageAndImmutableEnvelope() throws {
        let bytes = try image(), source = try XCTUnwrap(CGImageSourceCreateWithData(bytes as CFData, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        XCTAssertEqual(properties[kCGImagePropertyPixelWidth] as? Int, 64)
        XCTAssertEqual(properties[kCGImagePropertyPixelHeight] as? Int, 64)
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: bytes)
        XCTAssertEqual(entry.capture.contentHash, EstimateCaptureEnvelope.imageHash(bytes))
        XCTAssertEqual(entry.capture.capturedAt, "1970-01-01T00:16:40.000Z")
        let exposed = String(data: try JSONEncoder().encode(entry.capture), encoding: .utf8)!
        XCTAssertFalse(exposed.contains("local-only-asset")); XCTAssertFalse(exposed.contains("token")); XCTAssertFalse(exposed.contains("filename"))
        let repeated = try state.prepare(asset: asset(), bytes: bytes, requestID: UUID())
        XCTAssertEqual(repeated.capture, entry.capture)
    }
    func testChangedPixelsCannotReusePreparedCapture() throws {
        let bytes = try image(); var changed = bytes; changed[changed.count - 3] ^= 1
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: bytes), prior = state
        XCTAssertThrowsError(try state.handOff(entry.capture.requestId, bytes: changed)); XCTAssertEqual(state, prior)
        XCTAssertThrowsError(try state.prepare(asset: asset(), bytes: changed)); XCTAssertEqual(state, prior)
        try state.handOff(entry.capture.requestId, bytes: bytes)
        XCTAssertThrowsError(try state.handOff(entry.capture.requestId, bytes: bytes))
        XCTAssertEqual(try state.entry(entry.capture.requestId).phase, .imageHandedOff)
    }
    func testAdmissionBoundsAndNoSilentNewIdentityWhilePending() throws {
        let bytes = try image(); var state = ledger()
        XCTAssertThrowsError(try state.prepare(asset: NewPhotoTrackedAsset(localIdentifier: "old", kind: .stillPhoto, capturedAt: date.addingTimeInterval(-2)), bytes: bytes))
        XCTAssertThrowsError(try state.prepare(asset: NewPhotoTrackedAsset(localIdentifier: "video", kind: .otherMedia, capturedAt: date), bytes: bytes))
        XCTAssertThrowsError(try state.prepare(asset: asset(), bytes: Data(repeating: 1, count: 1024 * 1024 + 1)))
        XCTAssertThrowsError(try state.prepare(asset: asset(), bytes: Data([255, 216, 255, 217])))
        XCTAssertTrue(state.entries.isEmpty)
        let entry = try state.prepare(asset: asset(), bytes: bytes)
        XCTAssertThrowsError(try state.prepare(asset: asset("another"), bytes: bytes)); XCTAssertEqual(state.pending?.capture, entry.capture)
    }
    func testPersistentHandoffAndSubmittedEstimateSurviveRelaunch() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = EstimateHandoffStore(directory: directory), lease = try store.lease()
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: image()); try store.save(state)
        let reloaded = try XCTUnwrap(EstimateHandoffStore(directory: directory).load())
        XCTAssertEqual(reloaded, state); XCTAssertThrowsError(try store.lease())
        try state.handOff(entry.capture.requestId, bytes: image()); try store.save(state)
        let estimate = try estimateJSON(); try state.submit(entry.capture.requestId, estimateJSON: estimate); try store.save(state)
        let pending = try XCTUnwrap(store.load()).entry(entry.capture.requestId)
        XCTAssertEqual(pending.phase, .importSubmitted); XCTAssertEqual(pending.estimateJSON, estimate)
        XCTAssertThrowsError(try state.submit(entry.capture.requestId, estimateJSON: "changed"))
        XCTAssertThrowsError(try state.handOff(entry.capture.requestId, bytes: image()))
        withExtendedLifetime(lease) {}
    }
    func testReceiptBindingAndNoConsumptionUpgrade() throws {
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: image())
        try state.handOff(entry.capture.requestId, bytes: image()); try state.submit(entry.capture.requestId, estimateJSON: estimateJSON())
        let original = state
        for changed in [["canonicalChanged": true], ["consumption": "confirmed"], ["requestId": UUID().uuidString], ["sourceModelVerified": true]] as [[String: Any]] {
            XCTAssertThrowsError(try state.complete(entry.capture.requestId, receiptJSON: receipt(entry.capture, changed: changed)))
            XCTAssertEqual(state, original)
        }
        let changedCapture = EstimateCaptureEnvelope(requestId: entry.capture.requestId, capturedAt: entry.capture.capturedAt, contentHash: String(repeating: "f", count: 64))
        XCTAssertThrowsError(try state.complete(entry.capture.requestId, receiptJSON: receipt(changedCapture)))
        let changedEstimate = try JSONSerialization.jsonObject(with: Data(estimateJSON(model: "different").utf8))
        XCTAssertThrowsError(try state.complete(entry.capture.requestId, receiptJSON: receipt(entry.capture, changed: ["originalEstimate": changedEstimate])))
        let response = try receipt(entry.capture); try state.complete(entry.capture.requestId, receiptJSON: response)
        XCTAssertNil(state.pending); XCTAssertEqual(try state.entry(entry.capture.requestId).receiptJSON, response)
    }
    func testUnknownResponsePreservesOriginalForStatusOnlyRecovery() throws {
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: image())
        try state.handOff(entry.capture.requestId, bytes: image()); try state.submit(entry.capture.requestId, estimateJSON: estimateJSON())
        let submitted = state
        for response in ["unreadable", "{\"state\":\"not_found\"}", "{\"requestId\":\"wrong\"}"] {
            XCTAssertThrowsError(try state.complete(entry.capture.requestId, receiptJSON: response)); XCTAssertEqual(state, submitted)
        }
        XCTAssertEqual(state.pending?.capture.requestId, entry.capture.requestId)
    }
    func testCorruptAndFutureStateCannotBeOverwritten() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = EstimateHandoffStore(directory: directory); try store.save(ledger())
        let url = directory.appendingPathComponent("external-estimate-handoff.json")
        for corrupt in [Data("invalid state".utf8), Data("{\"schemaVersion\":2}".utf8)] {
            try corrupt.write(to: url); XCTAssertThrowsError(try store.load()); XCTAssertThrowsError(try store.save(ledger()))
            XCTAssertEqual(try Data(contentsOf: url), corrupt)
        }
    }
    func testSeparateLaneLocksAndDisableFence() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = EstimateHandoffStore(directory: directory.appendingPathComponent("external")), lease = try store.lease()
        let photo = CloudPhotoStore(directory: directory.appendingPathComponent("existing-camera")), oldLease = try photo.lease()
        let control = CloudPhotoControlStore(directory: directory.appendingPathComponent("control")), other = CloudPhotoControlStore(directory: directory.appendingPathComponent("control"))
        let epoch = try control.begin {}; try other.disable {}; XCTAssertFalse(try control.isCurrent(epoch: epoch))
        XCTAssertThrowsError(try control.activate(epoch: epoch) {})
        withExtendedLifetime((lease, oldLease)) {}
    }
    func testInvalidEnvelopeAndDisabledLedgerCannotExport() throws {
        var state = ledger(); state.enabled = false
        XCTAssertThrowsError(try state.prepare(asset: asset(), bytes: image()))
        XCTAssertFalse(EstimateCaptureEnvelope(requestId: "wrong", capturedAt: "wrong", contentHash: "wrong").isValid)
    }
    func testInvalidExternalJSONCanBeRepairedWithoutAnotherImageOrIdentity() throws {
        var state = ledger(); let entry = try state.prepare(asset: asset(), bytes: image()); try state.handOff(entry.capture.requestId, bytes: image())
        for invalid in ["{}", "```json {} ```", "{\"items\":[],\"items\":[]}", "null"] {
            XCTAssertThrowsError(try state.submit(entry.capture.requestId, estimateJSON: invalid))
            XCTAssertEqual(try state.entry(entry.capture.requestId).phase, .imageHandedOff)
        }
        try state.submit(entry.capture.requestId, estimateJSON: estimateJSON())
        XCTAssertEqual(try state.entry(entry.capture.requestId).phase, .importSubmitted)
    }
}
