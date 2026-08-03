import ExtensionFoundation
import Photos

@main
final class BackgroundUploadExtension: PHBackgroundResourceUploadExtension {
    required init() {}

    func process() -> PHBackgroundResourceUploadProcessingResult {
        // Phase 1 compile harness only. No resource discovery, classification,
        // download, or upload occurs until the physical-device gate is ready.
        .completed
    }

    func notifyTermination() {
        // No work exists to cancel in the compile-only harness.
    }
}
