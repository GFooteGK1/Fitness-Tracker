import Foundation

public struct ProtocolProbeConfiguration: Equatable, Sendable {
    public static let defaultUploadPath = "/probe/photo"

    public let uploadURL: URL

    public init?(
        baseURLString: String,
        uploadPath: String = ProtocolProbeConfiguration.defaultUploadPath
    ) {
        guard !uploadPath.contains("?"),
              !uploadPath.contains("#"),
              !uploadPath.split(separator: "/").contains(".."),
              var components = URLComponents(string: baseURLString),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(),
              !host.isEmpty,
              host != "example.invalid",
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil else {
            return nil
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let relativeUploadPath = uploadPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !relativeUploadPath.isEmpty else {
            return nil
        }

        components.path = "/" + [basePath, relativeUploadPath]
            .filter { !$0.isEmpty }
            .joined(separator: "/")

        guard let uploadURL = components.url else {
            return nil
        }

        self.uploadURL = uploadURL
    }
}

public struct ProtocolProbeInsertedAsset: Equatable, Sendable {
    public let localIdentifier: String
    public let capturedAt: Date?

    public init(localIdentifier: String, capturedAt: Date?) {
        self.localIdentifier = localIdentifier
        self.capturedAt = capturedAt
    }
}

public enum ProtocolProbeBatchAction: Equatable, Sendable {
    case establishBaseline
    case noUpload
    case enqueue(localIdentifier: String)
}

public enum ProtocolProbeBatchPlanner {
    public static func action(
        hasPersistentChangeToken: Bool,
        insertedAssets: [ProtocolProbeInsertedAsset]
    ) -> ProtocolProbeBatchAction {
        guard hasPersistentChangeToken else {
            return .establishBaseline
        }

        guard let newestAsset = insertedAssets.max(by: isOlder) else {
            return .noUpload
        }

        return .enqueue(localIdentifier: newestAsset.localIdentifier)
    }

    private static func isOlder(
        _ lhs: ProtocolProbeInsertedAsset,
        _ rhs: ProtocolProbeInsertedAsset
    ) -> Bool {
        let lhsDate = lhs.capturedAt ?? .distantPast
        let rhsDate = rhs.capturedAt ?? .distantPast
        if lhsDate == rhsDate {
            return lhs.localIdentifier < rhs.localIdentifier
        }
        return lhsDate < rhsDate
    }
}
