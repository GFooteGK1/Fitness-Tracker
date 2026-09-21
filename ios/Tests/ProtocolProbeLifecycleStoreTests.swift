import Foundation
import Testing
@testable import SociusFitAutoMealsCore

private struct LifecycleFixture {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let date = Date(timeIntervalSince1970: 1_777_000_000)
    let identity = ProtocolProbeBuildIdentity(version: "0.1.0", build: "candidate")

    var store: ProtocolProbeLifecycleStore {
        let date = date
        return ProtocolProbeLifecycleStore(containerURL: root, identity: identity, clock: { date })
    }

    func url(_ event: ProtocolProbeLifecycleEvent) -> URL {
        root.appendingPathComponent(ProtocolProbeLifecycleStore.directoryName).appendingPathComponent(event.filename)
    }

    func clean() { try? FileManager.default.removeItem(at: root) }
}

@Test("Lifecycle slots round-trip, replace atomically, and preserve other event evidence")
func lifecycleRoundTripAndIndependentSlots() throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    let store = fixture.store
    #expect(store.read(.initialized) == .missing)
    #expect(!FileManager.default.fileExists(atPath: fixture.root.path))
    // Missing parent and missing slot in an existing directory are both absence,
    // not storage failures. Reading either must not create the slot.
    try FileManager.default.createDirectory(
        at: fixture.url(.initialized).deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    #expect(store.read(.initialized) == .missing)
    #expect(!FileManager.default.fileExists(atPath: fixture.url(.initialized).path))
    for event in ProtocolProbeLifecycleEvent.allCases {
        #expect(store.record(event) == .written)
        guard case .valid(let record) = store.read(event) else {
            Issue.record("Expected valid lifecycle evidence")
            return
        }
        #expect(record.event == event)
        #expect(record.timestamp == fixture.date)
        #expect(record.version == fixture.identity.version)
        #expect(record.build == fixture.identity.build)
        let data = try Data(contentsOf: fixture.url(event))
        #expect(data.count <= ProtocolProbeLifecycleStore.maximumRecordBytes)
        let payload = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(payload.keys) == Set(["schemaVersion", "event", "timestamp", "version", "build"]))
        #expect((payload["timestamp"] as? String)?.hasSuffix("Z") == true)
    }
    let process = try Data(contentsOf: fixture.url(.processEntered))
    let termination = try Data(contentsOf: fixture.url(.terminationRequested))
    let later = ProtocolProbeLifecycleStore(
        containerURL: fixture.root,
        identity: ProtocolProbeBuildIdentity(version: "0.1.1", build: "next"),
        clock: { Date(timeIntervalSince1970: 1_777_000_100) }
    )
    for _ in 0..<50 { #expect(later.record(.initialized) == .written) }
    #expect(try Data(contentsOf: fixture.url(.processEntered)) == process)
    #expect(try Data(contentsOf: fixture.url(.terminationRequested)) == termination)
    let files = try FileManager.default.contentsOfDirectory(atPath: fixture.url(.initialized).deletingLastPathComponent().path)
    #expect(Set(files) == Set(ProtocolProbeLifecycleEvent.allCases.map(\.filename)))
    guard case .valid(let replacement) = later.read(.initialized) else {
        Issue.record("Expected complete replacement")
        return
    }
    #expect(replacement.build == "next")
}

@Test("Lifecycle readers bound input and classify malformed, mismatched, and future records")
func lifecycleInvalidRecords() throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    #expect(fixture.store.record(.initialized) == .written)
    let valid = try Data(contentsOf: fixture.url(.initialized))
    let cases: [(Data, ProtocolProbeLifecycleRead)] = [
        (Data(repeating: 32, count: ProtocolProbeLifecycleStore.maximumRecordBytes + 1), .oversized),
        (Data(repeating: 32, count: ProtocolProbeLifecycleStore.maximumRecordBytes), .corrupt),
        (Data("bad json".utf8), .corrupt),
        (Data("{\"schemaVersion\":42,\"event\":[]}".utf8), .unsupportedSchema(42)),
        (Data("{\"schemaVersion\":1,\"event\":\"unexpected\"}".utf8), .corrupt)
    ]
    for (data, expected) in cases {
        try data.write(to: fixture.url(.initialized))
        #expect(fixture.store.read(.initialized) == expected)
    }
    try valid.write(to: fixture.url(.processEntered))
    #expect(fixture.store.read(.processEntered) == .corrupt)
    var payload = try #require(JSONSerialization.jsonObject(with: valid) as? [String: Any])
    payload["version"] = String(repeating: "a", count: 65)
    try JSONSerialization.data(withJSONObject: payload).write(to: fixture.url(.initialized))
    #expect(fixture.store.read(.initialized) == .corrupt)
}

@Test("Build strings are capped and sanitized before persistence")
func lifecycleBuildBounds() throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    let store = ProtocolProbeLifecycleStore(containerURL: fixture.root, identity: .init(
        version: String(repeating: "v", count: 10_000), build: "\n/🙂"
    ))
    #expect(store.record(.initialized) == .written)
    guard case .valid(let record) = store.read(.initialized) else {
        Issue.record("Expected bounded record")
        return
    }
    #expect(record.version.utf8.count == 64)
    #expect(record.build == "unknown")
}

@Test("Lifecycle failures are nonthrowing and leave earlier evidence intact")
func lifecycleWriteFailurePreservesEvidence() throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    #expect(fixture.store.record(.initialized) == .written)
    let previous = try Data(contentsOf: fixture.url(.initialized))
    let failing = ProtocolProbeLifecycleStore(containerURL: fixture.root, writer: { _, _ in
        throw NSError(domain: "fixture-private-path", code: 17)
    })
    #expect(failing.record(.initialized) == .failed(17))
    #expect(try Data(contentsOf: fixture.url(.initialized)) == previous)
    let unavailable = ProtocolProbeLifecycleStore(containerURL: nil)
    #expect(unavailable.read(.initialized) == .unavailable)
    #expect(unavailable.record(.initialized) == .unavailable)

    // A regular file as the container deterministically exercises I/O failure,
    // independent of the test runner's permission privileges.
    let invalidRoot = fixture.root.appendingPathComponent("not-a-directory")
    try Data([1]).write(to: invalidRoot)
    let invalid = ProtocolProbeLifecycleStore(containerURL: invalidRoot)
    guard case .failed = invalid.record(.initialized) else {
        Issue.record("Expected directory creation failure")
        return
    }
    guard case .readFailed = invalid.read(.initialized) else {
        Issue.record("Expected sanitized I/O failure")
        return
    }
    #expect(try Data(contentsOf: invalidRoot) == Data([1]))
}

@Test("Concurrent same-slot writers leave one bounded complete record")
func lifecycleConcurrentWriters() async throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    let root = fixture.root
    let outcomes = await withTaskGroup(of: ProtocolProbeLifecycleWrite.self) { group in
        for index in 0..<30 {
            group.addTask {
                ProtocolProbeLifecycleStore(containerURL: root, identity: .init(
                    version: "0.1.0", build: String(index)
                )).record(.processEntered)
            }
        }
        var outcomes: [ProtocolProbeLifecycleWrite] = []
        for await outcome in group { outcomes.append(outcome) }
        return outcomes
    }
    #expect(outcomes.allSatisfy { $0 == .written })
    guard case .valid(let record) = fixture.store.read(.processEntered) else {
        Issue.record("Expected one complete record; no ordering claim")
        return
    }
    #expect((0..<30).map(String.init).contains(record.build))
    #expect(try Data(contentsOf: fixture.url(.processEntered)).count <= 2_048)
}

@Test("Host-style reads, canary reset, and disable updates preserve lifecycle bytes and tokens")
func hostOperationsPreserveLifecycle() throws {
    let fixture = LifecycleFixture()
    defer { fixture.clean() }
    for event in ProtocolProbeLifecycleEvent.allCases { #expect(fixture.store.record(event) == .written) }
    let previous = try ProtocolProbeLifecycleEvent.allCases.map { try Data(contentsOf: fixture.url($0)) }
    let suite = "LifecycleHostTests.\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let shared = ProtocolProbeSharedStore(defaults: defaults)
    let token = Data([8, 9])
    shared.savePersistentChangeTokenData(token)
    #expect(shared.readDiagnostics().snapshot == nil)
    try shared.prepareFreshCanary(tokenData: token, at: fixture.date)
    shared.updateDiagnostics { $0.mark(phase: .disabled, at: fixture.date) }
    let hostReader = fixture.store
    for (index, event) in ProtocolProbeLifecycleEvent.allCases.enumerated() {
        _ = hostReader.read(event)
        #expect(try Data(contentsOf: fixture.url(event)) == previous[index])
    }
    #expect(shared.loadPersistentChangeTokenData() == token)
}

@Test("Lifecycle provenance distinguishes historical and unknown canary relationships")
func lifecycleProvenance() {
    let record = ProtocolProbeLifecycleRecord(schemaVersion: 1, event: .initialized,
        timestamp: Date(timeIntervalSince1970: 100), version: "0.1.0", build: "6")
    let current = ProtocolProbeBuildIdentity(version: "0.1.0", build: "candidate")
    #expect(record.provenance(current: current, canaryPreparedAt: nil).contains("unknown"))
    #expect(record.provenance(current: current, canaryPreparedAt: nil).contains("different build"))
    #expect(record.provenance(current: current, canaryPreparedAt: Date(timeIntervalSince1970: 101)).contains("before canary"))
    #expect(record.provenance(current: current, canaryPreparedAt: Date(timeIntervalSince1970: 99)).contains("by device clock"))
}
