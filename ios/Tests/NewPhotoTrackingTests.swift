import Foundation
import Testing
@testable import SociusFitAutoMealsCore

private func trackingFixture() throws -> (URL, NewPhotoTrackingStore) {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return (directory, NewPhotoTrackingStore(directory: directory))
}

@Test("Enrollment starts empty and cannot reset an existing checkpoint")
func trackingEnrollment() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    #expect(try store.load() == nil)
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    let baseline = try #require(store.load())
    #expect(baseline.assets.isEmpty)
    do {
        try await session.enroll(token: Data([2]))
        Issue.record("Enrollment must not reset existing tracking")
    } catch NewPhotoTrackingError.alreadyEnrolled {}
    #expect(try store.load() == baseline)
}

@Test("Multiple photos count once; video and repeated scans do not count")
func trackingMultipleAndReplay() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    let first = try await session.discover(changes: { token in
        #expect(token == Data([1]))
        return NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["photo-a", "photo-b", "video"])
    }, resolve: { ids in
        #expect(Set(ids) == ["photo-a", "photo-b", "video"])
        return ids.map { NewPhotoTrackedAsset(localIdentifier: $0, kind: $0 == "video" ? .otherMedia : .stillPhoto) }
    })
    #expect(first.newPhotos == 2)
    #expect(first.totalPhotos == 2)
    #expect(first.unresolved == 0)
    let replay = try await session.discover(changes: { token in
        #expect(token == Data([2]))
        return NewPhotoDiscoveryBatch(token: token, inserted: ["photo-a", "photo-b", "video"])
    }, resolve: { ids in
        #expect(ids.isEmpty)
        return []
    })
    #expect(replay.newPhotos == 0)
    #expect(replay.totalPhotos == 2)
}

private enum TrackingFixtureError: Error { case interrupted }

@Test("Deletion and restoration preserve final history order without duplicate counts")
func trackingRestore() throws {
    let baseline = try NewPhotoTrackingLedger(token: Data([1]))
    var first = try baseline.applying(NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["photo"]))
    first.resolve([NewPhotoTrackedAsset(localIdentifier: "photo", kind: .stillPhoto)])
    var history = NewPhotoDiscoveryBatch(token: Data([2]), inserted: [])
    history.append(token: Data([3]), inserted: [], deleted: ["photo"], updated: [])
    history.append(token: Data([4]), inserted: ["photo"], deleted: [], updated: [])
    var restoredInOneScan = try first.applying(history)
    #expect(restoredInOneScan.stillPhotoCount == 1)
    #expect(restoredInOneScan.lastNewPhotoCount == 0)
    let deleted = try first.applying(NewPhotoDiscoveryBatch(token: Data([3]), inserted: [], deleted: ["photo"]))
    var restored = try deleted.applying(NewPhotoDiscoveryBatch(token: Data([4]), inserted: [], updated: ["photo"]))
    #expect(restored.unresolvedIdentifiers == ["photo"])
    restored.resolve([NewPhotoTrackedAsset(localIdentifier: "photo", kind: .stillPhoto)])
    #expect(restored.stillPhotoCount == 1)
    #expect(restored.lastNewPhotoCount == 0)
    // A never-resolved candidate restored in the same history scan is still discovered.
    var newlyAdded = NewPhotoDiscoveryBatch(token: Data([1]), inserted: ["new-photo"])
    newlyAdded.append(token: Data([2]), inserted: [], deleted: ["new-photo"], updated: [])
    newlyAdded.append(token: Data([3]), inserted: [], deleted: [], updated: ["new-photo"])
    restoredInOneScan = try baseline.applying(newlyAdded)
    #expect(restoredInOneScan.unresolvedIdentifiers == ["new-photo"])
}

@Test("A failed completion save cannot return success or replace corrupt evidence")
func trackingFailedCompletionSave() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    let url = directory.appendingPathComponent("new-photo-tracking.json")
    let invalid = Data("external corruption".utf8)
    do {
        _ = try await session.discover(changes: { _ in
            NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["photo"])
        }, resolve: { ids in
            let checkpoint = try #require(store.load())
            #expect(checkpoint.token == Data([2]))
            #expect(checkpoint.unresolvedIdentifiers == ["photo"])
            try invalid.write(to: url)
            return ids.map { NewPhotoTrackedAsset(localIdentifier: $0, kind: .stillPhoto) }
        })
        Issue.record("A failed completion save must not return success")
    } catch NewPhotoTrackingError.invalidRecord {}
    #expect(try Data(contentsOf: url) == invalid)
}

@Test("Concurrent invocations consume consecutive checkpoints without losing candidates")
func trackingConcurrentScans() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    try await withThrowingTaskGroup(of: Int.self) { group in
        for _ in 0..<10 {
            group.addTask {
                let result = try await session.discover(changes: { token in
                    let number = token[0]
                    return NewPhotoDiscoveryBatch(token: Data([number + 1]), inserted: ["photo-\(number)"])
                }, resolve: { ids in ids.map { NewPhotoTrackedAsset(localIdentifier: $0, kind: .stillPhoto) } })
                return result.newPhotos
            }
        }
        var total = 0
        for try await count in group { total += count }
        #expect(total == 10)
    }
    let retained = try #require(store.load())
    #expect(retained.token == Data([11]))
    #expect(retained.stillPhotoCount == 10)
}

@Test("Interruption after discovery preserves candidate and checkpoint for retry")
func trackingInterruptedResolution() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    do {
        _ = try await session.discover(changes: { _ in
            NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["late-photo"])
        }, resolve: { _ in throw TrackingFixtureError.interrupted })
        Issue.record("Interrupted resolution must fail visibly")
    } catch TrackingFixtureError.interrupted {}
    let interrupted = try #require(store.load())
    #expect(interrupted.token == Data([2]))
    #expect(interrupted.unresolvedIdentifiers == ["late-photo"])
    // A fresh session represents restart after the saved discovery checkpoint.
    let restarted = NewPhotoTrackingSession(store: store)
    let recovered = try await restarted.discover(changes: { token in
        #expect(token == Data([2]))
        return NewPhotoDiscoveryBatch(token: Data([3]), inserted: [])
    }, resolve: { ids in ids.map { NewPhotoTrackedAsset(localIdentifier: $0, kind: .stillPhoto) } })
    #expect(recovered.newPhotos == 1)
    #expect(recovered.unresolved == 0)
}

@Test("Unavailable metadata stays unresolved until a later scan")
func trackingLateAvailability() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    let first = try await session.discover(changes: { _ in
        NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["late-photo"])
    }, resolve: { _ in [] })
    #expect(first.newPhotos == 0)
    #expect(first.unresolved == 1)
    let second = try await session.discover(changes: { token in
        NewPhotoDiscoveryBatch(token: token, inserted: [])
    }, resolve: { ids in ids.map { NewPhotoTrackedAsset(localIdentifier: $0, kind: .stillPhoto) } })
    #expect(second.newPhotos == 1)
    #expect(second.totalPhotos == 1)
}

@Test("History failure and capacity exhaustion preserve the prior snapshot")
func trackingDiscoveryFailures() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = NewPhotoTrackingSession(store: store)
    try await session.enroll(token: Data([1]))
    let prior = try #require(store.load())
    do {
        _ = try await session.discover(changes: { _ in throw TrackingFixtureError.interrupted }, resolve: { _ in [] })
        Issue.record("History failure must throw")
    } catch TrackingFixtureError.interrupted {}
    #expect(try store.load() == prior)
    let ids = Set((0...NewPhotoTrackingLedger.maximumAssets).map { "asset-\($0)" })
    do {
        _ = try await session.discover(changes: { _ in
            NewPhotoDiscoveryBatch(token: Data([2]), inserted: ids)
        }, resolve: { _ in Issue.record("Capacity must be checked before resolution"); return [] })
        Issue.record("Capacity failure must throw")
    } catch NewPhotoTrackingError.capacityExceeded {}
    #expect(try store.load() == prior)
}

@Test("Explicit deletion retires a candidate without pretending it was read")
func trackingDeletedCandidate() throws {
    let baseline = try NewPhotoTrackingLedger(token: Data([1]))
    var next = try baseline.applying(NewPhotoDiscoveryBatch(token: Data([2]), inserted: ["deleted-photo"], deleted: ["deleted-photo"]))
    next.resolve([NewPhotoTrackedAsset(localIdentifier: "deleted-photo", kind: .stillPhoto)])
    #expect(next.unresolvedIdentifiers.isEmpty)
    #expect(next.stillPhotoCount == 0)
    #expect(next.lastNewPhotoCount == 0)
}

@Test("Corrupt, future and oversized state is preserved during enrollment and save")
func trackingInvalidState() async throws {
    let (directory, store) = try trackingFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("new-photo-tracking.json")
    let baseline = try NewPhotoTrackingLedger(token: Data([1]))
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    var future = try #require(JSONSerialization.jsonObject(with: encoder.encode(baseline)) as? [String: Any])
    future["schemaVersion"] = 99
    for bytes in [Data("broken".utf8), try JSONSerialization.data(withJSONObject: future), Data(repeating: 1, count: NewPhotoTrackingStore.maximumBytes + 1)] {
        try bytes.write(to: url)
        #expect(throws: NewPhotoTrackingError.self) { try store.save(baseline) }
        do {
            try await NewPhotoTrackingSession(store: store).enroll(token: Data([2]))
            Issue.record("Invalid state must not be reset")
        } catch NewPhotoTrackingError.invalidRecord {}
        #expect(try Data(contentsOf: url) == bytes)
    }
}
