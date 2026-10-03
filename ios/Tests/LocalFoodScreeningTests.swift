import Foundation
import Testing
@testable import SociusFitAutoMealsCore

private func screeningFixture() throws -> (URL, FoodScreeningStore) {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return (directory, FoodScreeningStore(directory: directory))
}

private func mealResult() -> FoodScreeningResult {
    LocalFoodScreeningPolicy.evaluate(labels: [FoodScreeningLabel("food", 0.9)], supportsFood: true, isScreenshot: false)
}

@Test("Unsupported or malformed classifier output is error, never non-food")
func screeningInvalidObservations() {
    #expect(LocalFoodScreeningPolicy.evaluate(labels: [], supportsFood: false, isScreenshot: false).outcome == .error)
    for labels in [[FoodScreeningLabel("food", .nan)], [FoodScreeningLabel("food", 2)],
                   [FoodScreeningLabel("food", 0.9), FoodScreeningLabel("food", 0.1)], []] {
        #expect(LocalFoodScreeningPolicy.evaluate(labels: labels, supportsFood: true, isScreenshot: false).outcome == .error)
    }
}

@Test("Screenshot and recognized sensitive scene abstain even with strong food evidence")
func screeningSensitiveAbstention() {
    let food = [FoodScreeningLabel("food", 0.99)]
    #expect(LocalFoodScreeningPolicy.evaluate(labels: food, supportsFood: true, isScreenshot: true).outcome == .uncertain)
    for label in ["people", "document", "screen", "computer"] {
        #expect(LocalFoodScreeningPolicy.evaluate(labels: food + [FoodScreeningLabel(label, 0.3)],
            supportsFood: true, isScreenshot: false).outcome == .uncertain)
    }
}

@Test("Ambiguous or missing food evidence remains uncertain; clear non-food needs positive evidence")
func screeningDecisionBoundaries() {
    #expect(mealResult().outcome == .foodCandidate)
    #expect(LocalFoodScreeningPolicy.evaluate(labels: [FoodScreeningLabel("food", 0.4)],
        supportsFood: true, isScreenshot: false).outcome == .uncertain)
    #expect(LocalFoodScreeningPolicy.evaluate(labels: [FoodScreeningLabel("dog", 0.99)],
        supportsFood: true, isScreenshot: false).outcome == .uncertain)
    #expect(LocalFoodScreeningPolicy.evaluate(labels: [FoodScreeningLabel("food", 0.01)],
        supportsFood: true, isScreenshot: false).outcome == .uncertain)
    #expect(LocalFoodScreeningPolicy.evaluate(labels: [FoodScreeningLabel("food", 0.01), FoodScreeningLabel("dog", 0.95)],
        supportsFood: true, isScreenshot: false).outcome == .nonFood)
}

@Test("Screening requires explicit opt-in and disabled runs do not create state")
func screeningDisabled() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = LocalFoodScreeningSession(store: store)
    do {
        _ = try await session.screen(assets: []) { _ in Issue.record("Must not read photos"); return mealResult() }
        Issue.record("Disabled screening must fail")
    } catch FoodScreeningError.disabled {}
    #expect(try store.load() == nil)
}

@Test("Bounded batches persist all candidates; restart skips completed photos and excludes other media")
func screeningBatchAndRestart() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = LocalFoodScreeningSession(store: store)
    try await session.setEnabled(true)
    let assets = (0..<5).map { NewPhotoTrackedAsset(localIdentifier: "p\($0)", kind: .stillPhoto) } +
        [NewPhotoTrackedAsset(localIdentifier: "video", kind: .otherMedia), NewPhotoTrackedAsset(localIdentifier: "gone", kind: .deleted)]
    let first = try await session.screen(assets: assets) { _ in mealResult() }
    #expect(first.checked == 3 && first.pending == 2)
    #expect(try store.load()?.records.count == 5)
    let restarted = LocalFoodScreeningSession(store: store)
    let second = try await restarted.screen(assets: assets) { id in
        #expect(id == "p3" || id == "p4")
        return mealResult()
    }
    #expect(second.checked == 2 && second.pending == 0)
    let repeated = try await restarted.screen(assets: assets) { _ in Issue.record("Duplicate classification"); return mealResult() }
    #expect(repeated.checked == 0)
}

@Test("Resource errors retry three times, remain errors and do not starve new photos")
func screeningRetryBudget() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = LocalFoodScreeningSession(store: store)
    try await session.setEnabled(true)
    let asset = NewPhotoTrackedAsset(localIdentifier: "a", kind: .stillPhoto)
    for _ in 0..<3 {
        let result = try await session.screen(assets: [asset]) { _ in FoodScreeningResult(outcome: .error, reason: "local_image_unavailable") }
        #expect(result.checked == 1 && result.errors == 1)
    }
    let exhausted = try await session.screen(assets: [asset, NewPhotoTrackedAsset(localIdentifier: "b", kind: .stillPhoto)]) { id in
        #expect(id == "b"); return mealResult()
    }
    #expect(exhausted.checked == 1 && exhausted.pending == 0 && exhausted.errors == 1)
    #expect(try store.load()?.records["a"]?.attempts == 3)
}

@Test("Uncertain results are retained without automatic reclassification")
func screeningUncertainIsTerminal() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = LocalFoodScreeningSession(store: store)
    try await session.setEnabled(true)
    let assets = [NewPhotoTrackedAsset(localIdentifier: "a", kind: .stillPhoto)]
    _ = try await session.screen(assets: assets) { _ in FoodScreeningResult(outcome: .uncertain, reason: "ambiguous_scores") }
    let result = try await session.screen(assets: assets) { _ in Issue.record("Uncertain must stay local without repeated work"); return mealResult() }
    #expect(result.checked == 0)
}

@Test("Interrupted attempts survive restart; labels and disable preserve results")
func screeningInterruptedAndLabels() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    var ledger = FoodScreeningLedger()
    var record = FoodScreeningRecord(localIdentifier: "a", capturedAt: nil)
    record.attempts = 1
    ledger.records["a"] = record
    try store.save(ledger)
    let session = LocalFoodScreeningSession(store: store)
    _ = try await session.screen(assets: [NewPhotoTrackedAsset(localIdentifier: "a", kind: .stillPhoto)]) { _ in mealResult() }
    try await session.label("a", presence: .food, suitability: .suitable, split: .heldOut)
    try await session.setEnabled(false)
    let saved = try #require(try store.load())
    #expect(!saved.enabled && saved.records["a"]?.attempts == 2)
    #expect(saved.records["a"]?.presence == .food && saved.records["a"]?.split == .heldOut)
    #expect(saved.records["a"]?.result?.outcome == .foodCandidate)
}

private actor ScreeningGate {
    var entered = false
    var continuation: CheckedContinuation<Void, Never>?
    func pause() async { entered = true; await withCheckedContinuation { continuation = $0 } }
    func release() { continuation?.resume(); continuation = nil }
    func waitUntilEntered() async { while !entered { await Task.yield() } }
}

@Test("Evaluation counts pending and exhausted interrupted meals as misses without mixing splits")
func screeningEvaluationDenominators() {
    var records = (0..<5).map { index in
        var record = FoodScreeningRecord(localIdentifier: "p\(index)", capturedAt: nil)
        record.presence = .food; record.suitability = .suitable; record.split = .heldOut
        return record
    }
    records[0].result = mealResult()
    records[1].result = FoodScreeningResult(outcome: .uncertain, reason: "ambiguous_scores")
    records[2].result = FoodScreeningResult(outcome: .error, reason: "asset_unavailable")
    records[3].attempts = 3 // Interrupted with no result, and no more automatic retries.
    var falsePass = FoodScreeningRecord(localIdentifier: "nonfood", capturedAt: nil)
    falsePass.presence = .nonFood; falsePass.split = .heldOut; falsePass.result = mealResult()
    records.append(falsePass)
    let evaluation = FoodScreeningEvaluation(records: records, split: .heldOut)
    #expect(evaluation.clearMeals == 5 && evaluation.detectedMeals == 1)
    #expect(evaluation.nonFood == 1 && evaluation.falsePasses == 1 && evaluation.pendingLabels == 1)
    #expect(FoodScreeningEvaluation(records: records, split: .development).clearMeals == 0)
}

@Test("Concurrent actions and label/disable edits cannot overwrite an in-flight check")
func screeningConcurrentWriter() async throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = LocalFoodScreeningSession(store: store)
    try await session.setEnabled(true)
    let gate = ScreeningGate()
    let assets = [NewPhotoTrackedAsset(localIdentifier: "a", kind: .stillPhoto)]
    let first = Task { try await session.screen(assets: assets) { _ in await gate.pause(); return mealResult() } }
    await gate.waitUntilEntered()
    do { try await session.setEnabled(false); Issue.record("In-flight state must not be overwritten") } catch FoodScreeningError.busy {}
    do {
        _ = try await session.screen(assets: assets) { _ in Issue.record("Concurrent classification"); return mealResult() }
        Issue.record("Second invocation must be busy")
    } catch FoodScreeningError.busy {}
    do { try await session.label("a", presence: .food, suitability: .suitable, split: .development); Issue.record("Concurrent edit") } catch FoodScreeningError.busy {}
    await gate.release()
    let result = try await first.value
    #expect(result.checked == 1)
    #expect(try store.load()?.records["a"]?.attempts == 1)
}

@Test("Corrupt, oversized and future-version screening files are never overwritten")
func screeningPreserveInvalidStore() throws {
    let (directory, store) = try screeningFixture()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("local-food-screening.json")
    let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
    let valid = try encoder.encode(FoodScreeningLedger())
    var future = try #require(JSONSerialization.jsonObject(with: valid) as? [String: Any])
    future["schemaVersion"] = 99
    for data in [Data("invalid".utf8), Data(repeating: 65, count: 1_048_577), try JSONSerialization.data(withJSONObject: future)] {
        try data.write(to: url)
        do { try store.save(FoodScreeningLedger()); Issue.record("Invalid state must be preserved") } catch {}
        #expect(try Data(contentsOf: url) == data)
    }
}
