import Foundation

public struct ExternalEstimatedItem: Codable, Equatable, Sendable {
    public let food: String; public let portion: String
    public let protein: Double; public let carbs: Double; public let fat: Double; public let calories: Double
}
public struct ExternalEstimatedTotals: Codable, Equatable, Sendable {
    public let protein: Double; public let carbs: Double; public let fat: Double; public let calories: Double
}
public struct ExternalFoodEstimate: Codable, Equatable, Sendable {
    public let items: [ExternalEstimatedItem]; public let totals: ExternalEstimatedTotals
    public let estimatedAt: String; public let model: String
    public static func parse(_ raw: String) throws -> Self {
        guard !raw.isEmpty, raw.utf8.count <= 32 * 1024, let data = raw.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == ["items", "totals", "estimatedAt", "model"],
              let items = object["items"] as? [[String: Any]], (1...20).contains(items.count),
              let totals = object["totals"] as? [String: Any], Set(totals.keys) == ["protein", "carbs", "fat", "calories"],
              items.allSatisfy({ Set($0.keys) == ["food", "portion", "protein", "carbs", "fat", "calories"] }) else { throw EstimateHandoffError.invalid }
        var scanner = EstimateJSONKeys(bytes: Array(data)); try scanner.value(depth: 0)
        let estimate = try JSONDecoder().decode(Self.self, from: data)
        guard validText(estimate.model, limit: 128),
              estimate.estimatedAt.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$"#, options: .regularExpression) != nil else { throw EstimateHandoffError.invalid }
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let ordinary = ISO8601DateFormatter(); ordinary.formatOptions = [.withInternetDateTime]
        guard let date = fractional.date(from: estimate.estimatedAt) ?? ordinary.date(from: estimate.estimatedAt),
              EstimateCaptureEnvelope.time(date).prefix(19) == estimate.estimatedAt.prefix(19) else { throw EstimateHandoffError.invalid }
        var protein = 0, carbs = 0, fat = 0, calories = 0
        for item in estimate.items {
            guard validText(item.food, limit: 256), validText(item.portion, limit: 128) else { throw EstimateHandoffError.invalid }
            protein += try mills(item.protein, maximum: 500); carbs += try mills(item.carbs, maximum: 1000)
            fat += try mills(item.fat, maximum: 500); calories += try mills(item.calories, maximum: 10000)
        }
        guard try mills(estimate.totals.protein, maximum: 1000) == protein,
              try mills(estimate.totals.carbs, maximum: 2000) == carbs,
              try mills(estimate.totals.fat, maximum: 1000) == fat,
              try mills(estimate.totals.calories, maximum: 20000) == calories else { throw EstimateHandoffError.invalid }
        return Self(items: estimate.items, totals: estimate.totals, estimatedAt: EstimateCaptureEnvelope.time(date), model: estimate.model)
    }
    private static func mills(_ value: Double, maximum: Double) throws -> Int {
        guard value.isFinite, value >= 0, value <= maximum, value == (value * 1000).rounded() / 1000 else { throw EstimateHandoffError.invalid }
        return Int((value * 1000).rounded())
    }
    private static func validText(_ value: String, limit: Int) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))).isEmpty && value.utf8.count <= limit && !value.unicodeScalars.contains { $0.value == 0 }
    }
}

/// JSONSerialization has already validated grammar. This bounded pass detects
/// duplicate decoded keys before Foundation can silently replace their values.
private struct EstimateJSONKeys {
    let bytes: [UInt8]; var position = 0
    mutating func whitespace() { while position < bytes.count && [9, 10, 13, 32].contains(bytes[position]) { position += 1 } }
    mutating func string() throws -> String {
        let start = position; position += 1
        while position < bytes.count {
            if bytes[position] == 92 { position += 2; continue }
            position += 1
            if bytes[position - 1] == 34 { return try JSONDecoder().decode(String.self, from: Data(bytes[start..<position])) }
        }
        throw EstimateHandoffError.invalid
    }
    mutating func value(depth: Int) throws {
        guard depth <= 12 else { throw EstimateHandoffError.invalid }; whitespace()
        guard position < bytes.count else { throw EstimateHandoffError.invalid }
        if bytes[position] == 123 {
            position += 1; whitespace(); var seen = Set<String>()
            while bytes[position] != 125 {
                let key = try string(); guard seen.insert(key).inserted else { throw EstimateHandoffError.invalid }
                whitespace(); position += 1; try value(depth: depth + 1); whitespace()
                if bytes[position] != 44 { break }; position += 1; whitespace()
            }
            position += 1; return
        }
        if bytes[position] == 91 {
            position += 1; whitespace()
            while bytes[position] != 93 {
                try value(depth: depth + 1); whitespace()
                if bytes[position] != 44 { break }; position += 1
            }
            position += 1; return
        }
        if bytes[position] == 34 { _ = try string(); return }
        while position < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[position]) { position += 1 }
    }
}
