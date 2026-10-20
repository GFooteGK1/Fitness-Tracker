import AppIntents
import CryptoKit
import Foundation
import Photos
import Security
import UIKit

struct LogNewCameraPhotosIntent: AppIntent {
    static var title: LocalizedStringResource { "Log New Camera Photos" }
    static var description: IntentDescription { IntentDescription("Sends new photos to approved cloud screening and creates food review drafts. Requires separate pairing and cloud consent.") }
    static var openAppWhenRun: Bool { false }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        .result(value: await CloudPhotoRuntime.shared.run())
    }
}

struct CloudPhotoPairing: Codable, Sendable {
    let token: String
    let deviceID: UUID
    let origin: URL
    let epoch: UUID
}
enum CloudPhotoKeychain {
    private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.sociusfit.automeals.cloud-pairing", kSecAttrAccount as String: "camera-v1"] }
    static func load() throws -> CloudPhotoPairing? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?; let status = SecItemCopyMatching(request as CFDictionary, &value)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = value as? Data, data.count <= 4096 else { throw CloudPhotoError.invalid }
        return try JSONDecoder().decode(CloudPhotoPairing.self, from: data)
    }
    static func save(_ pairing: CloudPhotoPairing) throws {
        var attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(pairing),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecItemNotFound { attributes.merge(query) { _, new in new }; guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw CloudPhotoError.invalid } }
        else if updated != errSecSuccess { throw CloudPhotoError.invalid }
    }
    static func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CloudPhotoError.invalid }
    }
}
private final class CloudPhotoNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

actor CloudPhotoRuntime {
    static let shared = CloudPhotoRuntime()
    private var busy = false
    private var generation = 0
    private let control = CloudPhotoControlStore(directory: URL.applicationSupportDirectory
        .appendingPathComponent("CameraCloudControl", isDirectory: true))
    private func store(_ pairing: CloudPhotoPairing) -> CloudPhotoStore {
        CloudPhotoStore(directory: URL.applicationSupportDirectory.appendingPathComponent("CameraCloud", isDirectory: true).appendingPathComponent(pairing.deviceID.uuidString, isDirectory: true))
    }
    private func current(_ pairing: CloudPhotoPairing) throws -> Bool {
        let now = try CloudPhotoKeychain.load()
        guard now?.token == pairing.token, now?.origin == pairing.origin,
              PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { return false }
        return try control.isCurrent(epoch: pairing.epoch)
    }
    func pair(originText: String, token: String, consent: Bool) async throws {
        guard !busy, consent, let origin = URL(string: originText), CloudPhotoQueue.allowedOrigin(origin),
              token.count == 101, let id = UUID(uuidString: String(token.prefix(36))), token.dropFirst(36).first == ".",
              token.suffix(64).allSatisfy({ "0123456789abcdef".contains($0) }),
              PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { throw CloudPhotoError.invalid }
        let enrollmentLease = try control.enrollmentLease()
        defer { withExtendedLifetime(enrollmentLease) {} }
        let epoch = try control.begin { guard try CloudPhotoKeychain.load() == nil else { throw CloudPhotoError.invalid } }
        busy = true; defer { busy = false }
        let pairingGeneration = generation
        let pairing = CloudPhotoPairing(token: token, deviceID: id, origin: origin, epoch: epoch)
        let identity = try await exchange(pairing, path: "/api/capture/camera")
        guard generation == pairingGeneration else { throw CloudPhotoError.disabled }
        let date = ISO8601DateFormatter(); date.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard identity["deviceId"] as? String == id.uuidString.lowercased(),
              let expiration = identity["expiresAt"] as? String, let expiresAt = date.date(from: expiration),
              let admission = identity["admittedAt"] as? String, let admittedAt = date.date(from: admission) else { throw CloudPhotoError.invalid }
        // Cloud discovery owns a fresh Photos checkpoint. The diagnostic probe
        // ledger is never read, reset or reused for cloud admission.
        let checkpoint = try NewPhotoTrackingRuntime.currentToken()
        let boundary = max(admittedAt, Date(timeIntervalSince1970: ceil(Date().timeIntervalSince1970)))
        let local = store(pairing), lease = try local.lease(); defer { withExtendedLifetime(lease) {} }
        guard try local.load() == nil else { throw CloudPhotoError.invalid }
        let queue = try CloudPhotoQueue(deviceID: id, origin: origin, enabledAt: boundary, expiresAt: expiresAt)
        let discovery = NewPhotoTrackingStore(directory: local.directory)
        guard try discovery.load() == nil else { throw CloudPhotoError.invalid }
        try discovery.save(NewPhotoTrackingLedger(token: checkpoint, at: boundary))
        guard generation == pairingGeneration else { throw CloudPhotoError.disabled }
        try local.save(queue)
        try control.activate(epoch: epoch) { try CloudPhotoKeychain.save(pairing) }
    }
    func disable() async -> String {
        generation += 1
        do {
            let pairing = try control.disable {
                let pairing = try CloudPhotoKeychain.load()
                try CloudPhotoKeychain.clear()
                return pairing
            }
            guard let pairing else { return "Cloud logging is disabled. Any in-progress pairing was cancelled." }
            do { _ = try await exchange(pairing, path: "/api/capture/camera", method: "DELETE")
                return "Cloud logging disabled locally and server access revoked." }
            catch { return "Disabled on this phone. Server revocation is unconfirmed; use Disable all camera devices in SociusFit." }
        } catch { return "Disable could not be confirmed. Stop the Shortcut and revoke this device in SociusFit." }
    }
    func run() async -> String {
        guard !busy else { return "Camera photo logging is already running." }
        busy = true; defer { busy = false }
        do {
            guard let pairing = try CloudPhotoKeychain.load(), try current(pairing) else { return "Cloud logging is disabled or full Photos access is unavailable." }
            let local = store(pairing), lease = try local.lease(); defer { withExtendedLifetime(lease) {} }
            guard var queue = try local.load(), queue.deviceID == pairing.deviceID, queue.origin == pairing.origin else { throw CloudPhotoError.invalid }
            guard queue.expiresAt > Date() else { return "Pairing expired. Disable and pair again in SociusFit." }
            let discovery = NewPhotoTrackingStore(directory: local.directory)
            let discoverySession = NewPhotoTrackingSession(store: discovery)
            _ = try await discoverySession.discover(changes: { try NewPhotoTrackingRuntime.changes(since: $0) }, resolve: { NewPhotoTrackingRuntime.resolve($0) })
            guard try current(pairing), let tracking = try discovery.load() else { return "Cloud logging stopped before delivery." }
            try queue.admit(Array(tracking.assets.values)); try local.save(queue)
            guard let next = queue.next else { return "No new eligible photos. No upload." }
            if next.phase == .submitted {
                let status = try await exchange(pairing, path: "/api/capture/camera/status?requestId=\(next.requestID.uuidString.lowercased())")
                return try reconcile(status, next: next, queue: &queue, local: local)
            }
            guard let bytes = await CloudPhotoImage.read(next.localIdentifier) else { return "Photo deferred: unavailable locally or image read timed out. No upload. Run again later." }
            guard try current(pairing) else { return "Cloud logging stopped before delivery." }
            let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
            try queue.submitted(next.localIdentifier, hash: hash); try local.save(queue) // BEFORE transport.
            let timestamp = ISO8601DateFormatter().string(from: next.capturedAt)
            let boundary = "Socius\(UUID().uuidString)"
            var body = Data()
            for (key, value) in [("requestId",next.requestID.uuidString.lowercased()),("contentHash",hash),("timestamp",timestamp)] {
                body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n".utf8))
            }
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
            body.append(bytes); body.append(Data("\r\n--\(boundary)--\r\n".utf8))
            guard try current(pairing) else { return "Cloud logging stopped; the saved identity will be reconciled, never resent." }
            let status = try await exchange(pairing, path: "/api/capture/camera/photos", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
            return try reconcile(status, next: next, queue: &queue, local: local)
        } catch CloudPhotoError.busy { return "Another camera photo run is active. No new delivery." }
        catch CloudPhotoError.full { return "Cloud queue capacity reached. Tracking and pending identities are preserved. Open the app for review." }
        catch { return "Camera logging is deferred or unconfirmed. Saved identities are preserved; run again to check status. No automatic resend." }
    }
    private func reconcile(_ status: [String: Any], next: CloudPhotoEntry, queue: inout CloudPhotoQueue, local: CloudPhotoStore) throws -> String {
        guard status["state"] as? String == "complete", status["requestId"] as? String == next.requestID.uuidString.lowercased(), let outcome = status["outcome"] as? String else {
            return "Photo request is unconfirmed. It remains pending for status checks; the image will not be resent."
        }
        try queue.complete(next.localIdentifier, requestID: next.requestID, outcome: outcome); try local.save(queue)
        let pending = queue.entries.values.filter { $0.phase != .complete }.count
        return outcome == "draft" ? "Meal draft ready for review in SociusFit. Pending photos: \(pending)." : "Screening result: \(outcome). No meal logged. Pending photos: \(pending)."
    }
    private func exchange(_ pairing: CloudPhotoPairing, path: String, method: String = "GET", body: Data? = nil, contentType: String? = nil) async throws -> [String: Any] {
        guard CloudPhotoQueue.allowedOrigin(pairing.origin), let url = URL(string: path, relativeTo: pairing.origin)?.absoluteURL, url.host == pairing.origin.host else { throw CloudPhotoError.invalid }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 115
        request.setValue("Bearer \(pairing.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept"); request.httpBody = body
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let config = URLSessionConfiguration.ephemeral; config.waitsForConnectivity = false
        config.timeoutIntervalForResource = 115; config.httpShouldSetCookies = false; config.urlCache = nil
        let session = URLSession(configuration: config, delegate: CloudPhotoNoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (stream, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw CloudPhotoError.invalid }
        var data = Data()
        for try await byte in stream { guard data.count < 32 * 1024 else { throw CloudPhotoError.invalid }; data.append(byte) }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CloudPhotoError.invalid }
        return json
    }
}

// Shared pixel-only reader; each lane retains its own consent, identity and ledger.
enum CloudPhotoImage {
    static func read(_ identifier: String) async -> Data? {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        guard let asset = assets.firstObject, asset.mediaType == .image else { return nil }
        let options = PHImageRequestOptions(); options.isNetworkAccessAllowed = false; options.deliveryMode = .highQualityFormat; options.resizeMode = .exact
        return await withCheckedContinuation { continuation in
            let completion = CloudImageCompletion(continuation)
            let requestID = PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 1200,height:1200), contentMode: .aspectFit, options: options) { image, info in
                if info?[PHImageResultIsDegradedKey] as? Bool == true { return }
                guard info?[PHImageErrorKey] == nil, info?[PHImageCancelledKey] as? Bool != true, let image, let pixels = image.cgImage,
                      pixels.width <= 2400, pixels.height <= 2400 else { completion.resolve(nil); return }
                Task { @MainActor in
                    let scale = min(1,1200/max(image.size.width,image.size.height))
                    let size = CGSize(width: image.size.width*scale,height:image.size.height*scale)
                    guard size.width>0,size.height>0 else { completion.resolve(nil); return }
                    let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
                    // Re-render pixels: do not copy the resource container, name or EXIF.
                    let normalized = UIGraphicsImageRenderer(size:size,format:format).image { _ in image.draw(in:CGRect(origin:.zero,size:size)) }
                    for quality in [0.8,0.65,0.5,0.35] {
                        if let encoded = normalized.jpegData(compressionQuality:quality),
                           let bytes = try? CloudPhotoJPEG.withoutMetadata(encoded),
                           bytes.count>=1000,bytes.count<=1024*1024 { completion.resolve(bytes); return }
                    }
                    completion.resolve(nil)
                }
            }
            DispatchQueue.global().asyncAfter(deadline:.now()+5) { if completion.resolve(nil) { PHImageManager.default().cancelImageRequest(requestID) } }
        }
    }
}
private final class CloudImageCompletion: @unchecked Sendable {
    private let lock = NSLock(); private var continuation: CheckedContinuation<Data?,Never>?
    init(_ continuation: CheckedContinuation<Data?,Never>) { self.continuation = continuation }
    @discardableResult func resolve(_ bytes: Data?) -> Bool {
        lock.lock(); let pending = continuation; continuation = nil; lock.unlock()
        guard let pending else { return false }; pending.resume(returning:bytes); return true
    }
}
