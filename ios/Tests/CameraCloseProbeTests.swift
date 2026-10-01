import Foundation
import Testing
@testable import SociusFitAutoMealsCore

private func cameraFixture() throws -> (URL, CameraCloseProbeStore) {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return (directory, CameraCloseProbeStore(directory: directory))
}

@Test("Reading a missing observation does not create evidence")
func cameraMissingObservation() throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    #expect(store.read() == .missing)
    #expect(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
}

@Test("A successful run records entry, photo read and completion for the same run")
func cameraSuccessfulRead() async throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let runner = CameraCloseProbeRunner(store: store)
    _ = try await runner.run { .readable }
    guard case .valid(let record) = store.read() else {
        Issue.record("Expected persisted completion")
        return
    }
    #expect(record.phase == .completed)
    #expect(record.photoReadAt != nil)
    #expect(record.completedAt != nil)
}

@Test("Permission, missing photo, unavailable resource and timeout never claim a read")
func cameraFailureEvidence() async throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let runner = CameraCloseProbeRunner(store: store)
    let cases: [(CameraClosePhotoReadOutcome, CameraCloseProbePhase)] = [
        (.permissionRequired, .permissionRequired), (.noPhotos, .noPhotos),
        (.unavailable, .resourceUnavailable), (.timedOut, .timedOut)
    ]
    for (outcome, expected) in cases {
        _ = try await runner.run { outcome }
        guard case .valid(let record) = store.read() else {
            Issue.record("Expected failure evidence")
            return
        }
        #expect(record.phase == expected)
        #expect(record.photoReadAt == nil)
        #expect(record.completedAt == nil)
    }
}

@Test("Corrupt, future schema and oversized evidence is preserved")
func cameraInvalidEvidence() throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("camera-close-probe.json")
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let encoded = try encoder.encode(CameraCloseProbeRecord())
    var future = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    future["schemaVersion"] = 99
    let futureBytes = try JSONSerialization.data(withJSONObject: future)
    for bytes in [Data("broken".utf8), futureBytes, Data(repeating: 1, count: 2_049)] {
        try bytes.write(to: url)
        #expect(store.read() == .invalid)
        #expect(throws: CameraCloseProbeStoreError.self) { try store.save(CameraCloseProbeRecord()) }
        #expect(try Data(contentsOf: url) == bytes)
    }
}

private actor CameraReadGate {
    private var waiter: CheckedContinuation<Void, Never>?
    private var entered = false

    func wait() async -> CameraClosePhotoReadOutcome {
        await withCheckedContinuation { waiter = $0; entered = true }
        return .readable
    }
    func hasEntered() -> Bool { entered }
    func release() { waiter?.resume(); waiter = nil }
}

@Test("A failed write cannot return a recorded success and the runner releases its busy state")
func cameraFailedWrite() async throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let runner = CameraCloseProbeRunner(store: store)
    let url = directory.appendingPathComponent("camera-close-probe.json")
    let invalid = Data("interrupted evidence".utf8)
    do {
        _ = try await runner.run {
            try? invalid.write(to: url)
            return .readable
        }
        Issue.record("A failed evidence write must throw")
    } catch CameraCloseProbeStoreError.invalidExistingRecord {
        #expect(try Data(contentsOf: url) == invalid)
    }
    // Explicit fixture repair, not product recovery behavior.
    try FileManager.default.removeItem(at: url)
    let recovered = try await runner.run { .noPhotos }
    if case .recorded(.noPhotos) = recovered {} else { Issue.record("Runner remained busy after error") }
}

@Test("An overlapping invocation cannot replace the in-flight observation")
func cameraOverlappingInvocations() async throws {
    let (directory, store) = try cameraFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let runner = CameraCloseProbeRunner(store: store)
    let gate = CameraReadGate()
    let first = Task { try await runner.run { await gate.wait() } }
    while !(await gate.hasEntered()) { await Task.yield() }
    let before = store.read()
    let overlapping = try await runner.run { .noPhotos }
    if case .busy = overlapping {} else { Issue.record("Expected busy result") }
    #expect(store.read() == before)
    await gate.release()
    _ = try await first.value
    guard case .valid(let original) = before, case .valid(let completed) = store.read() else {
        Issue.record("Expected matching run observations")
        return
    }
    #expect(original.runID == completed.runID)
    #expect(completed.phase == .completed)
}
