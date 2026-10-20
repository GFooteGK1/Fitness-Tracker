import AppIntents
import Foundation
import Photos
import Security
import UniformTypeIdentifiers

struct PrepareNextEstimateCaptureIntent: AppIntent {
    static var title: LocalizedStringResource { "Prepare Next Estimate Capture" }
    static var description: IntentDescription { "Freezes one new photo's identity for your chosen ChatGPT action. No upload or inference." }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
    func perform() async throws -> some IntentResult & ReturnsValue<String> { .result(value: try await ExternalEstimateRuntime.shared.prepare()) }
}
struct GetPreparedEstimatePhotoIntent: AppIntent {
    static var title: LocalizedStringResource { "Get Prepared Estimate Photo" }
    static var description: IntentDescription { "Returns the exact prepared JPEG once. The capture ID and hash stay bound to those pixels." }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
    @Parameter(title: "Capture ID") var requestID: String
    func perform() async throws -> some IntentResult & ReturnsValue<IntentFile> {
        let bytes = try await ExternalEstimateRuntime.shared.image(requestID)
        return .result(value: IntentFile(data: bytes, filename: "photo.jpg", type: .jpeg))
    }
}
struct ImportExternalFoodEstimateIntent: AppIntent {
    static var title: LocalizedStringResource { "Import External Food Estimate" }
    static var description: IntentDescription { "Submits structured external output as an unreviewed estimate draft. Separate import authority is required." }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
    @Parameter(title: "Capture ID") var requestID: String
    @Parameter(title: "Estimate JSON") var estimateJSON: String
    func perform() async throws -> some IntentResult & ReturnsValue<String> { .result(value: try await ExternalEstimateRuntime.shared.submit(requestID, estimateJSON: estimateJSON)) }
}
struct ReadExternalEstimateCaptureIntent: AppIntent {
    static var title: LocalizedStringResource { "Read External Estimate Capture" }
    static var description: IntentDescription { "Reads the original capture result without resending the image or estimate." }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
    @Parameter(title: "Capture ID") var requestID: String
    func perform() async throws -> some IntentResult & ReturnsValue<String> { .result(value: try await ExternalEstimateRuntime.shared.status(requestID)) }
}
private struct EstimateImportConfiguration: Codable, Equatable, Sendable {
    let origin: URL; let token: String
    var isValid: Bool {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        return CloudPhotoQueue.allowedOrigin(origin) && parts.count == 3 && parts[0] == "external-estimate-v1" &&
            UUID(uuidString: String(parts[1]))?.uuidString.lowercased() == String(parts[1]) &&
            parts[2].count == 64 && parts[2].allSatisfy { "0123456789abcdef".contains($0) }
    }
}
private enum EstimateImportKeychain {
    private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.sociusfit.automeals.external-estimate", kSecAttrAccount as String: "external-estimate-v1"] }
    static func load() throws -> EstimateImportConfiguration? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?; let status = SecItemCopyMatching(request as CFDictionary, &value)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = value as? Data, data.count <= 4096,
              let configuration = try? JSONDecoder().decode(EstimateImportConfiguration.self, from: data), configuration.isValid else { throw EstimateHandoffError.invalid }
        return configuration
    }
    static func save(_ configuration: EstimateImportConfiguration) throws {
        guard configuration.isValid else { throw EstimateHandoffError.invalid }
        // No replacement across accounts/grants. Existing camera credentials are untouched.
        if let previous = try load() {
            guard previous == configuration else { throw EstimateHandoffError.invalid }; return
        }
        var attributes = query
        attributes[kSecValueData as String] = try JSONEncoder().encode(configuration)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw EstimateHandoffError.invalid }
    }
}
private final class EstimateNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
actor ExternalEstimateRuntime {
    static let shared = ExternalEstimateRuntime()
    private let directory = URL.applicationSupportDirectory.appendingPathComponent("ExternalEstimateHandoff", isDirectory: true)
    private var busy = false
    private var store: EstimateHandoffStore { EstimateHandoffStore(directory: directory) }
    private var control: CloudPhotoControlStore { CloudPhotoControlStore(directory: directory.appendingPathComponent("control", isDirectory: true)) }
    private var discovery: NewPhotoTrackingStore { NewPhotoTrackingStore(directory: directory.appendingPathComponent("discovery", isDirectory: true)) }
    private func active(_ ledger: EstimateHandoffLedger) throws {
        guard ledger.enabled, try control.isCurrent(epoch: ledger.epoch), PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { throw EstimateHandoffError.disabled }
    }
    func enable(consent: Bool) throws {
        guard !busy, consent, PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { throw EstimateHandoffError.disabled }
        let enrollment = try control.enrollmentLease(); defer { withExtendedLifetime(enrollment) {} }
        let lease = try store.lease(); defer { withExtendedLifetime(lease) {} }
        let epoch = try control.begin {}
        let boundary = Date(timeIntervalSince1970: ceil(Date().timeIntervalSince1970))
        var ledger = try store.load() ?? EstimateHandoffLedger(epoch: epoch, at: boundary)
        if try discovery.load() == nil {
            guard ledger.entries.isEmpty else { throw EstimateHandoffError.invalid }
            try discovery.save(NewPhotoTrackingLedger(token: NewPhotoTrackingRuntime.currentToken(), at: boundary))
        }
        ledger.epoch = epoch; ledger.enabled = true; ledger.admissionBoundary = boundary
        try control.activate(epoch: epoch) { try store.save(ledger) }
    }
    func disable() throws { try control.disable {} }
    func configure(origin: String, token: String) throws {
        guard !busy, let url = URL(string: origin) else { throw EstimateHandoffError.invalid }
        try EstimateImportKeychain.save(EstimateImportConfiguration(origin: url, token: token))
    }
    private func summary(_ entry: EstimateHandoffEntry) throws -> String {
        struct Summary: Encodable { let schemaVersion = 1; let state: String; let capture: EstimateCaptureEnvelope }
        let data = try JSONEncoder().encode(Summary(state: entry.phase.rawValue, capture: entry.capture))
        guard let text = String(data: data, encoding: .utf8) else { throw EstimateHandoffError.invalid }; return text
    }
    func prepare() async throws -> String {
        guard !busy else { throw CloudPhotoError.busy }; busy = true; defer { busy = false }
        let lease = try store.lease(); defer { withExtendedLifetime(lease) {} }
        guard var ledger = try store.load() else { throw EstimateHandoffError.disabled }; try active(ledger)
        if let pending = ledger.pending { return try summary(pending) }
        let tracker = NewPhotoTrackingSession(store: discovery)
        _ = try await tracker.discover(changes: { try NewPhotoTrackingRuntime.changes(since: $0) }, resolve: { NewPhotoTrackingRuntime.resolve($0) })
        try active(ledger)
        guard let tracked = try discovery.load() else { throw EstimateHandoffError.invalid }
        let candidates = tracked.assets.values.filter { asset in
            asset.kind == .stillPhoto && asset.capturedAt.map { $0 >= ledger.admissionBoundary } == true && ledger.entries[asset.localIdentifier] == nil
        }.sorted { ($0.capturedAt!, $0.localIdentifier) < ($1.capturedAt!, $1.localIdentifier) }
        guard let next = candidates.first else { return "{\"schemaVersion\":1,\"state\":\"no_new_eligible_photo\"}" }
        guard let bytes = await CloudPhotoImage.read(next.localIdentifier) else { throw EstimateHandoffError.changedImage }
        try active(ledger)
        let entry = try ledger.prepare(asset: next, bytes: bytes)
        try store.save(ledger) // Durable identity exists before any image leaves this boundary.
        return try summary(entry)
    }
    func image(_ id: String) async throws -> Data {
        guard !busy else { throw CloudPhotoError.busy }; busy = true; defer { busy = false }
        let lease = try store.lease(); defer { withExtendedLifetime(lease) {} }
        guard var ledger = try store.load() else { throw EstimateHandoffError.disabled }; try active(ledger)
        let entry = try ledger.entry(id)
        guard entry.phase == .prepared else { throw EstimateHandoffError.awaitingEstimate }
        guard let bytes = await CloudPhotoImage.read(entry.localIdentifier) else { throw EstimateHandoffError.changedImage }
        try active(ledger); try ledger.handOff(id, bytes: bytes); try store.save(ledger)
        return bytes
    }
    func submit(_ id: String, estimateJSON: String) async throws -> String {
        guard !busy else { throw CloudPhotoError.busy }; busy = true; defer { busy = false }
        let lease = try store.lease(); defer { withExtendedLifetime(lease) {} }
        guard var ledger = try store.load() else { throw EstimateHandoffError.disabled }; try active(ledger)
        var entry = try ledger.entry(id)
        if let previous = entry.estimateJSON, previous != estimateJSON { throw EstimateHandoffError.invalid }
        if let receipt = entry.receiptJSON { return receipt }
        guard let configuration = try EstimateImportKeychain.load() else { throw EstimateHandoffError.disabled }
        if entry.phase == .importSubmitted { return try await readback(entry, ledger: &ledger, configuration: configuration) }
        struct Submission: Encodable { let schemaVersion = 1; let capture: EstimateCaptureEnvelope; let estimateJSON: String }
        let body = try JSONEncoder().encode(Submission(capture: entry.capture, estimateJSON: estimateJSON))
        guard body.count <= 64 * 1024 else { throw EstimateHandoffError.invalid }
        try ledger.submit(id, estimateJSON: estimateJSON); try store.save(ledger); entry = try ledger.entry(id)
        try active(ledger)
        let response = try await exchange(configuration, method: "POST", body: body)
        try active(ledger); try ledger.complete(id, receiptJSON: response); try store.save(ledger)
        return response
    }
    func status(_ id: String) async throws -> String {
        guard !busy else { throw CloudPhotoError.busy }; busy = true; defer { busy = false }
        let lease = try store.lease(); defer { withExtendedLifetime(lease) {} }
        guard var ledger = try store.load() else { throw EstimateHandoffError.disabled }; try active(ledger)
        let entry = try ledger.entry(id)
        if let receipt = entry.receiptJSON { return receipt }
        if entry.phase != .importSubmitted { return try summary(entry) }
        guard let configuration = try EstimateImportKeychain.load() else { throw EstimateHandoffError.disabled }
        return try await readback(entry, ledger: &ledger, configuration: configuration)
    }
    private func readback(_ entry: EstimateHandoffEntry, ledger: inout EstimateHandoffLedger, configuration: EstimateImportConfiguration) async throws -> String {
        let response = try await exchange(configuration, requestID: entry.capture.requestId)
        try active(ledger)
        // Absence is not permission to resend. Pending identities remain intact.
        if let bytes = response.data(using: .utf8), let result = try? JSONDecoder().decode(EstimateImportReceipt.self, from: bytes), result.state == "estimated_unreviewed" {
            try ledger.complete(entry.capture.requestId, receiptJSON: response); try store.save(ledger)
        } else {
            struct Absence: Decodable { let requestId: String; let state: String; let canonicalChanged: Bool }
            guard let bytes = response.data(using: .utf8), let absent = try? JSONDecoder().decode(Absence.self, from: bytes),
                  absent.requestId == entry.capture.requestId, absent.state == "not_found", absent.canonicalChanged == false else { throw EstimateHandoffError.invalid }
        }
        return response
    }
    private func exchange(_ configuration: EstimateImportConfiguration, method: String = "GET", body: Data? = nil, requestID: String? = nil) async throws -> String {
        guard configuration.isValid else { throw EstimateHandoffError.invalid }
        let path = "/api/capture/external-estimates" + (requestID.map { "?requestId=\($0)" } ?? "")
        guard let url = URL(string: path, relativeTo: configuration.origin)?.absoluteURL, url.host == configuration.origin.host else { throw EstimateHandoffError.invalid }
        var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 30
        request.setValue("Bearer \(configuration.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let options = URLSessionConfiguration.ephemeral; options.httpShouldSetCookies = false; options.urlCache = nil; options.waitsForConnectivity = false; options.timeoutIntervalForResource = 30
        let session = URLSession(configuration: options, delegate: EstimateNoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (stream, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw EstimateHandoffError.invalid }
        var data = Data()
        for try await byte in stream { guard data.count < 32 * 1024 else { throw EstimateHandoffError.invalid }; data.append(byte) }
        guard let text = String(data: data, encoding: .utf8) else { throw EstimateHandoffError.invalid }; return text
    }
}
