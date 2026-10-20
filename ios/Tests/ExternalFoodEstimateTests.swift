import XCTest
@testable import SociusFitAutoMealsCore

final class ExternalFoodEstimateTests: XCTestCase {
    private var valid: String { #"{"items":[{"food":"Fixture","portion":"1 unit","protein":0.1,"carbs":0.2,"fat":0,"calories":10},{"food":"Fixture2","portion":"1 unit","protein":0.2,"carbs":0.1,"fat":0,"calories":10}],"totals":{"protein":0.3,"carbs":0.3,"fat":0,"calories":20},"estimatedAt":"2026-10-20T12:00:01Z","model":"unknown"}"# }
    func testExactDecimalTotalsAndUnverifiedMetadata() throws {
        let parsed = try ExternalFoodEstimate.parse(valid)
        XCTAssertEqual(parsed.totals.protein, 0.3); XCTAssertEqual(parsed.estimatedAt, "2026-10-20T12:00:01.000Z")
        XCTAssertEqual(parsed.model, "unknown")
    }
    func testInvalidNumbersTotalsAndAuthorityFields() {
        for value in ["true", "null", "-1", "1e999", "0.00000000001", "0.0001", "10001", "\"1\""] {
            XCTAssertThrowsError(try ExternalFoodEstimate.parse(valid.replacingOccurrences(of: "\"calories\":10", with: "\"calories\":\(value)")))
        }
        XCTAssertThrowsError(try ExternalFoodEstimate.parse(valid.replacingOccurrences(of: "\"protein\":0.3", with: "\"protein\":0.301")))
        XCTAssertThrowsError(try ExternalFoodEstimate.parse(valid.replacingOccurrences(of: "\"model\":\"unknown\"", with: "\"model\":\"unknown\",\"consumed\":true")))
    }
    func testDuplicateKeysProseAndUnknownCalendarFailClosed() {
        XCTAssertThrowsError(try ExternalFoodEstimate.parse(valid.replacingOccurrences(of: "\"model\":\"unknown\"", with: "\"model\":\"first\",\"\\u006dodel\":\"second\"")))
        XCTAssertThrowsError(try ExternalFoodEstimate.parse("```json\n" + valid + "\n```"))
        XCTAssertThrowsError(try ExternalFoodEstimate.parse(valid.replacingOccurrences(of: "2026-10-20", with: "2026-02-30")))
        XCTAssertThrowsError(try ExternalFoodEstimate.parse(String(repeating: " ", count: 32769) + valid))
    }
}
