import XCTest
@testable import SociusFitAutoMealsCore

final class CloudPhotoQueueTests: XCTestCase {
    private let origin = URL(string:"https://fitness-tracker.vercel.app")!
    private func queue() throws -> CloudPhotoQueue { try CloudPhotoQueue(deviceID:UUID(),origin:origin,enabledAt:Date(timeIntervalSince1970:100),expiresAt:Date(timeIntervalSince1970:1000)) }
    func testNoBackfillAndVideos() throws {
        var q=try queue()
        try q.admit([NewPhotoTrackedAsset(localIdentifier:"old",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:99)),NewPhotoTrackedAsset(localIdentifier:"video",kind:.otherMedia,capturedAt:Date(timeIntervalSince1970:101)),NewPhotoTrackedAsset(localIdentifier:"new",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101))])
        XCTAssertEqual(Set(q.entries.keys),["new"])
        let id=q.next!.requestID;try q.admit([NewPhotoTrackedAsset(localIdentifier:"new",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101))]);XCTAssertEqual(q.next!.requestID,id)
    }
    func testCrashReconciliationNeverReturnsSubmittedToQueued() throws {
        var q=try queue();try q.admit([NewPhotoTrackedAsset(localIdentifier:"one",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101))]);let id=q.next!.requestID
        try q.submitted("one",hash:String(repeating:"a",count:64));XCTAssertEqual(q.next!.phase,.submitted)
        XCTAssertThrowsError(try q.submitted("one",hash:String(repeating:"a",count:64)))
        XCTAssertThrowsError(try q.complete("one",requestID:UUID(),outcome:"draft"))
        try q.complete("one",requestID:id,outcome:"draft");XCTAssertNil(q.next)
    }
    func testCapacityPreservesSnapshot() throws {
        var q=try queue();let prior=q
        XCTAssertThrowsError(try q.admit((0...200).map{NewPhotoTrackedAsset(localIdentifier:"p\($0)",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101))}))
        XCTAssertEqual(q,prior)
    }
    func testOriginRestrictions() {
        for url in ["http://fitness-tracker.vercel.app","https://evil.example","https://fitness-tracker.vercel.app@evil.example","https://fitness-tracker.vercel.app/?token=secret","https://fitness-tracker.vercel.app:444"] { XCTAssertFalse(CloudPhotoQueue.allowedOrigin(URL(string:url)!)) }
    }
    func testLeaseAndDurableSubmittedIdentity() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store=CloudPhotoStore(directory:directory)
        let lease=try store.lease()
        XCTAssertThrowsError(try store.lease())
        var q=try queue();try q.admit([NewPhotoTrackedAsset(localIdentifier:"one",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101))]);try q.submitted("one",hash:String(repeating:"b",count:64));try store.save(q)
        XCTAssertEqual(try store.load(),q)
        withExtendedLifetime(lease) {}
    }

    func testFreshCloudCheckpointIgnoresPriorFutureDateAssetUpdates() throws {
        // Probe history is separate. Cloud discovery begins at a new token.
        let old = NewPhotoTrackedAsset(localIdentifier:"pre-pairing",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:500))
        var probe = try NewPhotoTrackingLedger(token:Data([1]))
        probe = try probe.applying(NewPhotoDiscoveryBatch(token:Data([2]),inserted:[old.localIdentifier]))
        probe.resolve([old])
        let priorProbe = probe
        var cloud = try NewPhotoTrackingLedger(token:Data([3]),at:Date(timeIntervalSince1970:100))
        cloud = try cloud.applying(NewPhotoDiscoveryBatch(token:Data([4]),inserted:["new","imported"],updated:[old.localIdentifier]))
        cloud.resolve([old,NewPhotoTrackedAsset(localIdentifier:"new",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:101)),NewPhotoTrackedAsset(localIdentifier:"imported",kind:.stillPhoto,capturedAt:Date(timeIntervalSince1970:99))])
        var q=try queue();try q.admit(Array(cloud.assets.values))
        XCTAssertEqual(Set(q.entries.keys),["new"])
        XCTAssertEqual(probe,priorProbe)
        XCTAssertNil(cloud.assets[old.localIdentifier])
    }

    func testDisableInvalidatesPairingAcrossControlStoreInstances() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let first=CloudPhotoControlStore(directory:directory), second=CloudPhotoControlStore(directory:directory)
        let enrollment=try first.enrollmentLease()
        XCTAssertThrowsError(try second.enrollmentLease())
        let epoch=try first.begin {}
        var credentialSaved=false
        _ = try second.disable { true }
        XCTAssertThrowsError(try first.activate(epoch:epoch) { credentialSaved=true })
        XCTAssertFalse(credentialSaved)
        // A subsequent pairing must use the new persisted epoch.
        let newEpoch=try second.begin {}
        XCTAssertNotEqual(epoch,newEpoch)
        try second.activate(epoch:newEpoch) { credentialSaved=true }
        XCTAssertTrue(credentialSaved)
        withExtendedLifetime(enrollment) {}
    }

    func testCorruptControlEvidenceCannotBeResetByPairOrDisable() throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let control=CloudPhotoControlStore(directory:directory)
        _ = try control.begin {}
        let url=directory.appendingPathComponent("epoch.json")
        let corrupt=Data("unreadable control".utf8)
        try corrupt.write(to:url)
        XCTAssertThrowsError(try control.begin {})
        XCTAssertThrowsError(try control.disable {})
        XCTAssertEqual(try Data(contentsOf:url),corrupt)
    }

    func testMetadataBetweenScansIsStrippedWithoutDiscardingScanBytes() throws {
        let encoded=Data([255,216,255,218,0,2,1,255,0,2,255,208,3,255,225,0,4,9,9,255,218,0,2,4,255,217])
        let expected=Data([255,216,255,218,0,2,1,255,0,2,255,208,3,255,218,0,2,4,255,217])
        XCTAssertEqual(try CloudPhotoJPEG.withoutMetadata(encoded),expected)
        XCTAssertThrowsError(try CloudPhotoJPEG.withoutMetadata(Data([255,216,255,225,255,255])))
    }
}
