import XCTest
@testable import SociusFitAutoMealsCore

final class LocalSceneGuardTests: XCTestCase {
    private func clear() -> LocalSceneEvidence {
        LocalSceneEvidence(completed: true, reason: "test_geometry", stages: LocalScenePolicy.requiredStages)
    }
    func testMissingFailedAndPartialEvidenceAbstains() {
        let cases: [LocalSceneEvidence?] = [nil, LocalSceneEvidence(completed: false, reason: "failed"),
                      LocalSceneEvidence(completed: true, reason: "partial", stages: ["face"])]
        for scene in cases {
            XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: 10, contextMargin: -1, scene: scene,
                isScreenshot: false).reason, "scene_evidence_unavailable")
        }
    }
    func testEachHumanGeometryStageAbstains() {
        for counts in [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]] {
            let evidence = LocalSceneEvidence(completed: true, reason: "test", stages: LocalScenePolicy.requiredStages,
                faceCount: counts[0], humanRectangleCount: counts[1], bodyPoseCount: counts[2], handPoseCount: counts[3])
            XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: 10, contextMargin: -1, scene: evidence,
                isScreenshot: false).reason, "human_geometry")
        }
    }
    func testScreenshotAndContextAbstention() {
        XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: .nan, contextMargin: .nan, scene: nil,
            isScreenshot: true).reason, "screenshot")
        XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: 4, contextMargin: 0, scene: clear(),
            isScreenshot: false).reason, "context_similarity")
    }
    func testFiniteScoresAndFoodBoundaries() {
        XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: .infinity, contextMargin: -1, scene: clear(),
            isScreenshot: false).outcome, .error)
        for (margin, outcome) in [(Float(1), FoodScreeningOutcome.foodCandidate), (-1, .nonFood), (0, .uncertain)] {
            XCTAssertEqual(LocalScenePolicy.evaluate(foodMargin: margin, contextMargin: -1, scene: clear(),
                isScreenshot: false).outcome, outcome)
        }
    }
    func testInvalidCountsAndRepeatedStagesRejected() {
        XCTAssertFalse(LocalSceneEvidence(completed: true, reason: "invalid", stages: LocalScenePolicy.requiredStages,
            faceCount: -1).isValid)
        XCTAssertFalse(LocalSceneEvidence(completed: true, reason: "invalid",
            stages: LocalScenePolicy.requiredStages + ["face"]).isValid)
    }
}
