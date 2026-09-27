import ExtensionFoundation
import Foundation
import OSLog
import Photos

@main
final class BackgroundUploadExtension: PHBackgroundResourceUploadExtension {
    private let log = Logger(subsystem: "com.example.photouploadprobe", category: "Lifecycle")

    required init() {
        log.notice("Photo upload probe extension initialized")
        guard let defaults = ProbeState.defaults() else {
            log.error("Photo upload probe App Group unavailable")
            return
        }
        defaults.set(Date().timeIntervalSince1970, forKey: "initialized")
    }

    func process() -> PHBackgroundResourceUploadProcessingResult {
        log.notice("Photo upload probe process entered")
        guard let defaults = ProbeState.defaults() else { return .failure }
        defaults.set(defaults.integer(forKey: "calls") + 1, forKey: "calls")
        return .completed
    }

    func notifyTermination() { log.notice("Photo upload probe termination requested") }
}
